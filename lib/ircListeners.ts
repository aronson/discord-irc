import Bot from './bot.ts';
import {
  ClientError,
  CtcpActionEvent,
  InviteEvent,
  JoinEvent,
  NickEvent,
  NicklistEvent,
  NoticeEvent,
  PartEvent,
  PrivmsgEvent,
  QuitEvent,
  RegisterEvent,
} from './deps.ts';
import { forEachAsync } from './helpers.ts';

export function createIrcRegisterListener(bot: Bot) {
  return (message: RegisterEvent) => {
    try {
      bot.logger.info('Connected to IRC');
      bot.debug && bot.logger.debug(
        `Registered event:\n${JSON.stringify(message, null, 2)}`,
      );
      forEachAsync(
        bot.options.autoSendCommands ?? [],
        async (element: [any, string]) => {
          await bot.ircClient.send(...element);
        },
      );
    } catch (e) {
      bot.logger.error(e);
    }
  };
}

export function createIrcErrorListener(bot: Bot) {
  return (error: ClientError) => {
    bot.logger.error(
      `Received error event from IRC\n${JSON.stringify(error, null, 2)}`,
    );
  };
}

export function createIrcPrivMessageListener(bot: Bot) {
  return async (event: PrivmsgEvent) => {
    try {
      await bot.sendToDiscord(
        event.source?.name ?? '',
        event.params.target,
        event.params.text,
      );
    } catch (e) {
      bot.logger.error(e);
    }
  };
}

export function createIrcNoticeListener(bot: Bot) {
  return (event: NoticeEvent) => {
    bot.debug &&
      bot.logger.debug(
        `Received notice:\n${JSON.stringify(event.params.text)}`,
      );
  };
}

export function createIrcNickListener(bot: Bot) {
  return (event: NickEvent) => {
    try {
      Object.values(bot.channelMapping).forEach((channelName) => {
        const channel = channelName.toLowerCase();
        const newNick = event.params.nick;
        const oldNick = event.source?.name ?? '';
        if (bot.channelUsers[channelName]) {
          let users = bot.channelUsers[channel];
          const index = users.indexOf(oldNick);
          if (index !== -1) {
            users = users.splice(index, 1);
            users.push(newNick);
            if (!bot.options.ircStatusNotices) return;
            bot.sendExactToDiscord(
              channel,
              `*${oldNick}* is now known as ${newNick}`,
            );
          }
        } else {
          bot.logger.warn(
            `No channelUsers found for ${channel} when ${oldNick} changed.`,
          );
        }
      });
    } catch (e) {
      bot.logger.error(e);
    }
  };
}

export function createIrcJoinListener(bot: Bot) {
  return async (event: JoinEvent) => {
    try {
      const channelName = event.params.channel;
      const nick = event.source?.name ?? '';
      bot.debug && bot.logger.debug(`Received join: ${channelName} -- ${nick}`);
      const channel = channelName.toLowerCase();
      if (nick === bot.options.nickname && !bot.options.announceSelfJoin) {
        return;
      }
      // self-join is announced before names (which includes own nick)
      // so don't add nick to channelUsers
      if (
        nick !== bot.options.nickname &&
        bot.channelUsers[channel].indexOf(nick) === -1
      ) {
        bot.channelUsers[channel].push(nick);
      }
      if (!bot.options.ircStatusNotices) return;
      await bot.sendExactToDiscord(
        channel,
        `*${nick}* has joined the channel`,
      );
    } catch (e) {
      bot.logger.error(e);
    }
  };
}

export function createIrcPartListener(bot: Bot) {
  return async (event: PartEvent) => {
    try {
      const channelName = event.params.channel;
      const nick = event.source?.name ?? '';
      const reason = event.params.comment;
      bot.debug && bot.logger.debug(
        `Received part: ${channelName} -- ${nick} -- ${reason}`,
      );
      const channel = channelName.toLowerCase();
      // remove list of users when no longer in channel (as it will become out of date)
      if (nick === bot.options.nickname) {
        bot.debug && bot.logger.debug(
          `Deleting channelUsers as bot parted: ${channel}`,
        );
        delete bot.channelUsers[channel];
        return;
      }
      const users = bot.channelUsers[channel];
      if (users) {
        const index = users.indexOf(nick);
        bot.channelUsers[channel] = users.splice(index, 1);
      } else {
        bot.logger.warn(
          `No channelUsers found for ${channel} when ${nick} parted.`,
        );
      }
      if (!bot.options.ircStatusNotices) return;
      await bot.sendExactToDiscord(
        channel,
        `*${nick}* has left the channel (${reason})`,
      );
    } catch (e) {
      bot.logger.error(e);
    }
  };
}

export function createIrcQuitListener(bot: Bot) {
  return (event: QuitEvent) => {
    try {
      const nick = event.source?.name ?? '';
      const reason = event.params.comment ?? '';
      bot.debug && bot.logger.debug(
        `Received quit: ${nick}`,
      );
      Object.values(bot.channelMapping).forEach((channelName) => {
        const channel = channelName.toLowerCase();
        const users = bot.channelUsers[channel];
        if (!users) {
          bot.logger.warn(
            `No channelUsers found for ${channel} when ${nick} quit, ignoring.`,
          );
          return;
        }
        const index = users.indexOf(nick);
        if (index === -1) return;
        else bot.channelUsers[channel] = users.splice(index, 1);
        if (
          !bot.options.ircStatusNotices || nick === bot.options.nickname
        ) return;
        bot.sendExactToDiscord(
          channel,
          `*${nick}* has quit (${reason})`,
        );
      });
      console.log('quit');
      console.log(event);
    } catch (e) {
      bot.logger.error(e);
    }
  };
}

export function createIrcNicklistListener(bot: Bot) {
  return (event: NicklistEvent) => {
    const channelName = event.params.channel;
    const nicks = event.params.nicklist;
    bot.debug && bot.logger.debug(
      `Received names: ${channelName}\n${JSON.stringify(nicks, null, 2)}`,
    );
    const channel = channelName.toLowerCase();
    bot.channelUsers[channel] = nicks.map((n) => n.nick);
  };
}

export function createIrcActionListener(bot: Bot) {
  return async (event: CtcpActionEvent) => {
    try {
      await bot.sendToDiscord(
        event.source?.name ?? '',
        event.params.target,
        `_${event.params.text}_`,
      );
    } catch (e) {
      bot.logger.error(e);
    }
  };
}

export function createIrcInviteListener(bot: Bot) {
  return (event: InviteEvent) => {
    try {
      const channel = event.params.channel;
      const from = event.params.nick;
      bot.debug && bot.logger.debug(`Received invite: ${channel} -- ${from}`);
      if (!bot.invertedMapping[channel]) {
        bot.debug && bot.logger.debug(
          `Channel not found in config, not joining: ${channel}`,
        );
      } else {
        bot.ircClient.join(channel);
        bot.debug && bot.logger.debug(`Joining channel: ${channel}`);
      }
    } catch (e) {
      bot.logger.error(e);
    }
  };
}
