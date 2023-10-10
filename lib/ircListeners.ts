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
  RemoteAddr,
} from './deps.ts';
import { forEachAsync } from './helpers.ts';

export function createIrcConnectingListener(bot: Bot) {
  return (addr: RemoteAddr) => {
    bot.logger.info(
      `Connecting to IRC server ${addr.hostname}:${addr.port} ${
        addr.tls ? 'with TLS' : 'without TLS' +
          '...'
      }`,
    );
  };
}

export function createIrcConnectedListener(bot: Bot) {
  return (addr: RemoteAddr) => {
    bot.logger.done(`Connected to IRC server ${addr.hostname}:${addr.port}`);
  };
}

export function createIrcRegisterListener(bot: Bot) {
  return (message: RegisterEvent) => {
    bot.logger.done('Registered to IRC server.');
    bot.debug && bot.logger.debug(
      `Registered event:\n${JSON.stringify(message, null, 2)}`,
    );
    forEachAsync(
      bot.config.autoSendCommands ?? [],
      async (element: [any, string]) => {
        await bot.ircClient.send(...element);
      },
    );
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
    await bot.sendToDiscord(
      event.source?.name ?? '',
      event.params.target,
      event.params.text,
    );
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
    bot.channelMapping?.discordIdToMapping.forEach((channelMapping) => {
      const channelName = channelMapping.ircChannel;
      const channel = channelName.toLowerCase();
      const newNick = event.params.nick;
      const oldNick = event.source?.name ?? '';
      if (bot.channelUsers[channelName]) {
        let users = bot.channelUsers[channel];
        const index = users.indexOf(oldNick);
        if (index !== -1) {
          users = users.splice(index, 1);
          users.push(newNick);
          if (!bot.config.ircStatusNotices) return;
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
  };
}

export function createIrcJoinListener(bot: Bot) {
  return async (event: JoinEvent) => {
    const channelName = event.params.channel;
    const nick = event.source?.name ?? '';
    if (nick === bot.config.ircOptions?.nick ?? bot.config.nickname) {
      bot.logger.done(`Joined IRC channel ${channelName}`);
    } else {
      bot.debug && bot.logger.debug(`Received join: ${channelName} -- ${nick}`);
    }
    const channel = channelName.toLowerCase();
    if (nick === bot.config.nickname && !bot.config.announceSelfJoin) {
      return;
    }
    // self-join is announced before names (which includes own nick)
    // so don't add nick to channelUsers
    if (
      nick !== bot.config.ircOptions?.nick &&
      nick !== bot.config.nickname &&
      bot.channelUsers[channel].indexOf(nick) === -1
    ) {
      bot.channelUsers[channel].push(nick);
    }
    if (!bot.config.ircStatusNotices) return;
    await bot.sendExactToDiscord(
      channel,
      `*${nick}* has joined the channel`,
    );
  };
}

export function createIrcPartListener(bot: Bot) {
  return async (event: PartEvent) => {
    const channelName = event.params.channel;
    const nick = event.source?.name ?? '';
    const reason = event.params.comment;
    bot.debug && bot.logger.debug(
      `Received part: ${channelName} -- ${nick} -- ${reason}`,
    );
    const channel = channelName.toLowerCase();
    // remove list of users when no longer in channel (as it will become out of date)
    if (nick === bot.config.nickname) {
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
    if (!bot.config.ircStatusNotices) return;
    await bot.sendExactToDiscord(
      channel,
      `*${nick}* has left the channel (${reason})`,
    );
  };
}

export function createIrcQuitListener(bot: Bot) {
  return (event: QuitEvent) => {
    const nick = event.source?.name ?? '';
    const reason = event.params.comment ?? '';
    bot.debug && bot.logger.debug(
      `Received quit: ${nick}`,
    );
    bot.channelMapping?.ircNameToMapping.forEach((channelMapping) => {
      const channelName = channelMapping.ircChannel;
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
        !bot.config.ircStatusNotices || nick === bot.config.nickname
      ) return;
      bot.sendExactToDiscord(
        channel,
        `*${nick}* has quit (${reason})`,
      );
    });
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
    await bot.sendToDiscord(
      event.source?.name ?? '',
      event.params.target,
      `_${event.params.text}_`,
    );
  };
}

export function createIrcInviteListener(bot: Bot) {
  return (event: InviteEvent) => {
    const channel = event.params.channel;
    const from = event.params.nick;
    bot.debug && bot.logger.debug(`Received invite: ${channel} -- ${from}`);
    if (!bot.channelMapping?.ircNameToMapping.get(channel)) {
      bot.debug && bot.logger.debug(
        `Channel not found in config, not joining: ${channel}`,
      );
    } else {
      bot.ircClient.join(channel);
      bot.debug && bot.logger.debug(`Joining channel: ${channel}`);
    }
  };
}

export function createIrcDisconnectedListener(bot: Bot) {
  return (addr: RemoteAddr) => {
    const message = `Disconnected from server ${addr.hostname}:${addr.port}`;
    if (bot.exiting) {
      bot.logger.done(message + '.');
    } else {
      bot.logger.error(message + '!');
    }
  };
}

export function createIrcReconnectingListener(bot: Bot) {
  return (addr: RemoteAddr) => {
    bot.logger.info(
      `Attempting to reconnect to server ${addr.hostname}:${addr.port}...`,
    );
  };
}
