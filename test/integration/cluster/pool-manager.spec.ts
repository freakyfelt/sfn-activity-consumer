import { setTimeout } from "timers/promises";
import { PoolManager } from "../../../src/index";
import { taskHandler, TaskInput, TaskOutput } from "../../support/handler";
import { SFNTestBootstrapper } from "../../support/sfn";

const EXAMPLE_MAX_WORKERS = 3;

describe("PoolManager", () => {
  let bootstrapper: SFNTestBootstrapper;

  let activityArns: string[];

  let manager: PoolManager<TaskInput, TaskOutput>;

  beforeAll(async () => {
    bootstrapper = new SFNTestBootstrapper();

    await bootstrapper.prepare();
  });

  afterAll(async () => {
    await bootstrapper.eject();
  });

  beforeEach(() => {
    activityArns = [];

    manager = new PoolManager({
      client: bootstrapper.client,
      config: {
        activityArn: bootstrapper.activityArn,
        maxWorkers: EXAMPLE_MAX_WORKERS,
        restartIntervalMs: 100,
      },
      handler: taskHandler,
    });
  });

  afterEach(async () => {
    try {
      await manager.stop();
    } catch (err) {
      // noop
    }
    await Promise.all(
      activityArns.map((arn) => bootstrapper.stopExecution(arn))
    );
  });

  it("starts the expected number of workers", async () => {
    await manager.start();
    expect(manager.desiredCapacity).toEqual(EXAMPLE_MAX_WORKERS);
    expect(manager.currentCapacity).toEqual(EXAMPLE_MAX_WORKERS);
  });

  it("restarts workers if they fail", async () => {
    jest.setTimeout(10_000);

    activityArns.push(await bootstrapper.startExecution({ hello: "Error" }));

    await manager.start();

    // TODO replace this with a different event
    await new Promise((resolve) => {
      manager.events.once("worker:stopped", resolve);
    });
    // have to wait one tick to let the manager do its thing
    await setTimeout(1);

    expect(manager.currentCapacity).toEqual(EXAMPLE_MAX_WORKERS - 1);

    await new Promise((resolve) => {
      manager.events.once("worker:starting", resolve);
    });

    expect(manager.currentCapacity).toEqual(EXAMPLE_MAX_WORKERS);
  });
});
