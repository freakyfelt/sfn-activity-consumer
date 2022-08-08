import { GetActivityTaskOutput } from "@aws-sdk/client-sfn";
import TypedEmitter from "typed-emitter";

import { ActivityWorker } from "./activity-worker";
import { TaskRequest } from "./request";
import { TaskResponse } from "./response";
import { WorkerExitOutput } from "./types";

export type RawTask<TInput, TOutput> = Omit<
  TaskRequest<TInput, TOutput>,
  "input"
>;

export const WorkerEventKeys = {
  starting: "worker:starting",
  running: "worker:running",
  stopping: "worker:stopping",
  stopped: "worker:stopped",

  error: "worker:error",
} as const;

export const PollingEventKeys = {
  starting: "polling:starting",
  success: "polling:success",
  error: "polling:error",
} as const;

export const TaskEventKeys = {
  received: "task:received",
  errored: "task:errored",
  done: "task:done",
  start: "task:start",
  heartbeat: "task:heartbeat",
  success: "task:success",
  failure: "task:failure",
} as const;

export const AllEventKeys = [
  ...Object.values(WorkerEventKeys),
  ...Object.values(PollingEventKeys),
  ...Object.values(TaskEventKeys),
] as const;

export type WorkerEvents<TInput, TOutput> = {
  [WorkerEventKeys.starting]: (worker: ActivityWorker<TInput, TOutput>) => void;
  [WorkerEventKeys.running]: (worker: ActivityWorker<TInput, TOutput>) => void;
  /** The worker is gracefully shutting down */
  [WorkerEventKeys.stopping]: (worker: ActivityWorker<TInput, TOutput>) => void;
  /** The worker is completely stopped */
  [WorkerEventKeys.stopped]: (
    worker: ActivityWorker<TInput, TOutput>,
    exit?: WorkerExitOutput
  ) => void;

  [WorkerEventKeys.error]: (
    worker: ActivityWorker<TInput, TOutput>,
    err: unknown
  ) => void;
};

type PollingErrorEventPayload = {
  retriable: boolean;
  attempts: number;
  err: unknown;
};

export type PollingEvents<TInput, TOutput> = {
  [PollingEventKeys.starting]: (
    worker: ActivityWorker<TInput, TOutput>
  ) => void;
  [PollingEventKeys.success]: (
    worker: ActivityWorker<TInput, TOutput>,
    output: GetActivityTaskOutput
  ) => void;
  [PollingEventKeys.error]: (
    worker: ActivityWorker<TInput, TOutput>,
    output: PollingErrorEventPayload
  ) => void;
};

export type TaskEvents<TInput, TOutput> = {
  /** emitted when a task is received before parsing */
  [TaskEventKeys.received]: (raw: RawTask<TInput, TOutput>) => void;
  /** emitted when an unhandled exception was thrown when processing */
  [TaskEventKeys.errored]: (
    raw: RawTask<TInput, TOutput>,
    err: unknown
  ) => void;
  /** emitted at the end of the task regardless of success or failure */
  [TaskEventKeys.done]: (raw: RawTask<TInput, TOutput>) => void;

  /** emitted after parsing but before calling the handler */
  [TaskEventKeys.start]: (req: TaskRequest<TInput, TOutput>) => void;
  [TaskEventKeys.heartbeat]: (req: TaskRequest<TInput, TOutput>) => void;
  [TaskEventKeys.success]: (
    req: TaskRequest<TInput, TOutput>,
    res: TaskResponse<TOutput>
  ) => void;
  [TaskEventKeys.failure]: (
    req: TaskRequest<TInput, TOutput>,
    res: TaskResponse<TOutput>
  ) => void;
};

export type AllEvents<TInput, TOutput> = WorkerEvents<TInput, TOutput> &
  PollingEvents<TInput, TOutput> &
  TaskEvents<TInput, TOutput>;

export type TaskEventEmitter<TInput, TOutput> = TypedEmitter<
  TaskEvents<TInput, TOutput>
>;

export type WorkerEventEmitter<TInput, TOutput> = TypedEmitter<
  AllEvents<TInput, TOutput>
>;
