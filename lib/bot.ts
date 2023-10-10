import { ClientOptions, IrcClient } from './deps.ts';
import Dlog from 'https://deno.land/x/dlog2@2.0/classic.ts';
import { AllowedMentionType, Client, GatewayIntents, Guild, Message, User } from './deps.ts';
import { validateChannelMapping } from './validators.ts';
import { formatFromDiscordToIRC, formatFromIRCToDiscord } from './formatting.ts';
import { DEFAULT_NICK_COLORS, wrap } from './colors.ts';
import { Dictionary, replaceAsync } from './helpers.ts';
import { Config, GameLogConfig, IgnoreConfig } from './config.ts';
import {
  createIrcActionListener,
  createIrcConnectedListener,
  createIrcConnectingListener,
  createIrcDisconnectedListener,
  createIrcErrorListener,
  createIrcInviteListener,
  createIrcJoinListener,
  createIrcNickListener,
  createIrcNicklistListener,
  createIrcNoticeListener,
  createIrcPartListener,
  createIrcPrivMessageListener,
  createIrcQuitListener,
  createIrcReconnectingListener,
  createIrcRegisterListener,
} from './ircListeners.ts';
import {
  createDiscordDebugListener,
  createDiscordErrorListener,
  createDiscordMessageListener,
  createDiscordReadyListener,
} from './discordListeners.ts';
import { AllWebhookMessageOptions } from 'https://raw.githubusercontent.com/harmonyland/harmony/main/src/structures/webhook.ts';
import { DiscordAPIError } from 'https://raw.githubusercontent.com/harmonyland/harmony/main/mod.ts';
import { ChannelMapper } from './channelMapping.ts';

// Usernames need to be between 2 and 32 characters for webhooks:
const USERNAME_MIN_LENGTH = 2;
const USERNAME_MAX_LENGTH = 32;

// const REQUIRED_FIELDS = ['server', 'nickname', 'channelMapping', 'discordToken'];
const patternMatch = /{\$(.+?)}/g;

/**
 * An IRC bot, works as a middleman for all communication
 * @param {object} options - server, nickname, channelMapping, outgoingToken, incomingURL, partialMatch
 */
export default class Bot {
  discord: Client;
  logger: Dlog;
  config: Config;
  channels: string[];
  ignoreConfig?: IgnoreConfig;
  gameLogConfig?: GameLogConfig;
  formatIRCText: string;
  formatURLAttachment: string;
  formatCommandPrelude: string;
  formatDiscord: string;
  formatWebhookAvatarURL: string;
  channelUsers: Dictionary<Array<string>>;
  channelMapping: ChannelMapper | null = null;
  ircClient: IrcClient;
  ircNickColors: string[] = DEFAULT_NICK_COLORS;
  debug: boolean = (Deno.env.get('DEBUG') ?? Deno.env.get('VERBOSE') ?? 'false')
    .toLowerCase() === 'true';
  verbose: boolean = (Deno.env.get('VERBOSE') ?? 'false').toLowerCase() === 'true';
  exiting = false;
  constructor(config: Config) {
    validateChannelMapping(config.channelMapping);

    this.discord = new Client({
      intents: [
        GatewayIntents.GUILDS,
        GatewayIntents.GUILD_MEMBERS,
        GatewayIntents.GUILD_MESSAGES,
        GatewayIntents.MESSAGE_CONTENT,
      ],
      token: config.discordToken,
    });

    this.config = config;
    // Make usernames lowercase for IRC ignore
    if (this.config.ignoreConfig) {
      this.config.ignoreConfig.ignorePingIrcUsers = this.config.ignoreConfig.ignorePingIrcUsers
        ?.map((s) => s.toLocaleLowerCase());
    }
    if (config.logToFile) {
      this.logger = new Dlog(config.nickname, true, config.logFolder ?? '.');
    } else {
      this.logger = new Dlog(config.nickname);
    }
    this.channels = Object.values(config.channelMapping);
    if (config.allowRolePings === undefined) {
      config.allowRolePings = true;
    }

    this.gameLogConfig = config.gameLogConfig;
    this.ignoreConfig = config.ignoreConfig;

    // "{$keyName}" => "variableValue"
    // displayUsername: nickname with wrapped colors
    // attachmentURL: the URL of the attachment (only applicable in formatURLAttachment)
    this.formatIRCText = config.format?.ircText ||
      '<{$displayUsername} [@{$discordUsername}]> {$text}';
    this.formatURLAttachment = config.format?.urlAttachment ||
      '<{$displayUsername}> {$attachmentURL}';

    // "{$keyName}" => "variableValue"
    // side: "Discord" or "IRC"
    if (config.format && config.format.commandPrelude) {
      this.formatCommandPrelude = config.format.commandPrelude;
    } else {
      this.formatCommandPrelude = 'Command sent from {$side} by {$nickname}:';
    }

    // "{$keyName}" => "variableValue"
    // withMentions: text with appropriate mentions reformatted
    this.formatDiscord = config.format?.discord ||
      '**<{$author}>** {$withMentions}';

    // "{$keyName} => "variableValue"
    // nickname: nickame of IRC message sender
    this.formatWebhookAvatarURL = config.format?.webhookAvatarURL ?? '';

    // Keep track of { channel => [list, of, usernames] } for ircStatusNotices
    this.channelUsers = {};

    if (config.ircNickColors) {
      this.ircNickColors = config.ircNickColors;
    }

    const ircOptions: ClientOptions = {
      nick: config.nickname,
      username: config.nickname,
      realname: config.nickname,
      password: config.ircOptions?.password,
      reconnect: {
        attempts: Number.MAX_SAFE_INTEGER,
        delay: 3,
      },
      ...config.ircOptions,
    };

    this.ircClient = new IrcClient(ircOptions);
  }

