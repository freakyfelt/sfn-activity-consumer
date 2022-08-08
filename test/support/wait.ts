import assert from "assert";
import { setTimeout } from "timers/promises";

const DEFAULT_WAIT_OPTS = {
  initialWaitMs: 0,
  maxAttempts: 10,
  waitMs: 500,
};

export const waitForCondition = async (
  fn: () => Promise<boolean>,
  opts = DEFAULT_WAIT_OPTS
) => {
  if (opts.initialWaitMs > 0) {
    await setTimeout(opts.initialWaitMs);
  }

  let remainingAttempts = opts.maxAttempts;
  let isDone = false;
  while (!isDone && remainingAttempts > 0) {
    remainingAttempts -= 1;
    isDone = await fn();
  }

  if (isDone) {
    return;
  }

  assert.ok(
    isDone,
    `Wait condition not met after ${opts.maxAttempts} attempts`
  );
};
