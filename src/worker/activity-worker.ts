import {
  GetActivityTaskCommand,
  GetActivityTaskCommandOutput,
  GetActivityTaskOutput,
  SFNClient,
} from "@aws-sdk/client-sfn";
import { AbortController } from "@aws-sdk/abort-controller";

import EventEmitter from "events";
import os from "os";
import { setTimeout } from "timers/promises";

import { NoResponseSentError } from "./errors";
import { WorkerEventEmitter } from "./events";
import { toTaskRequest } from "./request";
import { TaskResponseToolkit } from "./response";
import {
  ActivityTask,
  TaskHandler,
  WorkerExitCode,
  WorkerExitOutput,
} from "./types";

type PollingConfig = {
  /** max number of polls before stopping the worker in an errored state */
  maxAttempts: number;
  /** wait this amount of time before attempting a failed poll retry */
  intervalSeconds: number;
  backoffRate: number;
};

const DEFAULT_POLLING_CONFIG: PollingConfig = {
  intervalSeconds: 1,
  maxAttempts: 5,
  backoffRate: 1.2,
};

const DEFAULT_ON_UNHANDLED_EXCEPTION = (err: unknown) => {
  throw err;
};

export type ActivityWorkerConfig = {
  activityArn: string;
  workerName?: string;
  polling?: PollingConfig;
};

type ResolvedActivityWorkerConfig = {
  activityArn: string;
  workerName: string;
  polling: PollingConfig;
};

interface ActivityWorkerParams<TInput, TOutput> {
  config: ActivityWorkerConfig;
  handler: TaskHandler<TInput, TOutput>;

  client?: SFNClient;
  events?: WorkerEventEmitter<TInput, TOutput>;
  /**
   * Invoked if there is an unhandled task execution error
   * Defaults to throwing and stopping the worker
   */
  onUnhandledException?: (err: unknown) => void;
}

type ActivityWorkerStatus = "starting" | "running" | "stopping" | "stopped";

export class ActivityWorker<TInput, TOutput> {
  public readonly events: WorkerEventEmitter<TInput, TOutput>;
  private config: ResolvedActivityWorkerConfig;

  private client: SFNClient;
  private handler: TaskHandler<TInput, TOutput>;
  private onUnhandledException: (err: unknown) => void;

  #status: ActivityWorkerStatus;
  #shutdownSignal: AbortController;
  #failedPolls: number;
  #exitOutput?: WorkerExitOutput;

  constructor(params: ActivityWorkerParams<TInput, TOutput>) {
    this.config = {
      ...params.config,
      workerName: params.config.workerName ?? os.hostname(),
      polling: DEFAULT_POLLING_CONFIG,
    };

    this.client = params.client ?? new SFNClient({});
    this.handler = params.handler;
    this.onUnhandledException =
      params.onUnhandledException ?? DEFAULT_ON_UNHANDLED_EXCEPTION;

    this.events =
      params.events ??
      (new EventEmitter() as WorkerEventEmitter<TInput, TOutput>);

    this.#status = "stopped";
    this.#shutdownSignal = new AbortController();
    this.#failedPolls = 0;
  }

  get workerName(): string {
    return this.config.workerName;
  }

  get status(): ActivityWorkerStatus {
    return String(this.#status) as ActivityWorkerStatus;
  }

  get exitOutput(): WorkerExitOutput | null {
    return this.#exitOutput ? { ...this.#exitOutput } : null;
  }

  async start() {
    if (this.#status === "running") {
      return;
    }

    return new Promise((resolve) => {
      this.#status = "starting";

      this.events.emit("worker:starting", this);
      this.events.once("worker:running", resolve);

      process.nextTick(() =>
        this.runLoop().catch((err) => {
          return this.handleStop(WorkerExitCode.err_polling, err);
        })
      );
    });
  }

  async stop() {
    if (this.#status === "stopped") {
      return;
    }

    return this.handleStop(WorkerExitCode.success);
  }

  /** Performs a single task fetch and executes it if present */
  async runOnce() {
    // keep this outside of the try/catch so that failed polls bubble up
    const task = await this.getActivityTask();
    if (!task) {
      return;
    }

    await this.handleTask(task);
  }

  private async runLoop() {
    this.#status = "running";
    this.events.emit("worker:running", this);

    while (this.#status === "running") {
      const task = await this.getActivityTask();
      if (!task) {
        continue;
      }

      try {
        await this.handleTask(task);
      } catch (err) {
        // assuming for now that the event is sufficient here
      }
    }

    this.#status = "stopped";
    this.events.emit("worker:stopped", this, this.#exitOutput);
  }

  private async getActivityTask(): Promise<GetActivityTaskOutput | null> {
    this.events.emit("polling:starting", this);

    let task: GetActivityTaskCommandOutput;

    try {
      const cmd = new GetActivityTaskCommand(this.config);

      task = await this.client.send(cmd, {
        abortSignal: this.#shutdownSignal.signal,
      });

      this.#failedPolls = 0;

      this.events.emit("polling:success", this, task);
    } catch (err) {
      // Handled exception: shutdown signal was sent
      if (err instanceof Error && err.name === "AbortError") {
        return null;
      }

      this.#failedPolls += 1;
      const isRetriable = this.#failedPolls < this.config.polling.maxAttempts;

      this.events.emit("polling:error", this, {
        retriable: isRetriable,
        attempts: this.#failedPolls,
        err,
      });

      if (!isRetriable) {
        throw err;
      }

      const { intervalSeconds, backoffRate } = this.config.polling;
      const intervalMs = intervalSeconds * 1000;

      // 3s w/1.5 backoff rate:
      // #1: 3s (3s + (3s * 1.5 * 0))
      // #2: 4.5s (3s + (3s * 1.5 * 1))
      // #3: 12s (3s + (3s * 1.5 * 2))
      const sleepMs =
        intervalMs + intervalMs * backoffRate * (this.#failedPolls - 1);
      await setTimeout(sleepMs);

      return this.getActivityTask();
    }

    if (!task?.taskToken) {
      return null;
    }

    return task;
  }

  private async handleStop(code: number, err?: unknown) {
    this.#exitOutput = { code, err };

    return new Promise((resolve) => {
      this.#status = "stopping";

      this.events.emit("worker:stopping", this);
      this.events.once("worker:stopped", resolve);

      this.#shutdownSignal.abort();
    });
  }

  private async handleTask(task: ActivityTask) {
    const events = this.events;

    const rawTask = { worker: this, task };

    events.emit("task:received", rawTask);

    let req, h;

    try {
      req = toTaskRequest<TInput, TOutput>(rawTask);
      h = new TaskResponseToolkit<TInput, TOutput>({
        client: this.client,
        events,
        req,
        signal: this.#shutdownSignal.signal,
      });

      this.events.emit("task:start", req);

      await this.handler(req, h);

      if (!h.res) {
        throw new NoResponseSentError(req);
      }
    } catch (err) {
      events.emit("task:errored", rawTask, err);

      this.onUnhandledException(err);
    } finally {
      events.emit("task:done", rawTask);
    }
  }
}
