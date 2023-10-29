import { Guild, GuildTextChannel } from '../deps.ts';
import { AsyncCache } from './asyncCache.ts';

const TTL = 30_000;

export class GuildChannelCache extends AsyncCache<GuildTextChannel | undefined> {
  guild: Guild;
  constructor(guild: Guild) {
    super(TTL);
    this.guild = guild;
  }
  protected async fetch(id: string): Promise<GuildTextChannel | undefined> {
    const channel = await this.guild.channels.fetch(id);
    if (!channel?.isGuildText()) return undefined;
    return channel;
  }
}
