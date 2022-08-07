import { ActivityWorkerConfig } from "./activity-worker";
import { InvalidTaskInputError } from "./errors";
import { ActivityTask } from "./types";

export interface TaskRequest<TInput> {
  activity: ActivityWorkerConfig;
  task: ActivityTask;
  input: TInput;
}

interface ToTaskRequestParams {
  activity: ActivityWorkerConfig;
  task: ActivityTask;
}

export function toTaskRequest<TInput>(
  params: ToTaskRequestParams
): TaskRequest<TInput> {
  const { activity, task } = params;

  let input;
  try {
    input = JSON.parse(task.input ?? "");
  } catch (err) {
    throw new InvalidTaskInputError(task);
  }

  return {
    activity,
    input,
    task,
  };
}
