import { Mediator } from './mediator.ts';
import { ChannelMapper, ChannelMapping } from './channelMapping.ts';
import Bot from './bot.ts';
import {
  AnyRawCommand,
  ClientError,
  ClientOptions,
  Dlog,
  InviteEvent,
  IrcClient,
  JoinEvent,
  NickEvent,
  NicklistEvent,
  NoticeEvent,
  PartEvent,
  QuitEvent,
  RegisterEvent,
  RemoteAddr,
} from './deps.ts';
import { Dictionary, forEachAsync, tuple } from './helpers.ts';
import { Reflect } from './deps.ts';
import { CtcpVersionEvent } from 'https://deno.land/x/irc@v0.15.0/plugins/version.ts';

// deno-lint-ignore no-explicit-any
type Constructor<T = unknown> = new (...args: any[]) => T;

function decorator<T>(_: Constructor<T>): void {}

const Event = (name: string) => Reflect.metadata('Event', name);

@decorator
export class CustomIrcClient extends IrcClient {
  channelUsers: Dictionary<string[]>;
  channelMapping: ChannelMapper;
  sendExactToDiscord: (channel: string, message: string) => Promise<void>;
  exiting: () => boolean;
  botNick: string;
  debug: boolean;
  logger: Dlog;
  ircStatusNotices?: boolean;
  autoSendCommands?: string[][];
  announceSelfJoin?: boolean;
  constructor(clientOptions: ClientOptions, bot: Bot) {
    super(clientOptions);
    if (!bot.channelMapping) throw new Error('Cannot init IRC client without channel mapper');
    this.botNick = clientOptions.nick;
    this.channelUsers = bot.channelUsers;
    this.logger = bot.logger;
    this.debug = bot.debug;
    this.autoSendCommands = bot.config.autoSendCommands;
    this.channelMapping = bot.channelMapping;
    this.ircStatusNotices = bot.config.ircStatusNotices;
    this.announceSelfJoin = bot.config.announceSelfJoin;
    this.exiting = () => bot.exiting;
    this.bindEvents();
    this.sendExactToDiscord = async () => {};
  }
  // Bind event handlers to base client through Reflect metadata and bind each handler to this instance
  bindEvents() {
    for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(this))) {
      const event = Reflect.getMetadata('Event', this, key);
      if (event) {
        // deno-lint-ignore ban-types
        const handler = this[key as keyof typeof this] as Function;
        this.on(event, handler.bind(this));
      }
    }
  }
  @Event('connecting')
  onConnecting(addr: RemoteAddr) {
    this.logger.info(
      `Connecting to IRC server ${addr.hostname}:${addr.port} ${
        addr.tls ? 'with TLS' : 'without TLS' +
          '...'
      }`,
    );
  }
  @Event('connected')
  onConnected(addr: RemoteAddr) {
    this.logger.done(`Connected to IRC server ${addr.hostname}:${addr.port}`);
  }
  @Event('register')
  onRegister(message: RegisterEvent) {
    this.logger.done('Registered to IRC server.');
    this.debug && this.logger.debug(
      `Registered event:\n${JSON.stringify(message, null, 2)}`,
    );
    forEachAsync(
      this.autoSendCommands ?? [],
      async (element) => {
        const command: AnyRawCommand = element[0] as AnyRawCommand;
        const reducedElements = element.slice(1);
        if (!command) {
          this.logger.warn(`Auto-send command ${element[0]} not a valid IRC command! Skipping...`);
          return;
        }
        this.debug && this.logger.debug(`Sending auto-send command ${element}`);
        await this.send(command, ...reducedElements);
      },
    );
    // Inform user of channels to join
    this.channelMapping.ircNameToMapping.forEach((entry) => {
      this.logger.info(`Joining IRC channel ${entry.ircChannel}`);
    });
    // Convert channels that have passwords into the right form, otherwise use strings
    const convertMapping = (m: ChannelMapping) => m.ircPassword ? tuple([m.ircChannel, m.ircPassword]) : m.ircChannel;
    // The API surface requires us to split it up like this
    const firstChannel = convertMapping(this.channelMapping.mappings[0]);
    const trailingChannels = this.channelMapping.mappings.slice(1).map(convertMapping) ?? [];
    // Actually join channels
    if (trailingChannels.length > 0) {
      this.join(firstChannel, ...trailingChannels);
    } else {
      this.join(firstChannel);
    }
  }
  @Event('error')
  onError(error: ClientError) {
    this.logger.error(
      `Received error event from IRC\n${JSON.stringify(error, null, 2)}`,
    );
  }
  bindNotify(
    fn: (author: string, channel: string, message: string, raw: boolean) => Promise<void>,
    mediator: Mediator,
  ) {
    const raw = false;
    this.on('privmsg:channel', async (event) =>
      await fn(
        event.source?.name ?? '',
        event.params.target,
        event.params.text,
        raw,
      ));
    this.on('ctcp_action', async (event) =>
      await fn(
        event.source?.name ?? '',
        event.params.target,
        `_${event.params.text}_`,
        raw,
      ));
    this.sendExactToDiscord = mediator.sendExactToDiscord.bind(mediator);
  }
  @Event('notice')
  onNotice(event: NoticeEvent) {
    this.debug &&
      this.logger.debug(
        `Received notice:\n${JSON.stringify(event.params.text)}`,
      );
  }
  @Event('nick')
  onNick(event: NickEvent) {
    this.channelMapping?.discordIdToMapping.forEach((channelMapping) => {
      const channelName = channelMapping.ircChannel;
      const channel = channelName;
      const newNick = event.params.nick;
      const oldNick = event.source?.name ?? '';
      if (this.channelUsers[channelName]) {
        let users = this.channelUsers[channel];
        const index = users.indexOf(oldNick);
        if (index !== -1) {
          users = users.splice(index, 1);
          users.push(newNick);
          if (!this.ircStatusNotices) return;
          this.sendExactToDiscord(
            channel,
            `*${oldNick}* is now known as ${newNick} in the connected IRC server`,
          );
        }
      } else {
        this.logger.warn(
          `No channelUsers found for ${channel} when ${oldNick} changed.`,
        );
      }
    });
  }
  @Event('join')
  async onJoin(event: JoinEvent) {
    const channelName = event.params.channel;
    const nick = event.source?.name ?? '';
    if (nick === this.botNick) {
      this.logger.done(`Joined IRC channel ${channelName}`);
    } else {
      this.debug && this.logger.debug(`Received join: ${channelName} -- ${nick}`);
    }
    const channel = channelName;
    if (nick === this.botNick && !this.announceSelfJoin) {
      return;
    }
    // self-join is announced before names (which includes own nick)
    // so don't add nick to channelUsers
    if (
      nick !== this.botNick &&
      this.channelUsers[channel].indexOf(nick) === -1
    ) {
      this.channelUsers[channel].push(nick);
    }
    if (!this.ircStatusNotices) return;
    await this.sendExactToDiscord(
      channel,
      `*${nick}* has joined the connected IRC channel`,
    );
  }
  @Event('part')
  async onPart(event: PartEvent) {
    const channelName = event.params.channel;
    const nick = event.source?.name ?? '';
    const reason = event.params.comment;
    this.debug && this.logger.debug(
      `Received part: ${channelName} -- ${nick} -- ${reason}`,
    );
    const channel = channelName.toLowerCase();
    // remove list of users when no longer in channel (as it will become out of date)
    if (nick === this.botNick) {
      this.debug && this.logger.debug(
        `Deleting channelUsers as bot parted: ${channel}`,
      );
      delete this.channelUsers[channel];
      return;
    }
    const users = this.channelUsers[channel];
    if (users) {
      const index = users.indexOf(nick);
      this.channelUsers[channel] = users.splice(index, 1);
    } else {
      this.logger.warn(
        `No channelUsers found for ${channel} when ${nick} parted.`,
      );
    }
    if (!this.ircStatusNotices) return;
    await this.sendExactToDiscord(
      channel,
      `*${nick}* has left the connected IRC channel (${reason})`,
    );
  }
  @Event('quit')
  onQuit(event: QuitEvent) {
    const nick = event.source?.name ?? '';
    const reason = event.params.comment ?? '';
    this.debug && this.logger.debug(
      `Received quit: ${nick}`,
    );
    this.channelMapping?.ircNameToMapping.forEach((channelMapping) => {
      const channelName = channelMapping.ircChannel;
      const channel = channelName;
      const users = this.channelUsers[channel];
      if (!users) {
        this.logger.warn(
          `No channelUsers found for ${channel} when ${nick} quit, ignoring.`,
        );
        return;
      }
      const index = users.indexOf(nick);
      if (index === -1) return;
      else this.channelUsers[channel] = users.splice(index, 1);
      if (
        !this.ircStatusNotices || nick === this.botNick
      ) return;
      this.sendExactToDiscord(
        channel,
        `*${nick}* has quit from the connected IRC server (${reason})`,
      );
    });
  }
  @Event('nicklist')
  onNicklist(event: NicklistEvent) {
    const channelName = event.params.channel;
    const nicks = event.params.nicklist;
    this.debug && this.logger.debug(
      `Received names: ${channelName}\n${JSON.stringify(nicks, null, 2)}`,
    );
    const channel = channelName;
    this.channelUsers[channel] = nicks.map((n) => n.nick);
  }
  @Event('invite')
  onInvite(event: InviteEvent) {
    const channel = event.params.channel;
    const from = event.params.nick;
    this.debug && this.logger.debug(`Received invite: ${channel} -- ${from}`);
    if (!this.channelMapping?.ircNameToMapping.get(channel)) {
      this.debug && this.logger.debug(
        `Channel not found in config, not joining: ${channel}`,
      );
    } else {
      this.join(channel);
      this.debug && this.logger.debug(`Joining channel: ${channel}`);
    }
  }
  @Event('disconnected')
  async onDisconnected(addr: RemoteAddr) {
    const message = `Disconnected from server ${addr.hostname}:${addr.port}`;
    if (this.exiting()) {
      this.logger.done(message + '.');
    } else {
      this.logger.error(message + '!');
      await this.connect(this.state.remoteAddr.hostname, this.state.remoteAddr.port, this.state.remoteAddr.tls);
    }
  }
  @Event('reconnecting')
  onReconnecting(addr: RemoteAddr) {
    this.logger.info(
      `Attempting to reconnect to server ${addr.hostname}:${addr.port}...`,
    );
  }
  @Event('ctcp_version')
  on_ctcp_version(cmd: CtcpVersionEvent) {
    if (!cmd.source) return;
    this.ctcp(cmd.source.name, 'VERSION', 'Discord-IRC');
  }
}
