import { ActivityWorker } from "./activity-worker";
import { InvalidTaskInputError } from "./errors";
import { RawTask } from "./events";
import { ActivityTask } from "./types";

export interface TaskRequest<TInput, TOutput> {
  worker: ActivityWorker<TInput, TOutput>;
  task: ActivityTask;
  input: TInput;
}

export function toTaskRequest<TInput, TOutput>(
  params: RawTask<TInput, TOutput>
): TaskRequest<TInput, TOutput> {
  const { worker, task } = params;

  let input;
  try {
    input = JSON.parse(task.input ?? "");
  } catch (err) {
    throw new InvalidTaskInputError(task);
  }

  return {
    worker,
    input,
    task,
  };
}
