#!/usr/bin/env -S deno run -A
import { Dlog } from './deps.ts';

import { parseCLI, parseJSONC, resolvePath } from './deps.ts';
import * as helpers from './helpers.ts';
import { Config, parseConfigObject } from './config.ts';

function testIrcOptions(obj: any): string | null {
  if ('userName' in obj) {
    return 'You must provide username not userName!';
  }
  if ('realName' in obj) {
    return 'You must provide realname not realName!';
  }
  if ('retryCount' in obj) {
    return 'You cannot use retryCount, use the sane defaults or read the documentation';
  }
  if ('retryDelay' in obj) {
    return 'You cannot use retryDelay, use the sane defaults or read the documentation';
  }
  if ('floodProtection' in obj) {
    return 'flood protection is enabled through property floodDelay in milliseconds';
  }
  return null;
}

async function run() {
  const opts = parseCLI(Deno.args, { alias: { c: 'config' } });

  let configFilePath: string;
  if (opts.config) {
    configFilePath = opts.config;
  } else {
    configFilePath = Deno.env.get('CONFIG_FILE') ?? './config.json';
  }
  configFilePath = resolvePath(configFilePath);

  const logger = new Dlog('discord-irc');
  if (!await helpers.exists(configFilePath)) {
    logger.error('Config file could not be found.');
    return;
  }

  const configObj = parseJSONC(await Deno.readTextFile(configFilePath));
  const result = parseConfigObject(configObj);
  if (!result.success) {
    logger.error('Error parsing configuration:');
    console.log(result.error);
    return;
  }
  let config: Config | Config[] | null = null;
  // May still fail if invalid ircOptions
  if (Array.isArray(result.data)) {
    const valid = result.data.reduce((acc, config) => {
      if (!config.ircOptions) {
        return acc;
      }
      const ircOptionsTestResult = testIrcOptions(config.ircOptions);
      if (ircOptionsTestResult !== null) {
        logger.error('Error parsing ircOptions:');
        console.log(ircOptionsTestResult);
        return false;
      }
      return acc;
    }, true);
    if (valid) {
      config = result.data as Config[];
    }
  } else {
    const ircOptionsTestResult = result.data.ircOptions ? testIrcOptions(result.data.ircOptions) : null;
    if (ircOptionsTestResult !== null) {
      logger.error('Error parsing ircOptions:');
      console.log(ircOptionsTestResult);
    } else {
      config = result.data as Config;
    }
  }
  if (!config) {
    logger.error('Cannot start due to invalid configuration');
    return;
  }
  const bots = helpers.createBots(config);
  const shutdown = async () => {
    const thisLogger = bots.length === 1 ? bots[0].logger : logger;
    thisLogger.warn('Received shutdown event! Disconnecting...');
    await helpers.forEachAsync(bots, async (bot) => {
      try {
        await bot.disconnect();
      } catch (e) {
        bot.logger.error(e);
      }
    });
    Deno.exit();
  };
  // Graceful shutdown of network clients
  Deno.addSignalListener('SIGINT', shutdown);
  Deno.addSignalListener('SIGTERM', shutdown);
  return bots;
}

export default run;
