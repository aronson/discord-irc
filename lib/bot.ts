import { Mediator } from './mediator.ts';
import { ClientOptions, Dlog } from './deps.ts';
import { Dictionary } from './helpers.ts';
import { Config } from './config.ts';
import { ChannelMapper } from './channelMapping.ts';
import { DiscordClient } from './discordClient.ts';
import { CustomIrcClient } from './ircClient.ts';
import { DEBUG, VERBOSE } from './env.ts';

export default class Bot {
  mediator?: Mediator;
  discord?: DiscordClient;
  logger: Dlog;
  config: Config;
  channelUsers: Dictionary<Array<string>> = {};
  channelMapping: ChannelMapper | null = null;
  ircClient?: CustomIrcClient;
  debug: boolean = DEBUG;
  verbose: boolean = VERBOSE;
  exiting = false;
  constructor(config: Config) {
    this.config = config;
    if (config.logToFile) {
      this.logger = new Dlog(config.nickname, true, config.logFolder ?? '.');
    } else {
      this.logger = new Dlog(config.nickname);
    }
  }

  async connect() {
    this.debug && this.logger.debug('Initializing...');
    if (this.ircClient) {
      this.logger.info('Connecting to Discord');
    }
    this.discord = this.createDiscordClient(this.config);
    await this.discord.connect();

    // Extract id and token from Webhook urls and connect.
    this.channelMapping = await ChannelMapper.CreateAsync(this.config, this, this.discord);

    // Create IRC client
    const ircOptions: ClientOptions = {
      nick: this.config.nickname,
      username: this.config.nickname,
      realname: this.config.nickname,
      password: this.config.ircOptions?.password,
      reconnect: {
        attempts: Number.MAX_SAFE_INTEGER,
        delay: 3,
      },
      ...this.config.ircOptions,
    };
    this.ircClient = this.createIrcClient(ircOptions);
    this.mediator = new Mediator(
      this.discord,
      this.ircClient,
      this.config,
      this.channelMapping,
      this.channelUsers,
      this.logger,
    );

    await this.ircClient.connect(this.config.server, this.config.port, this.config.tls);
  }

  createIrcClient(ircOptions: ClientOptions) {
    return new CustomIrcClient(ircOptions, this);
  }

  createDiscordClient(config: Config) {
    return new DiscordClient(
      config.discordToken,
      this.channelUsers,
      this.logger,
      config.sendMessageUpdates ?? false,
    );
  }

  async disconnect() {
    this.exiting = true;
    await this.ircClient?.quit();
    this.ircClient?.disconnect();
    await this.discord?.destroy();
  }
}
