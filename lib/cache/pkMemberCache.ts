import { Config } from '../config.ts';
import { APIError, PKAPI, PKMember, Queue } from '../deps.ts';
import { delay } from '../helpers.ts';
import { AsyncKeyStoreCache } from './asyncCache.ts';

export class PKMemberCache extends AsyncKeyStoreCache<PKMember[]> {
  private pkApi?: PKAPI;
  private pkQueue?: Queue;
  constructor(config: Config) {
    super((config.pkCacheSeconds ?? 5 * 60) * 1000);
    if (config.pluralKit) {
      this.pkApi = new PKAPI();
      this.pkQueue = new Queue();
    }
  }
  protected async fetch(id: string): Promise<PKMember[]> {
    if (!this.pkApi || !this.pkQueue) return [];
    try {
      const system = await this.pkApi.getSystem({ system: id });
      const membersMap = await this.pkApi.getMembers({ system: system.id });
      return Array.from(membersMap.values());
    } catch (e) {
      if (e instanceof APIError && e.message === '429: too many requests') {
        // Ensure API requests are dispatched in single queue despite potential burst messaging
        return await this.pkQueue.push(async () => {
          // Wait one second for API to be ready
          await delay(1000);
          return await this.fetch(id);
        });
      }
      return [];
    }
  }
}
