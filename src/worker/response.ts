import {
  SendTaskFailureCommand,
  SendTaskFailureCommandInput,
  SendTaskHeartbeatCommand,
  SendTaskSuccessCommand,
  SFNClient,
} from "@aws-sdk/client-sfn";
import { ResponseAlreadySentError } from "./errors";
import { TaskEventEmitter } from "./events";
import { TaskRequest } from "./request";

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

export interface TaskResponseToolkitParams<TInput, TOutput> {
  client: SFNClient;
  events: TaskEventEmitter<TInput, TOutput>;
  signal: AbortSignal;

  req: TaskRequest<TInput, TOutput>;
}

type FailureInput = Omit<SendTaskFailureCommandInput, "taskToken">;

export class TaskResponseToolkit<TInput, TOutput> {
  private client: SFNClient;
  public readonly events: TaskEventEmitter<TInput, TOutput>;
  public readonly signal: AbortSignal;

  private taskToken: string;

  #req: TaskRequest<TInput, TOutput>;
  #res: TaskResponse<TOutput> | null;

  constructor(params: TaskResponseToolkitParams<TInput, TOutput>) {
    const { client, events, req, signal } = params;

    this.client = client;
    this.events = events;
    this.signal = signal;

    // explicitly grab a copy so it can't accidentally be mutated by the handler
    this.taskToken = String(req.task.taskToken);

    this.#req = req;
    this.#res = null;
  }

  get res() {
    return this.#res;
  }

  async heartbeat() {
    await this.client.send(
      new SendTaskHeartbeatCommand({
        taskToken: this.taskToken,
      })
    );

    this.events.emit("task:heartbeat", this.#req);
  }

  async success(output: TOutput) {
    if (this.#res) {
      throw new ResponseAlreadySentError(this.#req, this.#res);
    }

    await this.client.send(
      new SendTaskSuccessCommand({
        taskToken: this.taskToken,
        output: JSON.stringify(output),
      })
    );

    this.#res = { result: "success", output };
    this.events.emit("task:success", this.#req, this.#res);
  }

  async failure({ error, cause }: FailureInput) {
    if (this.#res) {
      throw new ResponseAlreadySentError(this.#req, this.#res);
    }

    await this.client.send(
      new SendTaskFailureCommand({
        taskToken: this.taskToken,
        error,
        cause,
      })
    );

    this.#res = { result: "failure", error, cause };
    this.events.emit("task:failure", this.#req, this.#res);
  }
}
