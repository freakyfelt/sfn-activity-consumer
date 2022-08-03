import { ActivityWorker } from "../../src";
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

  beforeAll(async () => {
    bootstrapper = new SFNTestBootstrapper();
    await bootstrapper.prepare();

    worker = new ActivityWorker({
      client: bootstrapper.client,
      config: {
        activityArn: bootstrapper.activityArn,
      },
      handler: taskHandler,
    });
  });

  afterAll(async () => {
    bootstrapper.eject();
  });

  afterEach(async () => {
    if (executionArn) {
      await bootstrapper.stopExecution(executionArn);
    }
  });

  it("polls and processes tasks", async () => {
    executionArn = await bootstrapper.startExecution({ hello: "World" });
    await worker.poll();

    const status = await bootstrapper.checkExecutionStatus(executionArn);
    expect(status).toEqual("SUCCEEDED");
  });

  it("polls and sends failures", async () => {
    executionArn = await bootstrapper.startExecution({ hello: "Failure" });
    await worker.poll();

    await waitForCondition(async () => {
      const status = await bootstrapper.checkExecutionStatus(executionArn);
      return status === "FAILED";
    });
  });

  it("throws unhandled errors without sending a success or a failure", async () => {
    executionArn = await bootstrapper.startExecution({ hello: "Error" });

    await expect(worker.poll()).rejects.toThrowError(MyError);

    const status = await bootstrapper.checkExecutionStatus(executionArn);
    expect(status).toEqual("RUNNING");
  });
});
