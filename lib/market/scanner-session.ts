export type ScannerOperation = {
  kind: "scan" | "restore";
  key: string;
  generation: number;
  controller: AbortController;
};

/** Ownership of asynchronous work and complete all-quality market pools. */
export class ScannerSession<T> {
  private key = "";
  private generation = 0;
  private operation: ScannerOperation | undefined;
  private pools = new Map<string, T>();

  select(key: string): T | undefined {
    if (this.key !== key) {
      this.cancel();
      this.generation += 1;
      this.key = key;
    }
    return this.pools.get(key);
  }

  begin(kind: ScannerOperation["kind"]): ScannerOperation | undefined {
    if (this.operation?.kind === "scan") return;
    this.cancel();
    this.operation = { kind, key: this.key, generation: this.generation, controller: new AbortController() };
    return this.operation;
  }

  accepts(operation: ScannerOperation): boolean {
    return this.operation === operation && operation.key === this.key &&
      operation.generation === this.generation && !operation.controller.signal.aborted;
  }

  save(operation: ScannerOperation, value: T) {
    if (this.accepts(operation)) this.pools.set(operation.key, value);
  }

  finish(operation: ScannerOperation): boolean {
    if (this.operation !== operation) return false;
    this.operation = undefined;
    return true;
  }

  cancel() {
    this.operation?.controller.abort();
    this.operation = undefined;
  }
}
