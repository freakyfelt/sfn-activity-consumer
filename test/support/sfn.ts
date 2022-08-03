import {
  CreateActivityCommand,
  CreateStateMachineCommand,
  DeleteActivityCommand,
  DeleteStateMachineCommand,
  DescribeExecutionCommand,
  SendTaskSuccessCommand,
  SFNClient,
  StartExecutionCommand,
  StopExecutionCommand,
} from "@aws-sdk/client-sfn";

import assert from "assert";

import { TaskInput } from "./handler";
import { waitForCondition } from "./wait";

const randomStr = (len = 5) =>
  Math.random()
    .toString(36)
    .replace(/[^a-z]+/g, "")
    .slice(0, len);

export const createSFNClient = () => {
  return new SFNClient({
    endpoint: process.env.SFN_ENDPOINT,
  });
};

type EnsureActivityParams = {
  activityName: string;
};
const ensureActivity = async (
  client: SFNClient,
  { activityName }: EnsureActivityParams
) => {
  const res = await client.send(
    new CreateActivityCommand({
      name: activityName,
    })
  );

  assert.ok(res.activityArn);

  return res.activityArn;
};

type EnsureStateMachineParams = {
  activityArn: string;
  stateMachineName: string;
};

const ensureStateMachine = async (
  client: SFNClient,
  { activityArn, stateMachineName }: EnsureStateMachineParams
) => {
  const cmd = new CreateStateMachineCommand({
    name: stateMachineName,
    roleArn: "arn:aws:iam::123456789012:role/DummyRole",
    definition: JSON.stringify({
      StartAt: "OurTask",
      States: {
        OurTask: {
          Type: "Task",
          Resource: activityArn,
          End: true,
        },
      },
    }),
  });

  const res = await client.send(cmd);
  const { stateMachineArn } = res;

  return stateMachineArn ?? "";
};

export class SFNTestBootstrapper {
  public client: SFNClient;
  public activityArn: string;
  public stateMachineArn: string;

  constructor() {
    this.client = createSFNClient();
    this.activityArn = "";
    this.stateMachineArn = "";
  }

  async prepare() {
    const activityName = `TestActivity-${randomStr()}`;
    const stateMachineName = `TestActivity-${randomStr()}`;

    this.activityArn = await ensureActivity(this.client, { activityName });
    this.stateMachineArn = await ensureStateMachine(this.client, {
      activityArn: this.activityArn,
      stateMachineName,
    });
  }

  async eject() {
    await this.client.send(
      new DeleteStateMachineCommand({
        stateMachineArn: this.stateMachineArn,
      })
    );
    await this.client.send(
      new DeleteActivityCommand({
        activityArn: this.activityArn,
      })
    );
  }

  async startExecution(input: TaskInput) {
    const cmd = new StartExecutionCommand({
      stateMachineArn: this.stateMachineArn,
      input: JSON.stringify(input),
    });

    const { executionArn } = await this.client.send(cmd);

    return executionArn ?? "";
  }

  async stopExecution(executionArn: string, taskToken?: string) {
    await this.client.send(new StopExecutionCommand({ executionArn }));

    await waitForCondition(async () => {
      const status = await this.checkExecutionStatus(executionArn);
      return status !== "RUNNING";
    });

    if (taskToken) {
      try {
        await this.client.send(
          new SendTaskSuccessCommand({ taskToken, output: "{}" })
        );
      } catch (err) {
        // noop as closed tasks will throw a 'Task Timed Out' error
      }
    }
  }

  async checkExecutionStatus(executionArn: string) {
    const { status } = await this.client.send(
      new DescribeExecutionCommand({ executionArn })
    );

    return status;
  }
}
