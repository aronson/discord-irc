import { TTL } from '../deps.ts';

export abstract class AsyncKeyStoreCache<T> {
  private ttl: TTL<T>;

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

export abstract class AsyncCache<T> {
  private ttl: TTL<T>;

  constructor(ttlMilliseconds: number) {
    this.ttl = new TTL<T>(ttlMilliseconds);
  }

  protected abstract fetch(id: string): Promise<T>;

  async get() {
    let result = this.ttl.get('guild');
    if (result) return result;
    result = await this.fetch('guild');
    this.ttl.set('', result);
    return result;
  }

  set(val: T) {
    this.ttl.set('guild', val);
  }
}