  async connect() {
    this.debug && this.logger.debug('Connecting to IRC and Discord');
    this.attachDiscordListeners();
    await this.discord.connect();

    // Extract id and token from Webhook urls and connect.
    this.channelMapping = await ChannelMapper.CreateAsync(this.config, this, this.discord);

    this.attachIrcListeners();
    await this.ircClient.connect(this.config.server);
    this.channelMapping.ircNameToMapping.forEach((entry) => {
      this.logger.info(`Joining channel ${entry.ircChannel}`);
      this.ircClient.join(entry.ircChannel);
    });
  }

  async disconnect() {
    this.exiting = true;
    await this.ircClient.quit();
    this.ircClient.disconnect();
    await this.discord.destroy();
  }

  private attachDiscordListeners() {
    this.discord.on('ready', createDiscordReadyListener(this));
    this.discord.on('error', createDiscordErrorListener(this));
    this.discord.on('messageCreate', createDiscordMessageListener(this));
    if (this.debug) {
      this.discord.on('debug', createDiscordDebugListener(this));
    }
  }

  private attachIrcListeners() {
    this.ircClient.on('register', createIrcRegisterListener(this));
    this.ircClient.on('error', createIrcErrorListener(this));
    this.ircClient.on('privmsg:channel', createIrcPrivMessageListener(this));
    this.ircClient.on('notice', createIrcNoticeListener(this));
    this.ircClient.on('nick', createIrcNickListener(this));
    this.ircClient.on('join', createIrcJoinListener(this));
    this.ircClient.on('part', createIrcPartListener(this));
    this.ircClient.on('quit', createIrcQuitListener(this));
    this.ircClient.on('nicklist', createIrcNicklistListener(this));
    this.ircClient.on('ctcp_action', createIrcActionListener(this));
    this.ircClient.on('invite', createIrcInviteListener(this));
    this.ircClient.on('connecting', createIrcConnectingListener(this));
    this.ircClient.on('connected', createIrcConnectedListener(this));
    this.ircClient.on('disconnected', createIrcDisconnectedListener(this));
    this.ircClient.on('reconnecting', createIrcReconnectingListener(this));
  }

  async getDiscordUserByString(userString: string, guild: Guild | undefined) {
    const members = await guild?.members.search(userString) ?? [];
    return members.find((m) => m.user.username.toLocaleLowerCase() === userString.toLocaleLowerCase());
  }

  async replaceUserMentions(
    content: string,
    mention: User,
    message: Message,
  ): Promise<string> {
    if (!message.guild) return '';
    try {
      const member = await message.guild.members.fetch(mention.id);
      const displayName = member.nick || mention.displayName || mention.username;

      const userMentionRegex = RegExp(`<@(&|!)?${mention.id}>`, 'g');
      return content.replace(userMentionRegex, `@${displayName}`);
    } catch (e) {
      // Happens when a webhook is mentioned similar to a user, prevent 404 from crashing bot
      if (e instanceof DiscordAPIError) {
        this.logger.error(`Discord API error in user mention lookup, falling back to no mention:\n${e}`);
      } else {
        this.logger.error(e);
      }
      return '';
    }
  }

  replaceNewlines(text: string): string {
    return text.replace(/\n|\r\n|\r/g, ' ');
  }

