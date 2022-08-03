import { GetActivityTaskOutput } from "@aws-sdk/client-sfn";
import { TaskResponse } from "./response";

export class ActivityWorkerError extends Error {}

export class TaskRequestError extends ActivityWorkerError {}

export class InvalidTaskInputError extends TaskRequestError {
  readonly task: GetActivityTaskOutput;

  constructor(task: GetActivityTaskOutput) {
    super("Could not parse task input");

    Object.setPrototypeOf(this, InvalidTaskInputError.prototype);
    this.name = "InvalidTaskInputError";

    this.task = task;
  }
}

export class TaskResponseError extends ActivityWorkerError {}

export class ResponseAlreadySentError<
  TOutput = unknown
> extends TaskResponseError {
  readonly res: TaskResponse<TOutput>;

  constructor(res: TaskResponse<TOutput>) {
    super("Task response already sent");

    Object.setPrototypeOf(this, ResponseAlreadySentError.prototype);
    this.name = "ResponseAlreadySentError";

    this.res = res;
  }
}
