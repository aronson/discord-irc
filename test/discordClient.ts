import { Dlog } from '../lib/deps.ts';
import { DiscordClient } from '../lib/discordClient.ts';

export class MockDiscordClient extends DiscordClient {
  constructor() {
    const logger = new Dlog('Deno.test');
    super('', {}, logger, false);
  }
}
