import Bot from './bot.ts';
import { Config } from './config.ts';
import { Client, GuildTextChannel, Webhook } from './deps.ts';
import { Dictionary } from './helpers.ts';

type Hook = {
  id: string;
  client: Webhook;
};

type ChannelMapping = {
  discordChannel: GuildTextChannel;
  ircChannel: string;
  webhook?: Hook;
};

export class ChannelMapper {
  mappings: ChannelMapping[] = [];
  webhooks: Hook[] = [];
  discordIdToMapping: Dictionary<ChannelMapping> = {};
  ircNameToMapping: Dictionary<ChannelMapping> = {};

  public static CreateAsync = async (config: Config, bot: Bot, discord: Client) => {
    const me = new ChannelMapper();

    for (const [discordChannelNameOrId, ircChannelName] of Object.entries(config.channelMapping)) {
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
      };
      if (webhookURL && client) {
        const [id, _] = webhookURL.split('/').slice(-2);
        const hook = { id, client };
        mapping.webhook = hook;
        me.webhooks.push(hook);
      }
      me.mappings.push(mapping);
      me.discordIdToMapping[discordChannel.id] = mapping;
      me.ircNameToMapping[ircChannelName] = mapping;
    }
    return me;
  };

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
