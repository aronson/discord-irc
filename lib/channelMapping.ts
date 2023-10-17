import Bot from './bot.ts';
import { Config } from './config.ts';
import { Client, GuildTextChannel, Webhook } from './deps.ts';

type Hook = {
  id: string;
  client: Webhook;
};

export type ChannelMapping = {
  discordChannel: GuildTextChannel;
  ircChannel: string;
  ircPassword?: string;
  webhook?: Hook;
};

export class ChannelMapper {
  mappings: ChannelMapping[] = [];
  webhooks: Hook[] = [];
  discordIdToMapping: Map<string, ChannelMapping> = new Map<string, ChannelMapping>();
  ircNameToMapping: Map<string, ChannelMapping> = new Map<string, ChannelMapping>();

  public static CreateAsync = async (config: Config, bot: Bot, discord: Client) => {
    const me = new ChannelMapper();

    for (const [discordChannelNameOrId, ircChannelNameAndOrPassword] of Object.entries(config.channelMapping)) {
      const [ircChannelName, ircChannelPassword] = this.parseChannelString(ircChannelNameAndOrPassword);
      const discordChannel = await this.findDiscordChannel(discordChannelNameOrId, discord);
      if (!discordChannel) {
        bot.logger.error(
          `Could not find discord channel ${discordChannelNameOrId}! Messages to this channel will not be sent`,
        );
        continue;
      }
      if (!discordChannel.isGuildText()) {
        bot.logger.error(
          `Discord channel ${discordChannelNameOrId} is not a GuildText channel! Messages to this channel will not be sent`,
        );
        continue;
      }
      // Check for webhook
      let webhookURL: string | null = null;
      if (config.webhooks) {
        if (config.webhooks['#' + discordChannel.name]) {
          webhookURL = config.webhooks['#' + discordChannel.name];
        } else if (config.webhooks[discordChannel.id]) {
          webhookURL = config.webhooks[discordChannel.id];
        }
      }
      let client: Webhook | null = null;
      if (webhookURL) {
        client = await Webhook.fromURL(webhookURL, discord);
      }
      const mapping: ChannelMapping = {
        discordChannel: discordChannel,
        ircChannel: ircChannelName,
        ircPassword: ircChannelPassword,
      };
      if (webhookURL && client) {
        const [id, _] = webhookURL.split('/').slice(-2);
        const hook = { id, client };
        mapping.webhook = hook;
        me.webhooks.push(hook);
      }
      me.mappings.push(mapping);
      me.discordIdToMapping.set(discordChannel.id, mapping);
      me.ircNameToMapping.set(ircChannelName, mapping);
    }
    return me;
  };

  private static parseChannelString(channelString: string): [string, string?] {
    const regex = /^#(.*)(?:\s(.*))?$/;
    const match = regex.exec(channelString);

    if (match) {
      const channelName = match[1];
      const channelPassword = match[2]; // This will be undefined if no password is present
      return [channelName, channelPassword];
    } else {
      throw new Error(`Invalid IRC channel string: ${channelString}`);
    }
  }

  private static async findDiscordChannel(discordChannelName: string, discord: Client) {
    const discordChannel = await discord.channels.get(discordChannelName);

    if (!discordChannel && discordChannelName.startsWith('#')) {
      const channels = await discord.channels.array();
      const channel = channels.find(
        (c) =>
          c.isGuildText() &&
          c.name === discordChannelName.slice(1),
      );
      return channel;
    }
    return discordChannel;
  }
}