  async replaceChannelMentions(text: string): Promise<string> {
    return await replaceAsync(
      text,
      /<#(\d+)>/g,
      async (_, channelId: string) => {
        const channel = await this.discord.channels.fetch(channelId);
        if (channel && channel.isGuildText()) return `#${channel.name}`;
        return '#deleted-channel';
      },
    );
  }

  async replaceRoleMentions(
    text: string,
    message: Message,
  ): Promise<string> {
    return await replaceAsync(text, /<@&(\d+)>/g, async (_, roleId) => {
      const role = await message.guild?.roles.fetch(roleId);
      if (role) return `@${role.name}`;
      return '@deleted-role';
    });
  }

  replaceEmotes(text: string): string {
    return text.replace(/<a?(:\w+:)\d+>/g, (_, emoteName) => emoteName);
  }

  async parseText(message: Message) {
    let text = message.content;
    for (const mention of message.mentions.users.values()) {
      text = await this.replaceUserMentions(text, mention, message);
    }

    return this.replaceEmotes(
      await this.replaceRoleMentions(
        await this.replaceChannelMentions(this.replaceNewlines(text)),
        message,
      ),
    );
  }

  isCommandMessage(message: string) {
    return this.config.commandCharacters?.some((prefix: string) => message.startsWith(prefix)) ?? false;
  }

  ignoredIrcUser(user: string) {
    return this.config.ignoreUsers?.irc.some(
      (i: string) => i.toLowerCase() === user.toLowerCase(),
    ) ?? false;
  }

  ignoredDiscordUser(discordUser: { username: string; id: string }) {
    const ignoredName = this.config.ignoreUsers?.discord.some(
      (i) => i.toLowerCase() === discordUser.username.toLowerCase(),
    );
    const ignoredId = this.config.ignoreUsers?.discordIds.some(
      (i) => i === discordUser.id,
    );
    return ignoredName || ignoredId || false;
  }

  static substitutePattern(
    message: string,
    patternMapping: {
      [x: string]: any;
      author?: any;
      nickname?: any;
      displayUsername?: any;
      discordUsername?: any;
      text?: any;
      discordChannel?: string;
      ircChannel?: any;
    },
  ) {
    return message.replace(
      patternMatch,
      (match: any, varName: string | number) => patternMapping[varName] || match,
    );
  }

  async sendToIRC(message: Message) {
    const { author } = message;
    // Ignore messages sent by the bot itself:
    if (author.id === this.discord.user?.id || this.channelMapping?.webhooks.find((w) => w.id === message.author.id)) {
      return;
    }

    // Do not send to IRC if this user is on the ignore list.
    if (this.ignoredDiscordUser(author)) {
      return;
    }

    const channel = message.channel;
    if (!channel.isGuildText()) return;
    const channelName = `#${channel.name}`;
    const ircChannel = this.channelMapping?.discordIdToMapping.get(channel.id)?.ircChannel;

    if (ircChannel) {
      const fromGuild = message.guild;
      if (!fromGuild) return;
      let displayUsername = '';
      let discordUsername = '';
      const member = await fromGuild.members.get(author.id);
      if (member) {
        displayUsername = member.nick || author.displayName || author.username;
        discordUsername = member.user.username;
      } else {
        // Author is a webhook
        displayUsername = message.author.displayName;
        discordUsername = message.author.username;
      }

      let text = await this.parseText(message);

      if (this.config.parallelPingFix) {
        // Prevent users of both IRC and Discord from
        // being mentioned in IRC when they talk in Discord.
        displayUsername = `${
          displayUsername.slice(
            0,
            1,
          )
        }\u200B${displayUsername.slice(1)}`;
      }

      if (this.config.ircNickColor) {
        const displayColorIdx = (displayUsername.charCodeAt(0) + displayUsername.length) %
            this.ircNickColors.length ?? 0;
        const discordColorIdx = (discordUsername.charCodeAt(0) + discordUsername.length) %
            this.ircNickColors.length ?? 0;
        displayUsername = wrap(
          this.ircNickColors[displayColorIdx],
          displayUsername,
        );
        discordUsername = wrap(
          this.ircNickColors[discordColorIdx],
          discordUsername,
        );
      }

      const patternMap = {
        author: displayUsername,
        nickname: displayUsername,
        displayUsername,
        discordUsername,
        text,
        discordChannel: channelName,
        ircChannel,
        attachmentURL: '',
      };

      if (this.isCommandMessage(text)) {
        //patternMap.side = 'Discord';
        this.debug && this.logger.debug(
          `Sending command message to IRC ${ircChannel} -- ${text}`,
        );
        // if (prelude) this.ircClient.say(ircChannel, prelude);
        if (this.formatCommandPrelude) {
          const prelude = Bot.substitutePattern(
            this.formatCommandPrelude,
            patternMap,
          );
          this.ircClient.privmsg(ircChannel, prelude);
        }
        this.ircClient.privmsg(ircChannel, text);
      } else {
        if (text !== '') {
          // Convert formatting
          text = formatFromDiscordToIRC(text);
          patternMap.text = text;

          text = Bot.substitutePattern(this.formatIRCText, patternMap);
          this.debug && this.logger.debug(
            `Sending message to IRC ${ircChannel} -- ${text}`,
          );
          this.ircClient.privmsg(ircChannel, text);
        }

        if (message.attachments && message.attachments.length) {
          message.attachments.forEach((a) => {
            patternMap.attachmentURL = a.url;
            const urlMessage = Bot.substitutePattern(
              this.formatURLAttachment,
              patternMap,
            );

            this.debug && this.logger.debug(
              `Sending attachment URL to IRC ${ircChannel} ${urlMessage}`,
            );
            this.ircClient.privmsg(ircChannel, urlMessage);
          });
        }
      }
    }
  }

