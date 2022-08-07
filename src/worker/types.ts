import { GetActivityTaskOutput } from "@aws-sdk/client-sfn";
import { Ensure } from "../types";
import { TaskRequest } from "./request";
import { TaskResponseToolkit } from "./response";

export type ActivityTask = Ensure<GetActivityTaskOutput, "taskToken" | "input">;

export type TaskHandler<TInput, TOutput> = (
  req: TaskRequest<TInput, TOutput>,
  res: TaskResponseToolkit<TInput, TOutput>
) => Promise<void>;

export const WorkerExitCode = {
  success: 0,
  err_polling: 10,
} as const;

export type WorkerExitOutput = {
  code: number;
  err?: unknown;
};
