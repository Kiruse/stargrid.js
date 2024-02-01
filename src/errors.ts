export class StargridClientError extends Error {
  constructor(msg?: string) {
    super(msg);
    this.name = this.constructor.name;
  }
}

export class StargridSubscriptionError extends StargridClientError {
  constructor(public readonly id: number, public readonly message: string) {
    super(`Subscription ${id} failed: ${message}`);
  }
}
