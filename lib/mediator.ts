import { DEBUG } from './env.ts';
import { ChannelMapper } from './channelMapping.ts';
import { Config, GameLogConfig, IgnoreConfig, IgnoreUsers } from './config.ts';
import { CustomIrcClient, CustomIrcClient as IrcClient } from './ircClient.ts';
import { DiscordClient } from './discordClient.ts';
import {
  AllowedMentionType,
  AllWebhookMessageOptions,
  DiscordAPIError,
  Dlog,
  escapeStringRegexp,
  Guild,
  GuildMember,
  Message,
  Message as DiscordMessage,
  PKMember,
  User,
} from './deps.ts';
import { delay, Dictionary, replaceAsync } from './helpers.ts';
import { formatFromDiscordToIRC, formatFromIRCToDiscord } from './formatting.ts';
import { DEFAULT_NICK_COLORS, wrap } from './colors.ts';
import { AllGuildChannelsCache, GuildChannelCache } from './cache/channelCache.ts';
import { AllGuildMembersCache, GuildMemberCache } from './cache/memberCache.ts';
import { AllGuildRoleCache, GuildRoleCache, MemberRoleCache } from './cache/roleCache.ts';

// Usernames need to be between 2 and 32 characters for webhooks:
const USERNAME_MIN_LENGTH = 2;
const USERNAME_MAX_LENGTH = 32;

/**
 * Parses, transforms, and marshals messages emitted from Discord or IRC to the other.
 */
export class Mediator {
  discord: DiscordClient;
  irc: IrcClient;
  guild: Guild;
  channelMapping: ChannelMapper;
  debug: boolean = DEBUG;
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
  ircClient?: CustomIrcClient;
  ircNickColors: string[] = DEFAULT_NICK_COLORS;
  commandCharacters: string[];
  allowRolePings: boolean;
  ignoreUsers?: IgnoreUsers;
  private GuildMemberCache: GuildMemberCache;
  private MemberRoleCache: MemberRoleCache;
  private GuildChannelCache: GuildChannelCache;
  private AllGuildMembersCache: AllGuildMembersCache;
  private AllGuildRolesCache: AllGuildRoleCache;
  private GuildRoleCache: GuildRoleCache;
  private AllGuildChannelsCache: AllGuildChannelsCache;
  constructor(
    discord: DiscordClient,
    irc: IrcClient,
    guild: Guild,
    config: Config,
    mapper: ChannelMapper,
    channelUsers: Dictionary<Array<string>>,
    logger: Dlog,
  ) {
    this.config = config;
    this.guild = guild;
    this.channelMapping = mapper;
    this.discord = discord;
    this.irc = irc;
    this.logger = logger;
    this.channelUsers = channelUsers;
    this.AllGuildMembersCache = new AllGuildMembersCache(guild);
    this.GuildMemberCache = new GuildMemberCache(guild);
    this.MemberRoleCache = new MemberRoleCache(this.GuildMemberCache);
    this.GuildChannelCache = new GuildChannelCache(guild);
    this.GuildRoleCache = new GuildRoleCache(guild);
    this.AllGuildRolesCache = new AllGuildRoleCache(guild);
    this.AllGuildChannelsCache = new AllGuildChannelsCache(guild);
    // Make usernames lowercase for IRC ignore
    if (this.config.ignoreConfig) {
      this.config.ignoreConfig.ignorePingIrcUsers = this.config.ignoreConfig.ignorePingIrcUsers
        ?.map((s) => s.toLocaleLowerCase());
    }
    this.channels = Object.values(config.channelMapping);
    if (config.allowRolePings === undefined) {
      this.allowRolePings = true;
    } else {
      this.allowRolePings = config.allowRolePings;
    }

    this.gameLogConfig = config.gameLogConfig;
    this.ignoreConfig = config.ignoreConfig;
    this.ignoreUsers = config.ignoreUsers;

    // "{$keyName}" => "variableValue"
    // displayUsername: nickname with wrapped colors
    // attachmentURL: the URL of the attachment (only applicable in formatURLAttachment)
    this.formatIRCText = config.format?.ircText ||
      '<{$displayUsername} [@{$discordUsername}]> {$text}';
    this.formatURLAttachment = config.format?.urlAttachment ||
      '<{$displayUsername} [@{$discordUsername}]> {$attachmentURL}';

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

    if (config.ircNickColors) {
      this.ircNickColors = config.ircNickColors;
    }
    this.commandCharacters = config.commandCharacters ?? [];

    if (config.pluralKit && !config.pluralKitWaitDelay) {
      config.pluralKitWaitDelay = 1000;
    }

    this.bindMethods();
    irc.bindNotify(this.notifyToDiscord, this);
    discord.bindNotify(this.notifyToIrc, mapper);
  }

