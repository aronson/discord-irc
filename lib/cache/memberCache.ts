import { AsyncCache, AsyncKeyStoreCache } from './asyncCache.ts';
import { Guild, GuildMember } from '../deps.ts';

const TTL = 30_000;

export class GuildMemberCache extends AsyncKeyStoreCache<GuildMember> {
  private guild: Guild;
  constructor(guild: Guild) {
    super(TTL);
    this.guild = guild;
  }
  protected async fetch(id: string): Promise<GuildMember> {
    return await this.guild.members.fetch(id);
  }
}

export class AllGuildMembersCache extends AsyncCache<GuildMember[]> {
  private guild: Guild;
  constructor(guild: Guild) {
    super(TTL);
    this.guild = guild;
  }
  protected async fetch(): Promise<GuildMember[]> {
    return await this.guild.members.fetchList();
  }
}
