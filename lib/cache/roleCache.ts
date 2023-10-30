import { Guild, Role } from '../deps.ts';
import { AsyncCache, AsyncKeyStoreCache } from './asyncCache.ts';
import { GuildMemberCache } from './memberCache.ts';

const TTL = 30_000;
export class MemberRoleCache extends AsyncKeyStoreCache<Role[]> {
  private memberCache: GuildMemberCache;
  constructor(memberCache: GuildMemberCache) {
    super(TTL);
    this.memberCache = memberCache;
  }
  protected async fetch(id: string): Promise<Role[]> {
    const member = await this.memberCache.get(id);
    return await member.roles.array();
  }
}

export class GuildRoleCache extends AsyncKeyStoreCache<Role | undefined> {
  private guild: Guild;
  constructor(guild: Guild) {
    super(TTL);
    this.guild = guild;
  }
  protected async fetch(id: string): Promise<Role | undefined> {
    return await this.guild.roles.fetch(id);
  }
}

export class AllGuildRoleCache extends AsyncCache<Role[]> {
  private guild: Guild;
  constructor(guild: Guild) {
    super(TTL);
    this.guild = guild;
  }
  protected async fetch(): Promise<Role[]> {
    return await this.guild.roles.fetchAll();
  }
}
