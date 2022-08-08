import {
  ActivityWorker,
  NoResponseSentError,
  ResponseAlreadySentError,
  WorkerExitCode,
} from "../../src";
import { AllEventKeys, AllEvents } from "../../src/worker/events";
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

  // If an exception was sent to the onUnhandledRejection callback
  let thrownError: unknown | null;

  let emittedEvents: Record<
    keyof AllEvents<TaskInput, TaskOutput>,
    Array<unknown>
  >;
  let orderedEventKeys: Array<keyof AllEvents<unknown, unknown>>;

  beforeAll(async () => {
    bootstrapper = new SFNTestBootstrapper();
    await bootstrapper.prepare();
  });

  afterAll(async () => {
    bootstrapper.eject();
  });

  beforeEach(() => {
    thrownError = null;

    worker = new ActivityWorker({
      client: bootstrapper.client,
      config: {
        activityArn: bootstrapper.activityArn,
        polling: {
          maxAttempts: 1,
          backoffRate: 1.0,
          intervalSeconds: 0.1,
        },
      },
      handler: taskHandler,
      // test overriding the thrown exception handler
      onUnhandledException: (err) => {
        thrownError = err;
      },
    });
    worker.events.once("task:received", ({ task }) => {
      taskToken = task.taskToken;
    });

    orderedEventKeys = [];
    emittedEvents = Object.values(AllEventKeys).reduce((acc, event) => {
      acc[event] = [];
      worker.events.on(event, (...args: Array<unknown>) => {
        orderedEventKeys.push(event);
        emittedEvents[event].push(args);
      });

      return acc;
    }, {} as any);
  });

  afterEach(async () => {
    if (executionArn) {
      await bootstrapper.stopExecution(executionArn, taskToken);
    }
    await worker.stop();
  });

  describe("lifecycle methods", () => {
    it("waits to start and stop", async () => {
      const startupEvents = [
        "worker:starting",
        "worker:running",
        "polling:starting",
      ];
      const shutdownEvents = ["worker:stopping", "worker:stopped"];

      await worker.start();
      expect(worker.status).toEqual("running");
      expect(orderedEventKeys).toEqual(startupEvents);

      const stoppingAt = Date.now();
      await worker.stop();
      const stopDurationMs = Date.now() - stoppingAt;

      expect(worker.status).toEqual("stopped");
      expect(worker.exitOutput).toEqual({ code: WorkerExitCode.success });
      expect(orderedEventKeys).toEqual([...startupEvents, ...shutdownEvents]);
      // Ensure that we are using our stop signal
      expect(stopDurationMs).toBeLessThan(10_000);
    });
  });

  describe("runOnce", () => {
    it("polls and processes tasks", async () => {
      executionArn = await bootstrapper.startExecution({ hello: "World" });
      await worker.runOnce();

      const status = await bootstrapper.checkExecutionStatus(executionArn);
      expect(status).toEqual("SUCCEEDED");

      expect(orderedEventKeys).toEqual([
        "polling:starting",
        "polling:success",
        "task:received",
        "task:start",
        "task:success",
        "task:done",
      ]);
    });

    it("allows for heartbeats to be sent", async () => {
      executionArn = await bootstrapper.startExecution({ hello: "Heartbeat" });

      await worker.runOnce();

      const status = await bootstrapper.checkExecutionStatus(executionArn);
      expect(status).toEqual("SUCCEEDED");

      expect(orderedEventKeys).toEqual([
        "polling:starting",
        "polling:success",
        "task:received",
        "task:start",
        "task:heartbeat",
        "task:success",
        "task:done",
      ]);
    });

    it("polls and sends failures", async () => {
      executionArn = await bootstrapper.startExecution({ hello: "Failure" });
      await worker.runOnce();

      await waitForCondition(async () => {
        const status = await bootstrapper.checkExecutionStatus(executionArn);
        return status === "FAILED";
      });

      expect(orderedEventKeys).toEqual([
        "polling:starting",
        "polling:success",
        "task:received",
        "task:start",
        "task:failure",
        "task:done",
      ]);
    });

    it("calls onUnhandledRejection if an error is thrown", async () => {
      executionArn = await bootstrapper.startExecution({ hello: "Error" });

      await worker.runOnce();

      expect(thrownError).toBeInstanceOf(MyError);

      const status = await bootstrapper.checkExecutionStatus(executionArn);
      expect(status).toEqual("RUNNING");

      expect(orderedEventKeys).toEqual([
        "polling:starting",
        "polling:success",
        "task:received",
        "task:start",
        "task:errored",
        "task:done",
      ]);
    });

    it("calls onUnhandledRejection if neither success nor failure is sent", async () => {
      executionArn = await bootstrapper.startExecution({ hello: "Forgot" });

      await worker.runOnce();

      expect(thrownError).toBeInstanceOf(NoResponseSentError);

      const status = await bootstrapper.checkExecutionStatus(executionArn);
      expect(status).toEqual("RUNNING");

      expect(orderedEventKeys).toEqual([
        "polling:starting",
        "polling:success",
        "task:received",
        "task:start",
        "task:errored",
        "task:done",
      ]);
    });

    it("calls onUnhandledRejection if multiple success/failure responses are sent", async () => {
      executionArn = await bootstrapper.startExecution({ hello: "Duplicate" });

      await worker.runOnce();
      expect(thrownError).toBeInstanceOf(ResponseAlreadySentError);

      const status = await bootstrapper.checkExecutionStatus(executionArn);
      expect(status).toEqual("SUCCEEDED");

      expect(orderedEventKeys).toEqual([
        "polling:starting",
        "polling:success",
        "task:received",
        "task:start",
        "task:success",
        "task:errored",
        "task:done",
      ]);
    });
  });
});
