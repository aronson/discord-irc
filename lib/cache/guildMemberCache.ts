import { AsyncCache } from './asyncCache.ts';
import { Guild, GuildMember } from '../deps.ts';

const TTL = 30_000;

export class GuildMemberCache extends AsyncCache<GuildMember> {
  guild: Guild;
  constructor(guild: Guild) {
    super(TTL);
    this.guild = guild;
  }
  async fetch(id: string): Promise<GuildMember> {
    return await this.guild.members.fetch(id);
  }
}
