import { ChannelMapper } from './channelMapping.ts';
import { Dictionary, escapeMarkdown } from './helpers.ts';
import { Command, CommandClient, CommandContext, Dlog, event, GatewayIntents, Message } from './deps.ts';
import { DEBUG, VERBOSE } from './env.ts';

class Names extends Command {
  name = 'names';
  private channelMapping?: ChannelMapper;
  private channelUsers: Dictionary<string[]>;
  private logger: Dlog;

  constructor(channelUsers: Dictionary<Array<string>>, logger: Dlog) {
    super();
    this.channelUsers = channelUsers;
    this.logger = logger;
    this.execute = this.execute.bind(this);
  }

  bindMap(map: ChannelMapper) {
    this.channelMapping = map;
  }

  async execute(ctx: CommandContext): Promise<void> {
    const ircChannel = this.channelMapping?.discordIdToMapping.get(ctx.channel.id)?.ircChannel;
    // return early if message was in channel we don't post to
    if (!ircChannel) return;
    const users = this.channelUsers[ircChannel];
    if (users && users.length > 0) {
      const ircNamesArr = new Array(...users);
      await ctx.message.reply(
        `Users in ${ircChannel}\n> ${
          ircNamesArr
            .map(escapeMarkdown)
            .join(', ')
        }`,
      );
    } else {
      this.logger.warn(
        `No channelUsers found for ${ircChannel} when /names requested`,
      );
    }
  }
}

export class DiscordClient extends CommandClient {
  private logger: Dlog;
  private sendMessageUpdates: boolean;
  private names: Names;
  constructor(
    discordToken: string,
    channelUsers: Dictionary<string[]>,
    logger: Dlog,
    sendMessageUpdates: boolean,
  ) {
    super({
      prefix: '/',
      caseSensitive: false,
      intents: [
        GatewayIntents.GUILDS,
        GatewayIntents.GUILD_MEMBERS,
        GatewayIntents.GUILD_MESSAGES,
        GatewayIntents.MESSAGE_CONTENT,
      ],
      token: discordToken,
    });
    this.logger = logger;
    this.sendMessageUpdates = sendMessageUpdates;
    // Reconnect event has to be hooked manually due to naming conflict
    this.on('reconnect', (shardId) => logger.info(`Reconnected to Discord (shard ID ${shardId})`));
    this.names = new Names(channelUsers, logger);
    this.commands.add(this.names);
  }

  bindNotify(notify: (m: Message, b: boolean) => Promise<void>, mapper: ChannelMapper) {
    this.on('messageCreate', async (ev) => await notify(ev, false));
    this.on('messageUpdate', async (ev) => {
      if (!this.sendMessageUpdates) return;
      await notify(ev, true);
    });
    this.names.bindMap(mapper);
  }

  @event()
  ready(): void {
    this.logger.done('Connected to Discord');
  }

  @event()
  error(error: Error): void {
    this.logger.error('Received error event from Discord');
    console.log(error);
  }

  @event()
  debug(message: string): void {
    if (!VERBOSE && containsIgnoredMessage(message)) {
      return;
    }
    if (!DEBUG) return;
    this.logger.debug(
      `Received debug event from Discord: ${JSON.stringify(message, null, 2)}`,
    );
  }
}

const ignoreMessages = [/Heartbeat ack/, /heartbeat sent/, /Shard/];

function containsIgnoredMessage(str: string): boolean {
  return ignoreMessages.some((regex) => regex.test(str));
}
