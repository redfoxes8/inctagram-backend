export class TestClock {
  private now: Date;
  constructor(seed?: string | number | Date) {
    this.now = seed ? new Date(seed) : new Date(0);
  }
  nowIso() {
    return this.now.toISOString();
  }
  advance(ms: number) {
    this.now = new Date(this.now.getTime() + ms);
  }
}
