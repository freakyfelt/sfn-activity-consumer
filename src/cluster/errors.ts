export class ClusterError extends Error {}

export class ResizeInProgressError extends ClusterError {
  constructor() {
    super("Cluster resize is in progress");

    Object.setPrototypeOf(this, ResizeInProgressError);
  }
}
