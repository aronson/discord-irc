import Bot from './bot.ts';
import { escapeMarkdown } from './helpers.ts';
import { Client, event, GatewayIntents, Message } from './deps.ts';

export class DiscordClient extends Client {
  private bot: Bot;
  constructor(bot: Bot) {
    super({
      intents: [
        GatewayIntents.GUILDS,
        GatewayIntents.GUILD_MEMBERS,
        GatewayIntents.GUILD_MESSAGES,
        GatewayIntents.MESSAGE_CONTENT,
      ],
      token: bot.config.discordToken,
    });
    this.bot = bot;
    // Reconnect event has to be hooked manually due to naming conflict
    this.on('reconnect', (shardId) => this.bot.logger.info(`Reconnected to Discord (shard ID ${shardId})`));
  }

  @event()
  ready(): void {
    this.bot.logger.done('Connected to Discord');
  }

  @event()
  error(error: Error): void {
    this.bot.logger.error('Received error event from Discord');
    console.log(error);
  }

  @event()
  async messageCreate(message: Message): Promise<void> {
    // Show the IRC channel's /names list when asked for in Discord
    if (message.content.toLowerCase() === '/names') {
      if (!message.channel.isGuildText()) return;
      // return early if message was in channel we don't post to
      if (!(this.bot.channelMapping?.discordIdToMapping.get(message.channel.id))) {
        return;
      }
      const ircChannel = this.bot.channelMapping?.discordIdToMapping.get(message.channel.id)?.ircChannel;
      if (!ircChannel) return;
      if (this.bot.channelUsers[ircChannel]) {
        const ircNames = this.bot.channelUsers[ircChannel].values();
        const ircNamesArr = new Array(...ircNames);
        await this.bot.sendExactToDiscord(
          ircChannel,
          `Users in ${ircChannel}\n> ${
            ircNamesArr
              .map(escapeMarkdown) //TODO: Switch to discord.js escape markdown
              .join(', ')
          }`,
        );
      } else {
        this.bot.logger.warn(
          `No channelUsers found for ${ircChannel} when /names requested`,
        );
        // Pass the command through if channelUsers is empty
        await this.bot.sendToIRC(message);
      }
    } else {
      // Ignore this.bot messages and people leaving/joining
      await this.bot.sendToIRC(message);
    }
  }

  @event()
  async messageUpdate(_: Message, message: Message): Promise<void> {
    if (!this.bot.config.sendMessageUpdates) return;
    await this.bot.sendToIRC(message, true);
  }

  @event()
  debug(message: string): void {
    if (!this.bot.verbose && containsIgnoredMessage(message)) {
      return;
    }
    if (!this.bot.debug) return;
    this.bot.logger.debug(
      `Received debug event from Discord: ${JSON.stringify(message, null, 2)}`,
    );
  }
}

const ignoreMessages = [/Heartbeat ack/, /heartbeat sent/];

function containsIgnoredMessage(str: string): boolean {
  return ignoreMessages.some((regex) => regex.test(str));
}
