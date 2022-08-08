import os from "os";

export const randomStr = (len: number): string =>
  Math.random()
    .toString(36)
    .replace(/[^a-z]+/g, "")
    .slice(0, len);

type GenerateWorkerNameParams = {
  prefix?: string;
  postfixLength?: number;
};

/** the default prefix for worker names */
const DEFAULT_PREFIX = os.hostname();
/** how many random characters to append */
const DEFAULT_POSTFIX_LEN = 5;

/** creates a unique worker name  */
export const generateWorkerName = ({
  prefix,
  postfixLength,
}: GenerateWorkerNameParams = {}) =>
  [
    prefix ?? DEFAULT_PREFIX,
    randomStr(postfixLength ?? DEFAULT_POSTFIX_LEN),
  ].join(":");
