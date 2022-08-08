import { SFNClient } from "@aws-sdk/client-sfn";

import assert from "assert";
import EventEmitter from "events";
import os from "os";
import { setTimeout } from "timers";
import { setTimeout as setTimeoutP } from "timers/promises";

import { generateWorkerName } from "../utils/name-utils";
import { ActivityWorker, TaskHandler } from "../worker";
import { WorkerEventEmitter } from "../worker/events";
import { ResizeInProgressError } from "./errors";

export type PoolManagerConfig = {
  activityArn: string;

  /** Name all workers with this prefix. Defaults to os.hostname() */
  workerPrefix?: string;
  /** Total number of workers to keep active */
  maxWorkers?: number;

  /** How soon after an unhandled exception should the manager attempt a resize */
  restartIntervalMs?: number;
};

type ResolvedPoolManagerConfig = {
  activityArn: string;
  workerPrefix: string;

  maxWorkers: number;
  restartIntervalMs: number;

  shutdown: {
    maxAttempts: number;
    intervalMs: number;
  };
};

export type PoolManagerParams<TInput, TOutput> = {
  client?: SFNClient;
  config: PoolManagerConfig;
  handler: TaskHandler<TInput, TOutput>;
};

type PoolManagerStatus = "stopped" | "starting" | "running" | "stopping";

/** Manages a pool of workers for a single ARN */
export class PoolManager<TInput, TOutput> {
  public readonly events: WorkerEventEmitter<TInput, TOutput>;

  private config: ResolvedPoolManagerConfig;
  private client: SFNClient;
  private handler: TaskHandler<TInput, TOutput>;

  #desiredCapacity: number;
  #status: PoolManagerStatus;
  #workers: Map<string, ActivityWorker<TInput, TOutput>>;
  /** Holds on to the timeout PID that should be rescheduled after an unhandled exception */
  #resizeTimeoutId?: ReturnType<typeof setInterval>;
  #resizeInProgress: boolean;

  constructor(params: PoolManagerParams<TInput, TOutput>) {
    const { config, handler } = params;

    this.events = new EventEmitter() as WorkerEventEmitter<TInput, TOutput>;
    this.client = params.client ?? new SFNClient({});
    this.handler = handler;

    this.config = {
      activityArn: config.activityArn,
      maxWorkers: config.maxWorkers ?? 1,
      workerPrefix: config.workerPrefix ?? os.hostname(),
      restartIntervalMs: config.restartIntervalMs ?? 2_000,
      shutdown: {
        maxAttempts: 5,
        intervalMs: 10,
      },
    };

    this.#desiredCapacity = 0;
    this.#status = "stopped";
    this.#workers = new Map();
    this.#resizeInProgress = false;
  }

  get status(): string {
    return String(this.#status);
  }

  /** sets the desiredCapacity and schedules a resize event */
  set desiredCapacity(desired: number) {
    assert(desired >= 0, "desiredCapacity must be greater than or equal to 0");

    this.#desiredCapacity = desired;

    this.scheduleResize(0);
  }

  get desiredCapacity(): number {
    return this.#desiredCapacity;
  }

  get currentCapacity(): number {
    return this.#workers.size;
  }

  async start() {
    this.#status = "starting";
    // TODO emit event

    // setting #desiredCapacity this way so we can use await on the resizePool() operation
    this.#desiredCapacity = this.config.maxWorkers;
    await this.resizePool();

    this.#status = "running";
    // TODO emit event
  }

  async stop() {
    this.#status = "stopping";

    // setting #desiredCapacity this way so we can use await on the resizePool() operation
    this.#desiredCapacity = 0;

    let remainingAttempts = this.config.shutdown.maxAttempts;

    while (this.#workers.size > 0 && remainingAttempts > 0) {
      remainingAttempts -= 1;
      clearTimeout(this.#resizeTimeoutId);

      try {
        await this.resizePool();
      } catch (err) {
        await setTimeoutP(this.config.shutdown.intervalMs);
      }
    }

    this.#status = "stopped";
    // TODO emit event
  }

  /** remove workers from the list that are not in a running state */
  private async cullWorkers() {
    const promises: Array<Promise<unknown>> = [];

    for (const [workerName, worker] of this.#workers) {
      if (["starting", "running"].includes(worker.status)) {
        // not dead yet
        continue;
      }
      promises.push(this.removeWorker(workerName));
    }

    await Promise.all(promises);
  }

  /** creates a new worker and wires it up to our event bus */
  private generateWorker() {
    const workerName = generateWorkerName({ prefix: this.config.workerPrefix });

    const worker = new ActivityWorker({
      client: this.client,
      config: {
        activityArn: this.config.activityArn,
        workerName,
      },
      events: this.events as WorkerEventEmitter<TInput, TOutput>,
      handler: this.handler,
      onUnhandledException: () => {
        this.onWorkerUnhandledRejection(workerName);
      },
    });

    return worker;
  }

  /** stops a worker by name */
  private async removeWorker(workerName: string) {
    const worker = this.#workers.get(workerName ?? "");

    assert.ok(worker, `expected worker '${workerName}' to exist`);

    await worker.stop();
    this.#workers.delete(worker.workerName);
  }

  /** looks at the desiredCapacity vs the number of actual workers and adjusts the pool */
  private async resizePool() {
    if (this.#resizeInProgress) {
      throw new ResizeInProgressError();
    }
    this.#resizeInProgress = true;

    const desired = this.#desiredCapacity;

    await this.cullWorkers();
    const promises: Array<Promise<unknown>> = [];

    if (desired === this.#workers.size) {
      return;
    } else if (this.#workers.size < desired) {
      // need to add workers

      while (this.#workers.size < desired) {
        const worker = this.generateWorker();
        this.#workers.set(worker.workerName, worker);

        promises.push(worker.start());
      }
    } else {
      // need to remove workers

      const workerNames = Array.from(this.#workers.keys());

      while (this.#workers.size > desired) {
        // For now just grabbing the first worker name from the array
        const workerName = workerNames.shift();
        if (!workerName) {
          break;
        }

        promises.push(this.removeWorker(workerName));
      }
    }

    try {
      await Promise.all(promises);
    } finally {
      this.#resizeInProgress = false;
    }
  }

  private scheduleResize(intervalMs: number) {
    clearTimeout(this.#resizeTimeoutId);

    this.#resizeTimeoutId = setTimeout(
      () => this.onResizeTimeout(),
      intervalMs
    );
  }

  private async onResizeTimeout() {
    try {
      await this.resizePool();
    } catch (err) {
      // TODO emit this somewhere that can be caught since this is on the event loop
    } finally {
      this.#resizeTimeoutId = undefined;
    }
  }

  private async onWorkerUnhandledRejection(workerName: string) {
    const worker = this.#workers.get(workerName);
    if (!worker) {
      return;
    }

    await this.removeWorker(workerName);

    if (this.#resizeTimeoutId) {
      // a resize is already scheduled, don't schedule another
      return;
    }

    this.scheduleResize(this.config.restartIntervalMs);
  }
}
