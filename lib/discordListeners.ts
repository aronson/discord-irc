import Bot from './bot.ts';
import { escapeMarkdown } from './helpers.ts';
import { Message } from './deps.ts';

export function createDiscordReadyListener(bot: Bot) {
  return () => {
    bot.logger.done('Connected to Discord');
  };
}

export function createDiscordErrorListener(bot: Bot) {
  return (error: Error) => {
    bot.logger.error(
      `Received error event from Discord\n${JSON.stringify(error, null, 2)}`,
    );
  };
}

export function createDiscordWarningListener(bot: Bot) {
  return (warning: string) => {
    bot.logger.warn(
      `Received warn event from Discord\n${JSON.stringify(warning, null, 2)}`,
    );
  };
}

export function createDiscordMessageListener(bot: Bot) {
  return async (message: Message) => {
    // Show the IRC channel's /names list when asked for in Discord
    if (message.content.toLowerCase() === '/names') {
      if (!message.channel.isGuildText()) return;
      // return early if message was in channel we don't post to
      if (!(bot.channelMapping?.discordIdToMapping.get(message.channel.id))) {
        return;
      }
      const ircChannel = bot.channelMapping?.discordIdToMapping.get(message.channel.id)?.ircChannel;
      if (!ircChannel) return;
      if (bot.channelUsers[ircChannel]) {
        const ircNames = bot.channelUsers[ircChannel].values();
        const ircNamesArr = new Array(...ircNames);
        await bot.sendExactToDiscord(
          ircChannel,
          `Users in ${ircChannel}\n> ${
            ircNamesArr
              .map(escapeMarkdown) //TODO: Switch to discord.js escape markdown
              .join(', ')
          }`,
        );
      } else {
        bot.logger.warn(
          `No channelUsers found for ${ircChannel} when /names requested`,
        );
        // Pass the command through if channelUsers is empty
        await bot.sendToIRC(message);
      }
    } else {
      // Ignore bot messages and people leaving/joining
      await bot.sendToIRC(message);
    }
  };
}

const ignoreMessages = [/Heartbeat ack/, /heartbeat sent/];

function containsIgnoredMessage(str: string): boolean {
  return ignoreMessages.some((regex) => regex.test(str));
}

export function createDiscordDebugListener(bot: Bot) {
  return (message: string) => {
    if (!bot.verbose && containsIgnoredMessage(message)) {
      return;
    }
    bot.debug &&
      bot.logger.debug(
        `Received debug event from Discord: ${JSON.stringify(message, null, 2)}`,
      );
  };
}