  bindMethods() {
    this.replaceUserMentions = this.replaceUserMentions.bind(this);
    this.replaceNewlines = this.replaceNewlines.bind(this);
    this.replaceChannelMentions = this.replaceChannelMentions.bind(this);
    this.replaceRoleMentions = this.replaceRoleMentions.bind(this);
    this.replaceEmotes = this.replaceEmotes.bind(this);
    this.parseText = this.parseText.bind(this);
    this.ignoredDiscordUser = this.ignoredDiscordUser.bind(this);
    this.sendIRCMessageWithSplitAndQueue = this.sendIRCMessageWithSplitAndQueue.bind(this);
    this.sendToIRC = this.sendToIRC.bind(this);
    this.notifyToIrc = this.notifyToIrc.bind(this);
    this.shouldIgnoreByPattern = this.shouldIgnoreByPattern.bind(this);
    this.ignoredIrcUser = this.ignoredIrcUser.bind(this);
    this.findDiscordChannel = this.findDiscordChannel.bind(this);
    this.isCommandMessage = this.isCommandMessage.bind(this);
    this.getDiscordUserByString = this.getDiscordUserByString.bind(this);
    this.getDiscordAvatar = this.getDiscordAvatar.bind(this);
    this.findWebhook = this.findWebhook.bind(this);
    this.notifyToDiscord = this.notifyToDiscord.bind(this);
  }

  async replaceUserMentions(
    content: string,
    mention: User,
    message: Message,
  ): Promise<string> {
    if (!message.guild) return '';
    try {
      const member = await this.GuildMemberCache.get(mention.id);
      const displayName = member.nick || mention.displayName || mention.username;

      const userMentionRegex = RegExp(`<@(&|!)?${mention.id}>`, 'g');
      return content.replace(userMentionRegex, `@${displayName}`);
    } catch (e: any) {
      // Happens when a webhook is mentioned similar to a user, prevent 404 from crashing bot
      if (e instanceof DiscordAPIError) {
        this.logger.error(`Discord API error in user mention lookup, likely user was webhook:\n${e}`);
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
        const channel = await this.GuildChannelCache.get(channelId);
        if (channel) return `#${channel.name}`;
        return '#deleted-channel';
      },
    );
  }

