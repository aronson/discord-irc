import Bot from '../lib/bot.ts';
import { CustomIrcClient } from '../lib/ircClient.ts';

export class MockIrcClient extends CustomIrcClient {
  constructor(bot: Bot) {
    super({ nick: 'me' }, bot);
  }
  connect() {
    return Promise.resolve(null);
  }
}
