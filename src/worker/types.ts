import { GetActivityTaskOutput } from "@aws-sdk/client-sfn";
import { Ensure } from "../types";
import { TaskRequest } from "./request";
import { TaskResponseToolkit } from "./response";

export type ActivityTask = Ensure<GetActivityTaskOutput, "taskToken" | "input">;

export type TaskHandler<TInput, TOutput> = (
  req: TaskRequest<TInput>,
  res: TaskResponseToolkit<TOutput>
) => Promise<void>;
