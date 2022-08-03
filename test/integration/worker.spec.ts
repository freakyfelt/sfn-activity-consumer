import { SendTaskSuccessCommand } from "@aws-sdk/client-sfn";
import { ActivityWorker } from "../../src";
import { TaskEventKeys, TaskEvents } from "../../src/worker/events";
import {
  MyError,
  taskHandler,
  TaskInput,
  TaskOutput,
} from "../support/handler";
import { SFNTestBootstrapper } from "../support/sfn";
import { waitForCondition } from "../support/wait";

describe("ActivityWorker", () => {
  let bootstrapper: SFNTestBootstrapper;
  let worker: ActivityWorker<TaskInput, TaskOutput>;

  let executionArn: string;
  let taskToken: string | undefined;

  let events: Record<keyof TaskEvents<TaskInput, TaskOutput>, Array<any>>;

  beforeAll(async () => {
    bootstrapper = new SFNTestBootstrapper();
    await bootstrapper.prepare();
  });

  afterAll(async () => {
    bootstrapper.eject();
  });

  beforeEach(() => {
    worker = new ActivityWorker({
      client: bootstrapper.client,
      config: {
        activityArn: bootstrapper.activityArn,
      },
      handler: taskHandler,
    });
    worker.events.once("task:received", ({ task }) => {
      taskToken = task.taskToken;
    });

    events = Object.values(TaskEventKeys).reduce((acc, event) => {
      acc[event] = [];
      worker.events.on(event, (...args: any[]) => events[event].push(args));

      return acc;
    }, {} as any);
  });

  afterEach(async () => {
    if (executionArn) {
      await bootstrapper.stopExecution(executionArn, taskToken);
    }
  });

  it("polls and processes tasks", async () => {
    executionArn = await bootstrapper.startExecution({ hello: "World" });
    await worker.poll();

    const status = await bootstrapper.checkExecutionStatus(executionArn);
    expect(status).toEqual("SUCCEEDED");

    expect(events["task:received"]).toHaveLength(1);
    expect(events["task:start"]).toHaveLength(1);
    expect(events["task:success"]).toHaveLength(1);
    expect(events["task:done"]).toHaveLength(1);
  });

  it("polls and sends failures", async () => {
    executionArn = await bootstrapper.startExecution({ hello: "Failure" });
    await worker.poll();

    await waitForCondition(async () => {
      const status = await bootstrapper.checkExecutionStatus(executionArn);
      return status === "FAILED";
    });

    expect(events["task:received"]).toHaveLength(1);
    expect(events["task:start"]).toHaveLength(1);
    expect(events["task:failure"]).toHaveLength(1);
    expect(events["task:done"]).toHaveLength(1);
  });

  it("throws unhandled errors without sending a success or a failure", async () => {
    executionArn = await bootstrapper.startExecution({ hello: "Error" });

    await expect(worker.poll()).rejects.toThrowError(MyError);

    const status = await bootstrapper.checkExecutionStatus(executionArn);
    expect(status).toEqual("RUNNING");

    expect(events["task:received"]).toHaveLength(1);
    expect(events["task:start"]).toHaveLength(1);
    expect(events["task:errored"]).toHaveLength(1);
    expect(events["task:done"]).toHaveLength(1);
  });
});
