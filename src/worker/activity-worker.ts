import {
  GetActivityTaskCommand,
  GetActivityTaskCommandOutput,
  SFNClient,
} from "@aws-sdk/client-sfn";
import { AbortController } from "@aws-sdk/abort-controller";

import { TaskHandler } from "./types";
import { toTaskRequest } from "./request";
import { TaskResponseToolkit } from "./response";

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
  private config: ActivityWorkerConfig;

  private client: SFNClient;
  private handler: TaskHandler<TInput, TOutput>;

  #status: "starting" | "running" | "stopping" | "stopped" | "error";
  #shutdownSignal: AbortController;

  constructor(params: ActivityWorkerParams<TInput, TOutput>) {
    this.config = params.config;
    this.client = params.client ?? new SFNClient({});
    this.handler = params.handler;

    this.#status = "stopped";
    this.#shutdownSignal = new AbortController();
  }

  /** Performs a single task fetch and executes it if present */
  async poll() {
    const task = await this.pollForTask();
    if (!task) {
      return;
    }

    const req = toTaskRequest<TInput>({ activity: { ...this.config }, task });
    const h = new TaskResponseToolkit<TOutput>({ client: this.client, task });

    await this.handler(req, h);
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
