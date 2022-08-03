import {
  CreateActivityCommand,
  CreateStateMachineCommand,
  DeleteActivityCommand,
  DeleteStateMachineCommand,
  DescribeExecutionCommand,
  SFNClient,
  StartExecutionCommand,
  StopExecutionCommand,
} from "@aws-sdk/client-sfn";
import assert from "assert";
import { TaskInput } from "./handler";

export const createSFNClient = () => {
  return new SFNClient({
    endpoint: process.env.SFN_ENDPOINT,
  });
};

const ensureActivity = async (client: SFNClient) => {
  const cmd = new CreateActivityCommand({
    name: "TestActivity",
  });

  const res = await client.send(cmd);

  assert.ok(res.activityArn);

  return res.activityArn;
};

const ensureStateMachine = async (client: SFNClient, activityArn: string) => {
  const cmd = new CreateStateMachineCommand({
    name: "TestStateMachine",
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

export const prepareSFNEnvironment = async (client: SFNClient) => {
  const activityArn = await ensureActivity(client);
  const stateMachineArn = await ensureStateMachine(client, activityArn);

  return { activityArn, stateMachineArn };
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
    this.activityArn = await ensureActivity(this.client);
    this.stateMachineArn = await ensureStateMachine(
      this.client,
      this.activityArn
    );
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

  async stopExecution(executionArn: string) {
    await this.client.send(new StopExecutionCommand({ executionArn }));
  }

  async checkExecutionStatus(executionArn: string) {
    const { status } = await this.client.send(
      new DescribeExecutionCommand({ executionArn })
    );

    return status;
  }
}
