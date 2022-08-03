import { InvalidTaskInputError } from "./errors";
import { ActivityTask } from "./types";

interface ActivityConfig {
  activityArn: string;
}

export interface TaskRequest<TInput> {
  activity: ActivityConfig;
  task: ActivityTask;
  input: TInput;
}

interface ToTaskRequestParams {
  activity: ActivityConfig;
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
