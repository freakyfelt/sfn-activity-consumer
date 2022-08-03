import {
  GetActivityTaskCommand,
  GetActivityTaskCommandOutput,
  SFNClient,
} from "@aws-sdk/client-sfn";
import { AbortController } from "@aws-sdk/abort-controller";

import EventEmitter from "events";

import { NoResponseSentError } from "./errors";
import { TaskEventEmitter } from "./events";
import { toTaskRequest } from "./request";
import { TaskResponseToolkit } from "./response";
import { TaskHandler } from "./types";

type ActivityWorkerConfig = {
  activityArn: string;
  workerName?: string;
};

interface ActivityWorkerParams<TInput, TOutput> {
  config: ActivityWorkerConfig;
  handler: TaskHandler<TInput, TOutput>;

  client?: SFNClient;
}

export class ActivityWorker<TInput, TOutput> {
  public readonly events: TaskEventEmitter<TInput, TOutput>;
  private config: ActivityWorkerConfig;

  private client: SFNClient;
  private handler: TaskHandler<TInput, TOutput>;

  #status: "starting" | "running" | "stopping" | "stopped" | "error";
  #shutdownSignal: AbortController;

  constructor(params: ActivityWorkerParams<TInput, TOutput>) {
    this.config = params.config;

    this.client = params.client ?? new SFNClient({});
    this.handler = params.handler;

    this.events = new EventEmitter() as TaskEventEmitter<TInput, TOutput>;
    this.#status = "stopped";
    this.#shutdownSignal = new AbortController();
  }

  /** Performs a single task fetch and executes it if present */
  async poll() {
    const task = await this.pollForTask();
    if (!task) {
      return;
    }

    const activity = { ...this.config };
    const events = this.events;

    events.emit("task:received", { activity, task });

    let req, h;

    try {
      req = toTaskRequest<TInput>({ activity, task });
      h = new TaskResponseToolkit<TInput, TOutput>({
        client: this.client,
        events,
        req,
      });

      this.events.emit("task:start", req);

      await this.handler(req, h);
    } catch (err) {
      events.emit("task:errored", { activity, task }, err);

      throw err;
    } finally {
      events.emit("task:done", { activity, task });
    }

    const res = h.res;
    if (!res) {
      throw new NoResponseSentError(req);
    }

    if (res.result === "success") {
      events.emit("task:success", req, res);
    } else if (res.result === "failure") {
      events.emit("task:failure", req, res);
    }
  }

  private async pollForTask() {
    let task: GetActivityTaskCommandOutput;

    try {
      const cmd = new GetActivityTaskCommand(this.config);

      task = await this.client.send(cmd);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return null;
      }

      throw err;
    }

    if (!task?.taskToken) {
      return null;
    }

    return task;
  }
}
