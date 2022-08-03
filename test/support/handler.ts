import { TaskHandler } from "../../src/worker/types";

export interface TaskInput {
  hello: "Error" | "Failure" | "World";
}

export interface TaskOutput {
  greeting: string;
}

export class MyError extends TypeError {}

export const taskHandler: TaskHandler<TaskInput, TaskOutput> = async (
  req,
  h
) => {
  switch (req.input.hello) {
    case "Error":
      throw new MyError("unhandled error");
    case "Failure":
      await h.failure({
        error: "InvalidName",
        cause: "The name Failure is invalid",
      });
      return;
    default:
      await h.success({ greeting: `Hello, ${req.input.hello}` });
  }
};
