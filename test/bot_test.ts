import { MockIrcClient } from './ircClient.ts';
import { assertSpyCalls, stub } from 'https://deno.land/std@0.204.0/testing/mock.ts';
import { assertEquals } from 'https://deno.land/std@0.204.0/assert/mod.ts';
import Bot from '../lib/bot.ts';

import { Config } from '../mod.ts';
import { MockDiscordClient } from './discordClient.ts';

const testConfig: Config = {
  server: 'irc.example.org',
  nickname: 'DiscordIrcBot',
  discordToken: '[REDACTED]',
  channelMapping: {
    '#discord-channel': '#irc-channel',
  },
  sendMessageUpdates: true,
  commandCharacters: ['!', '>'],
  ircStatusNotices: true,
  webhooks: {
    '#discord-channel': 'https://example.org/webhook/foo-bar-baz',
  },
};

Deno.test(
  'Bot initializes',
  { permissions: { env: true } },
  async (t) => {
    const bot = new Bot(testConfig);

    await t.step('Bot connects to Discord and IRC', async () => {
      // Discord mocks
      const mockDiscord = new MockDiscordClient();
      const createDiscordStub = stub(bot, 'createDiscordClient', () => mockDiscord);
      const connectDiscordStub = stub(mockDiscord, 'connect', () => Promise.resolve(mockDiscord));
      // IRC mocks
      const createIrcStub = stub(bot, 'createIrcClient', () => new MockIrcClient(bot));
      await bot.connect();
      assertEquals(bot.discord, mockDiscord);
      assertSpyCalls(createDiscordStub, 1);
      assertSpyCalls(connectDiscordStub, 1);
      assertSpyCalls(createIrcStub, 1);
    });
  },
);
