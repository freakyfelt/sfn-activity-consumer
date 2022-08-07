# @freakyfelt/sfn-activity-consumer

Provides an event-driven AWS Step Functions activity consumer that can be used to poll for activities and execute them in a standardized fashion.

## Getting started

> **Note**
> For now this package only includes the ActivityWorker, though the other pieces shouldn't be too hard to get built in time. Pull requests are welcome :)

To get started, you will need an activity and a Step Function State Machine that uses that activity. Once in hand, you can create

Here's an example for creating an activity worker:

```ts
import { ActivityWorker } from "@freakyfelt/sfn-activity-consumer";
import os from "os";

interface TaskInput {
  hello: string;
}

interface TaskOutput {
  greeting: string;
}

const handler: TaskHandler<TaskInput, TaskOutput> = async (req, h) => {
  const greeting = `Hello, ${req.input.hello}`;

  await h.success({ greeting });
};

const worker = new ActivityWorker({
  config: { activityArn, workerName: os.getHostName() },
  handler,
});

process.on('SIGTERM', () => worker.stop().then(process.exit(0)))

worker.events.on("worker:stopped", () => {
  process.exit(worker.exitOutput.code ?? 0);
});

// In Node 18.x+ with a global async
await worker.start();
// In everything below Node 18.x
worker.start().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

## Remaining work

- [ ] Create a worker pool manager that manages the lifecycle of 1 or more workers that are polling and handling activity tasks
- [ ] Create a consumer that manages the lifecycle of pool managers (one pool per Activity ARN)
- [ ] Add basic OpenTelemetry (OTEL) spans
