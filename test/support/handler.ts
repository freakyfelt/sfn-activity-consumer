import { TaskHandler } from "../../src/worker/types";

export interface TaskInput {
  hello: "Duplicate" | "Error" | "Failure" | "Forgot" | "Heartbeat" | "World";
}

export interface TaskOutput {
  greeting: string;
}

export class MyError extends TypeError {}

export const taskHandler: TaskHandler<TaskInput, TaskOutput> = async (
  req,
  h
) => {
  const greeting = `Hello, ${req.input.hello}`;

  switch (req.input.hello) {
    case "Duplicate":
      // send a failure after success
      await h.success({ greeting });
      await h.failure({
        error: "InvalidName",
        cause: "The name Duplicate is invalid",
      });
      break;
    case "Error":
      // simulate an unhandled exception
      throw new MyError("unhandled error");
    case "Failure":
      // simulate a handled task execution failure
      await h.failure({
        error: "InvalidName",
        cause: "The name Failure is invalid",
      });
      break;
    case "Forgot":
      // simulate forgetting to send success or failure
      break;
    case "Heartbeat":
      // send a heartbeat and then send success
      await h.heartbeat();
      await h.success({ greeting });
      break;
    default:
      await h.success({ greeting });
  }
};
