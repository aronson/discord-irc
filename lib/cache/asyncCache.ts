import { TTL } from '../deps.ts';

export abstract class AsyncCache<T> {
  ttl: TTL<T>;

  constructor(ttlMilliseconds: number) {
    this.ttl = new TTL<T>(ttlMilliseconds);
  }

  protected abstract fetch(id: string): Promise<T>;

  async get(id: string) {
    let result = this.ttl.get(id);
    if (result) return result;
    result = await this.fetch(id);
    this.ttl.set(id, result);
    return result;
  }

  set(id: string, val: T) {
    this.ttl.set(id, val);
  }
}
