export class StepBudget {
  private used = 0;

  constructor(private maxSteps: number) {}

  snapshot() {
    return { used: this.used, remaining: Math.max(0, this.maxSteps - this.used), max: this.maxSteps };
  }

  consume(label: string) {
    this.used += 1;
    if (this.used > this.maxSteps) {
      throw new Error(`Step budget exceeded (${this.maxSteps}). Last step: ${label}`);
    }
  }
}

