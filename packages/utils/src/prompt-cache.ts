export interface PromptCacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class PromptCache<T> {
  private readonly store = new Map<string, PromptCacheEntry<T>>();

  constructor(private readonly ttlMs: number) {}

  public get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  public set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  public has(key: string): boolean {
    return typeof this.get(key) !== 'undefined';
  }
}