  findDiscordChannel(ircChannel: string) {
    return this.channelMapping?.ircNameToMapping.get(ircChannel.toLowerCase())?.discordChannel;
  }

  findWebhook(ircChannel: string) {
    return this.channelMapping?.ircNameToMapping.get(ircChannel.toLowerCase())?.webhook;
  }

  async getDiscordAvatar(nick: string, channel: string) {
    nick = nick.toLowerCase();
    const channelRef = this.findDiscordChannel(channel);
    if (!channelRef?.isGuildText()) return null;
    const guildMembers = await channelRef.guild.members.search(nick);

    // Try to find exact matching case
    // No matching user or more than one => default avatar
    if (guildMembers) {
      const member = guildMembers.find((m) =>
        [m.user.username, m.user.displayName, m.nick].find((s) => s?.toLowerCase() === nick.toLowerCase())
      );
      const url = member?.avatarURL();
      if (url) return url;
    }

    // If there isn't a URL format, don't send an avatar at all
    if (this.formatWebhookAvatarURL) {
      return Bot.substitutePattern(this.formatWebhookAvatarURL, {
        nickname: nick,
      });
    }
    return null;
  }

  // compare two strings case-insensitively
  // for discord mention matching
  static caseComp(str1: string, str2: string) {
    return str1.toUpperCase() === str2.toUpperCase();
  }

  // check if the first string starts with the second case-insensitively
  // for discord mention matching
  static caseStartsWith(str1: string, str2: string) {
    return str1.toUpperCase().startsWith(str2.toUpperCase());
  }

  static shouldIgnoreMessage(
    text: string,
    ircChannel: string,
    config: IgnoreConfig,
  ): boolean {
    if (!config.ignorePatterns) return false;
    if (!config.ignorePatterns[ircChannel]) return false;
    for (const pattern of config.ignorePatterns[ircChannel]) {
      if (text.indexOf(pattern) !== -1) {
        return true;
      }
    }
    return false;
  }

