import {
  SendTaskFailureCommand,
  SendTaskFailureCommandInput,
  SendTaskHeartbeatCommand,
  SendTaskSuccessCommand,
  SFNClient,
} from "@aws-sdk/client-sfn";
import { ResponseAlreadySentError } from "./errors";

import { ActivityTask } from "./types";

export type SuccessTaskResponse<TOutput> = {
  result: "success";
  output: TOutput;
};

export type FailureTaskResponse = {
  result: "failure";
  /** The error code of the failure. */
  error?: string;
  /** A more detailed explanation of the cause of the failure. */
  cause?: string;
};

export type TaskResponse<TOutput> =
  | SuccessTaskResponse<TOutput>
  | FailureTaskResponse;

export interface TaskResponseToolkitParams {
  client: SFNClient;
  task: ActivityTask;
}

type FailureInput = Omit<SendTaskFailureCommandInput, "taskToken">;

export class TaskResponseToolkit<TOutput> {
  private client: SFNClient;
  private task: ActivityTask;

  #res: TaskResponse<TOutput> | null;

  constructor(params: TaskResponseToolkitParams) {
    const { client, task } = params;

    this.client = client;
    this.task = task;

    this.#res = null;
  }

  get res() {
    return this.#res;
  }

  async heartbeat() {
    await this.client.send(
      new SendTaskHeartbeatCommand({
        taskToken: this.task.taskToken,
      })
    );
  }

  async success(output: TOutput) {
    if (this.#res) {
      throw new ResponseAlreadySentError(this.#res);
    }

    await this.client.send(
      new SendTaskSuccessCommand({
        taskToken: this.task.taskToken,
        output: JSON.stringify(output),
      })
    );

    this.#res = { result: "success", output };
  }

  async failure({ error, cause }: FailureInput) {
    if (this.#res) {
      throw new ResponseAlreadySentError(this.#res);
    }

    await this.client.send(
      new SendTaskFailureCommand({
        taskToken: this.task.taskToken,
        error,
        cause,
      })
    );

    this.#res = { result: "failure", error, cause };
  }
}