  async replaceRoleMentions(
    text: string,
    _message: Message,
  ): Promise<string> {
    return await replaceAsync(text, /<@&(\d+)>/g, async (_, roleId) => {
      const role = await this.GuildRoleCache.get(roleId);
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

  async ignoredDiscordUser(discordUser: GuildMember) {
    const ignoredName = this.ignoreUsers?.discord?.some(
      (i) => i.toLowerCase() === discordUser.user.username.toLowerCase(),
    );
    const ignoredId = this.ignoreUsers?.discordIds?.some(
      (i) => i === discordUser.id,
    );
    const roles = await this.MemberRoleCache.get(discordUser.id);
    const ignoredRole = this.ignoreUsers?.roles?.some(
      (r) => roles.some((role) => role.name === r || role.id === r),
    );
    return ignoredName || ignoredId || ignoredRole || false;
  }

  sendIRCMessageWithSplitAndQueue(ircChannel: string, input: string) {
    // Split up the string and use `reduce`
    // to iterate over it
    const accumulatedChunks = input.split(' ').reduce((accumulator: string[][], fragment: string) => {
      // Get the number of nested arrays
      const currIndex = accumulator.length - 1;

      // Join up the last array and get its length
      const currLen = accumulator[currIndex].join(' ').length;

      // If the length of that content and the new word
      // in the iteration exceeds 400 chars push the new
      // word to a new array
      if (currLen + fragment.length > 400) {
        accumulator.push([fragment]);

        // otherwise add it to the existing array
      } else {
        accumulator[currIndex].push(fragment);
      }

      return accumulator;
    }, [[]]);

    // Join up all the nested arrays
    const messageChunks = accumulatedChunks.map((arr) => arr.join(' '));

    for (const chunk of messageChunks) {
      this.irc.privmsg(ircChannel, chunk.trim());
    }
  }

  async sendToIRC(message: Message, updated = false) {
    const { author } = message;
    // Ignore messages sent by the bot itself:
    if (author.id === this.discord.user?.id || this.channelMapping.webhooks.find((w) => w.id === message.author.id)) {
      return;
    }

    const channel = message.channel;
    if (!channel.isGuildText()) return;
    const channelName = `#${channel.name}`;
    const ircChannel = this.channelMapping.discordIdToMapping.get(channel.id)?.ircChannel;

    if (!ircChannel) return;
    const fromGuild = message.guild;
    if (!fromGuild) return;
    let displayUsername = '';
    let discordUsername = '';
    let member: GuildMember | undefined = undefined;
    try {
      member = await this.GuildMemberCache.get(author.id);
    } catch (e: any) {
      // Happens when a webhook is mentioned similar to a user, prevent 404 from crashing bot
      if (e instanceof DiscordAPIError) {
        this.debug && this.logger.debug(`Discord API error in user lookup, likely user was webhook:\n${e}`);
      } else {
        this.logger.error(e);
      }
    }
    // Do not send to IRC if this user is on the ignore list.
    if (member) {
      if (await this.ignoredDiscordUser(member)) {
        return;
      }
      displayUsername = member.nick || author.displayName || author.username;
      discordUsername = member.user.username;
    } else {
      // Author is a webhook
      displayUsername = message.author.displayName;
      discordUsername = message.author.username;
    }

    let text = await this.parseText(message);

    if (this.config.ircNickColor) {
      const displayColorIdx = (displayUsername.charCodeAt(0) + displayUsername.length) %
        this.ircNickColors.length;
      const discordColorIdx = (discordUsername.charCodeAt(0) + discordUsername.length) %
        this.ircNickColors.length;
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

    if (this.isCommandMessage(text) && !updated) {
      //patternMap.side = 'Discord';
      this.debug && this.logger.debug(
        `Sending command message to IRC ${ircChannel} -- ${text}`,
      );
      // if (prelude) this.ircClient.say(ircChannel, prelude);
      if (this.formatCommandPrelude) {
        const prelude = Mediator.substitutePattern(
          this.formatCommandPrelude,
          patternMap,
        );
        this.irc.privmsg(ircChannel, prelude);
      }
      this.sendIRCMessageWithSplitAndQueue(ircChannel, text);
    } else {
      if (text !== '') {
        // Convert formatting
        text = formatFromDiscordToIRC(text);
        patternMap.text = text;

        text = Mediator.substitutePattern(this.formatIRCText, patternMap);
        this.debug && this.logger.debug(
          `Sending ${updated ? 'edit' : 'message'} to IRC ${ircChannel} -- ${text}`,
        );
        if (updated) {
          text = `(edited) ${text}`;
        }
        this.sendIRCMessageWithSplitAndQueue(ircChannel, text);
      }

      if (message.attachments && message.attachments.length && !updated) {
        message.attachments.forEach((a) => {
          patternMap.attachmentURL = a.url;
          const urlMessage = Mediator.substitutePattern(
            this.formatURLAttachment,
            patternMap,
          );

          this.debug && this.logger.debug(
            `Sending attachment URL to IRC ${ircChannel} ${urlMessage}`,
          );
          this.sendIRCMessageWithSplitAndQueue(ircChannel, urlMessage);
        });
      }
    }
  }

  async notifyToIrc(message: DiscordMessage, update = false): Promise<void> {
    if (message.content.trim() === '/names') return;
    if (!message.channel.isGuildText()) return;
    // return early if message was in channel we don't post to
    if (!(this.channelMapping.discordIdToMapping.get(message.channel.id))) {
      return;
    }
    // Wait 2 seconds for PK to potentially delete
    if (this.config.pluralKit && !message.webhookID) {
      await delay(this.config.pluralKitWaitDelay ?? 2000);
      const response = await fetch(`https://api.pluralkit.me/v2/messages/${message.id}`);
      // If pluralkit registered this message, don't send it and let the webhook send later in another messageCreate
      if (response.ok) return;
    }
    const ircChannel = this.channelMapping.discordIdToMapping.get(message.channel.id)?.ircChannel;
    if (!ircChannel) return;
    await this.sendToIRC(message, update);
  }

  shouldIgnoreByPattern(text: string, ircChannel: string): boolean {
    if (!this.ignoreConfig?.ignorePatterns) return false;
    if (!this.ignoreConfig?.ignorePatterns[ircChannel]) return false;
    for (const pattern of this.ignoreConfig?.ignorePatterns[ircChannel] ?? []) {
      if (text.indexOf(pattern) !== -1) {
        return true;
      }
    }
    return false;
  }

  ignoredIrcUser(user: string) {
    return this.ignoreUsers?.irc?.some(
      (i: string) => i.toLowerCase() === user.toLowerCase(),
    ) ?? false;
  }

  findDiscordChannel(ircChannel: string) {
    return this.channelMapping.ircNameToMapping.get(ircChannel)?.discordChannel;
  }

  isCommandMessage(message: string) {
    return this.commandCharacters.some((prefix: string) => message.startsWith(prefix));
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
    const patternMatch = /{\$(.+?)}/g;
    return message.replace(
      patternMatch,
      (match: any, varName: string | number) => patternMapping[varName] || match,
    );
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

  async getDiscordUserByString(userString: string, guild: Guild | undefined) {
    const members = await guild?.members.search(userString) ?? [];
    return members.find((m) => m.user.username.toLocaleLowerCase() === userString.toLocaleLowerCase());
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
      return Mediator.substitutePattern(this.formatWebhookAvatarURL, {
        nickname: nick,
      });
    }
    return null;
  }

  findWebhook(ircChannel: string) {
    return this.channelMapping.ircNameToMapping.get(ircChannel)?.webhook;
  }

  /* Sends a message to Discord exactly as it appears */
  async sendExactToDiscord(channel: string, text: string) {
    const discordChannel = this.findDiscordChannel(channel);
    if (!discordChannel) return;

    if (discordChannel.isGuildText()) {
      this.debug && this.logger.debug(
        `Sending special message to Discord ${text} ${channel} -> #${discordChannel.name}`,
      );
      await discordChannel.send(text);
    }
  }

  async notifyToDiscord(author: string, ircChannel: string, text: string) {
    if (this.shouldIgnoreByPattern(text, ircChannel)) {
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
        const prelude = Mediator.substitutePattern(
          this.formatCommandPrelude,
          patternMap,
        );
        discordChannel.send(prelude);
      }
      discordChannel.send(text);
      return;
    }

    // TODO: Cache roles and channels
    const roles = await this.AllGuildRolesCache.get();
    if (!roles) return;
    const channels = await this.AllGuildChannelsCache.get();
    if (!channels) return;

    const processMentionables = async (input: string) => {
      if (this.ignoreConfig?.ignorePingIrcUsers?.includes(author.toLocaleLowerCase())) return input;
      return await replaceAsync(
        input,
        /([^@\s:,]+):|@([^\s]+)?/g,
        async (match, colonRef, atRef) => {
          const reference: string | undefined = colonRef || atRef;
          if (!reference) {
            return match;
          }
          // Remove discriminator from bot mentions
          const member = await this.getDiscordUserByString(reference.split('#')[0], this.guild);

          // @username => mention, case insensitively
          if (member) {
            return `<@${member.id}>`;
          }

          if (!this.allowRolePings) return match;
          // @role => mention, case insensitively
          const role = roles.find(
            (x) => x.mentionable && Mediator.caseComp(x.name, reference),
          );
          if (role) return `<@&${role.id}>`;
          return match;
        },
      );
    };

    const processEmoji = async (input: string) => {
      return await replaceAsync(input, /:(\w+):/g, async (match, ident) => {
        // :emoji: => mention, case sensitively
        // TODO: Cache emoji
        const emoji = (await this.guild.emojis.array())?.find((x) => x.name === ident && x.requireColons);
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
        const chan = channels.find((x) => Mediator.caseComp(x.name, channelName));
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
      // if (this.discord.user === null) return;
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
      const allowedMentions = [AllowedMentionType.Users];
      if (canPingEveryone) {
        allowedMentions.push(AllowedMentionType.Everyone);
      }
      if (this.allowRolePings) {
        allowedMentions.push(AllowedMentionType.Roles);
      }
      const payload: AllWebhookMessageOptions = {
        name: username,
        avatar: avatarURL,
        allowedMentions: {
          parse: allowedMentions,
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
    const withAuthor = Mediator.substitutePattern(this.formatDiscord, patternMap);
    this.debug && this.logger.debug(
      `Sending message to Discord ${withAuthor} ${ircChannel} -> #${discordChannel.name}`,
    );
    discordChannel.send(withAuthor);
  }
}
