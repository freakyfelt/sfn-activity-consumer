import TypedEmitter from "typed-emitter";

import { TaskRequest } from "./request";
import { TaskResponse } from "./response";

export type RawTask = Omit<TaskRequest<never>, "input">;

export const TaskEventKeys = {
  received: "task:received",
  errored: "task:errored",
  done: "task:done",
  start: "task:start",
  heartbeat: "task:heartbeat",
  success: "task:success",
  failure: "task:failure",
} as const;

export type TaskEvents<TInput, TOutput> = {
  /** emitted when a task is received before parsing */
  [TaskEventKeys.received]: (raw: RawTask) => void;
  /** emitted when an unhandled exception was thrown when processing */
  [TaskEventKeys.errored]: (raw: RawTask, err: unknown) => void;
  /** emitted at the end of the task regardless of success or failure */
  [TaskEventKeys.done]: (raw: RawTask) => void;

  /** emitted after parsing but before calling the handler */
  [TaskEventKeys.start]: (req: TaskRequest<TInput>) => void;
  [TaskEventKeys.heartbeat]: (req: TaskRequest<TInput>) => void;
  [TaskEventKeys.success]: (
    req: TaskRequest<TInput>,
    res: TaskResponse<TOutput>
  ) => void;
  [TaskEventKeys.failure]: (
    req: TaskRequest<TInput>,
    res: TaskResponse<TOutput>
  ) => void;
};

export type TaskEventEmitter<TInput, TOutput> = TypedEmitter<
  TaskEvents<TInput, TOutput>
>;