  async sendToDiscord(author: string, ircChannel: string, text: string) {
    if (
      this.ignoreConfig &&
      Bot.shouldIgnoreMessage(text, ircChannel, this.ignoreConfig)
    ) {
      return;
    }
    const discordChannel = this.findDiscordChannel(ircChannel);
    if (!discordChannel) return;
    const channelName = discordChannel.mention;

    // Do not send to Discord if this user is on the ignore list.
    if (this.ignoredIrcUser(author)) {
      return;
    }

    // Convert text formatting (bold, italics, underscore)
    const withFormat = formatFromIRCToDiscord(text, author, this.gameLogConfig);

    const patternMap = {
      author,
      nickname: author,
      displayUsername: author,
      text: withFormat,
      discordChannel: `#${channelName}`,
      ircChannel: ircChannel,
      withMentions: '',
      side: '',
    };

    if (this.isCommandMessage(text)) {
      patternMap.side = 'IRC';
      this.debug && this.logger.debug(
        `Sending command message to Discord #${channelName} -- ${text}`,
      );
      if (this.formatCommandPrelude) {
        const prelude = Bot.substitutePattern(
          this.formatCommandPrelude,
          patternMap,
        );
        if (discordChannel.isGuildText()) {
          discordChannel.send(prelude);
        }
      }
      if (discordChannel.isGuildText()) {
        discordChannel.send(text);
      }
      return;
    }

    let guild: Guild | undefined = undefined;
    if (discordChannel.isGuildText()) {
      guild = discordChannel.guild;
    }
    const roles = await guild?.roles.fetchAll();
    if (!roles) return;
    const channels = await guild?.channels.array();
    if (!channels) return;

    const processMentionables = async (input: string) => {
      if (this.config.ignoreConfig?.ignorePingIrcUsers?.includes(author.toLocaleLowerCase())) return input;
      return await replaceAsync(
        input,
        /([^@\s:,]+):|@([^\s]+)/g,
        async (match, colonRef, atRef) => {
          const reference = colonRef || atRef;
          const member = await this.getDiscordUserByString(reference, guild);

          // @username => mention, case insensitively
          if (member) return `<@${member.id}>`;

          if (!this.config.allowRolePings) return match;
          // @role => mention, case insensitively
          const role = roles.find(
            (x) => x.mentionable && Bot.caseComp(x.name, reference),
          );
          if (role) return `<@&${role.id}>`;
          return match;
        },
      );
    };

    const processEmoji = async (input: string) => {
      return await replaceAsync(input, /:(\w+):/g, async (match, ident) => {
        // :emoji: => mention, case sensitively
        const emoji = (await guild?.emojis.array())?.find((x) => x.name === ident && x.requireColons);
        if (emoji) return `${emoji.name}`;

        return match;
      });
    };

    const processChannels = (input: string) => {
      return input.replace(/#([^\s#@'!?,.]+)/g, (match, channelName) => {
        // channel names can't contain spaces, #, @, ', !, ?, , or .
        // (based on brief testing. they also can't contain some other symbols,
        // but these seem likely to be common around channel references)

        // discord matches channel names case insensitively
        const chan = channels.find((x) => Bot.caseComp(x.name, channelName));
        return chan?.name ? `${chan.mention}` : match;
      });
    };

    const withMentions = processChannels(
      await processEmoji(
        await processMentionables(withFormat),
      ),
    );

    // Webhooks first
    const webhook = this.findWebhook(ircChannel);
    if (webhook) {
      if (discordChannel.isGuildText()) {
        this.debug && this.logger.debug(
          `Sending message to Discord via webhook ${withMentions} ${ircChannel} -> #${discordChannel.name}`,
        );
      }
      if (this.discord.user === null) return;
      // const permissions = discordChannel.permissionsFor(this.discord.user);
      const canPingEveryone = false;
      /*
      if (permissions) {
        canPingEveryone = permissions.has(discord.Permissions.FLAGS.MENTION_EVERYONE);
      }
      */
      const avatarURL = (await this.getDiscordAvatar(author, ircChannel)) ??
        undefined;
      const username = author.substring(0, USERNAME_MAX_LENGTH).padEnd(
        USERNAME_MIN_LENGTH,
        '_',
      );
      const payload: AllWebhookMessageOptions = {
        name: username,
        avatar: avatarURL,
        allowedMentions: {
          parse: canPingEveryone
            ? [
              AllowedMentionType.Roles,
              AllowedMentionType.Users,
              AllowedMentionType.Everyone,
            ]
            : [AllowedMentionType.Roles, AllowedMentionType.Users],
          replied_user: true,
        },
      };
      try {
        await webhook.client.send(withMentions, payload);
      } catch (e) {
        this.logger.error(
          `Received error on webhook send: ${JSON.stringify(e, null, 2)}`,
        );
      }
      return;
    }

    patternMap.withMentions = withMentions;

    // Add bold formatting:
    // Use custom formatting from config / default formatting with bold author
    const withAuthor = Bot.substitutePattern(this.formatDiscord, patternMap);
    if (discordChannel.isGuildText()) {
      this.debug && this.logger.debug(
        `Sending message to Discord ${withAuthor} ${ircChannel} -> #${discordChannel.name}`,
      );
      discordChannel.send(withAuthor);
    }
  }

  /* Sends a message to Discord exactly as it appears */
  async sendExactToDiscord(channel: string, text: string) {
    const discordChannel = await this.findDiscordChannel(channel);
    if (!discordChannel) return;

    if (discordChannel.isGuildText()) {
      this.debug && this.logger.debug(
        `Sending special message to Discord ${text} ${channel} -> #${discordChannel.name}`,
      );
      await discordChannel.send(text);
    }
  }
}
