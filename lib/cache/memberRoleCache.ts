import { Role } from '../deps.ts';
import { AsyncCache } from './asyncCache.ts';
import { GuildMemberCache } from './guildMemberCache.ts';

const TTL = 30_000;
export class MemberRoleCache extends AsyncCache<Role[]> {
  memberCache: GuildMemberCache;
  constructor(memberCache: GuildMemberCache) {
    super(TTL);
    this.memberCache = memberCache;
  }
  async fetch(id: string): Promise<Role[]> {
    const member = await this.memberCache.get(id);
    return await member.roles.array();
  }
}
