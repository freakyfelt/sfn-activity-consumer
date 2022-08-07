import { GetActivityTaskOutput } from "@aws-sdk/client-sfn";
import { TaskRequest } from "./request";
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

export class NoResponseSentError<TInput = unknown, TOutput = unknown> extends TaskResponseError {
  private req: TaskRequest<TInput, TOutput>;

  constructor(req: TaskRequest<TInput, TOutput>) {
    super("No response sent after handling");

    Object.setPrototypeOf(this, NoResponseSentError.prototype);
    this.name = "NoResponseSentError";

    this.req = req;
  }
}

export class ResponseAlreadySentError<
  TInput = unknown,
  TOutput = unknown
> extends TaskResponseError {
  readonly req: TaskRequest<TInput, TOutput>;
  readonly res: TaskResponse<TOutput>;

  constructor(req: TaskRequest<TInput, TOutput>, res: TaskResponse<TOutput>) {
    super("Task response already sent");

    Object.setPrototypeOf(this, ResponseAlreadySentError.prototype);
    this.name = "ResponseAlreadySentError";

    this.req = req;
    this.res = res;
  }
}
