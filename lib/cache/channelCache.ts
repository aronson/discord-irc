import { Guild, GuildChannel, GuildTextChannel } from '../deps.ts';
import { AsyncCache, AsyncKeyStoreCache } from './asyncCache.ts';

const TTL = 30_000;

export class GuildChannelCache extends AsyncKeyStoreCache<GuildTextChannel | undefined> {
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

export class AllGuildChannelsCache extends AsyncCache<GuildChannel[]> {
  guild: Guild;
  constructor(guild: Guild) {
    super(TTL);
    this.guild = guild;
  }
  protected async fetch(): Promise<GuildChannel[]> {
    return await this.guild.channels.array();
  }
}
