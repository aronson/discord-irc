import { ChannelMapper } from './channelMapping.ts';
import { Dictionary, escapeMarkdown } from './helpers.ts';
import { Client, Dlog, event, GatewayIntents, Interaction, Message, slash, SlashCommandPartial } from './deps.ts';
import { DEBUG, VERBOSE } from './env.ts';

const namesCommand: SlashCommandPartial = {
  name: 'names',
  description: 'List the users in the connected IRC channel.',
};

export class DiscordClient extends Client {
  private logger: Dlog;
  private sendMessageUpdates: boolean;
  private mapper?: ChannelMapper;
  private channelUsers: Dictionary<string[]>;
  constructor(
    discordToken: string,
    channelUsers: Dictionary<string[]>,
    logger: Dlog,
    sendMessageUpdates: boolean,
  ) {
    super({
      intents: [
        GatewayIntents.GUILDS,
        GatewayIntents.GUILD_MEMBERS,
        GatewayIntents.GUILD_MESSAGES,
        GatewayIntents.MESSAGE_CONTENT,
      ],
      token: discordToken,
    });
    this.channelUsers = channelUsers;
    this.logger = logger;
    this.sendMessageUpdates = sendMessageUpdates;
    // Reconnect event has to be hooked manually due to naming conflict
    this.on('reconnect', (shardId) => logger.info(`Reconnected to Discord (shard ID ${shardId})`));
  }

  async bindNotify(notify: (m: Message, b: boolean) => Promise<void>, mapper: ChannelMapper) {
    this.on('messageCreate', async (ev) => await notify(ev, false));
    this.on('messageUpdate', async (_, ev) => {
      if (!this.sendMessageUpdates) return;
      await notify(ev, true);
    });
    try {
      this.mapper = mapper;
      const guild = mapper.mappings[0].discordChannel.guild;
      await this.interactions.commands.create(namesCommand, guild);
      this.logger.done('Created /names slash command.');
    } catch (e) {
      this.logger.error(`Failed to create /names command! Details:\n${e}`);
    }
  }

  @slash()
  async names(i: Interaction) {
    if (!i.channel || !this.mapper) return;
    const ircChannel = this.mapper.discordIdToMapping.get(i.channel.id)?.ircChannel;
    // return early if message was in channel we don't post to
    if (!ircChannel) return;
    const users = this.channelUsers[ircChannel];
    if (users && users.length > 0) {
      const ircNamesArr = new Array(...users);
      await i.respond({
        content: `Users in ${ircChannel}\n> ${
          ircNamesArr
            .map(escapeMarkdown)
            .join(', ')
        }`,
      });
    } else {
      this.logger.warn(
        `No channelUsers found for ${ircChannel} when /names requested`,
      );
    }
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
