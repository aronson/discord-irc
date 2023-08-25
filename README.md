[![Coverage Status](https://coveralls.io/repos/github/reactiflux/discord-irc/badge.svg?branch=main)](https://coveralls.io/github/reactiflux/discord-irc?branch=main)

> Connects [Discord](https://discord.com/) and [IRC](https://www.ietf.org/rfc/rfc1459.txt) channels by sending messages back and forth.

## Example

![discord-irc](http://i.imgur.com/oI6iCrf.gif)

## Installation and usage

**Note**: discord-irc requires Node.js version 12 or newer, as it depends on [discord.js](https://github.com/hydrabolt/discord.js).
Future versions may require newer Node.js versions, though we should support active releases.

Before you can run discord-irc you need to create a configuration file by
following the instructions [here](https://github.com/reactiflux/discord-irc#configuration).
After you've done that you can replace `/path/to/config.json` in the commands
below with the path to your newly created configuration file - or just `config.json` if it's
in the same directory as the one you're starting the bot from.

When you've done that you can install and start the bot either through npm:

```bash
$ npm install -g discord-irc
$ discord-irc --config /path/to/config.json
```

or by cloning the repository:

```bash
In the repository folder:
$ npm install
$ npm run build
$ npm start -- --config /path/to/config.json # Note the extra double dash
```

It can also be used as a module:

```js
import discordIRC from 'discord-irc';
import config from './config.json';
discordIRC(config);
```

## Docker

As an alternative to running discord-irc directly on your machine, we provide a [Docker container image](https://hub.docker.com/r/discordirc/discord-irc).
After creating a configuration file, you can fetch the image from Docker Hub and run it with the following command:

```bash
docker run -v /path/to/config:/config/config.json discordirc/discord-irc
```

If you've checked out the repository already, you can build the Docker image locally and run that instead:

```bash
docker build -t discord-irc .
docker run -v /path/to/config:/config/config.json discord-irc
```

Note that the path to the config file on the host (`/path/to/config`) _must_ be a valid absolute path to a config file.
Otherwise, you may get the error "illegal operation on a directory".

## Configuration

First you need to create a Discord bot user, which you can do by following the instructions [here](https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token).

### Example configuration

```js
[
  // Bot 1 (minimal configuration):
  {
    nickname: 'test2',
    server: 'irc.testbot.org',
    discordToken: 'botwantsin123',
    channelMapping: {
      '#other-discord': '#new-irc-channel',
    },
  },

  // Bot 2 (advanced options):
  {
    nickname: 'test',
    server: 'irc.bottest.org',
    discordToken: 'botwantsin123',
    autoSendCommands: [
      // Commands that will be sent on connect
      ['PRIVMSG', 'NickServ', 'IDENTIFY password'],
      ['MODE', 'test', '+x'],
      ['AUTH', 'test', 'password'],
    ],
    channelMapping: {
      // Maps each Discord-channel to an IRC-channel, used to direct messages to the correct place
      '#discord': '#irc channel-password', // Add channel keys after the channel name
      1234567890: '#channel', // Use a discord channel ID instead of its name (so you can rename it or to disambiguate)
    },
    ircOptions: {
      // Optional node-irc options
      floodProtection: false, // On by default
      floodProtectionDelay: 1000, // 500 by default
      port: '6697', // 6697 by default
      secure: true, // enable SSL, false by default
      sasl: true, // false by default
      username: 'test', // nodeirc by default
      password: 'p455w0rd', // empty by default
    },
    format: {
      // Optional custom formatting options
      // Patterns, represented by {$patternName}, are replaced when sending messages
      commandPrelude: 'Command sent by {$nickname}', // Message sent before a command
      ircText: '<{$displayUsername}> {$text}', // When sending a message to IRC
      urlAttachment: '<{$displayUsername}> {$attachmentURL}', // When sending a Discord attachment to IRC
      discord: '**<{$author}>** {$withMentions}', // When sending a message to Discord
      // Other patterns that can be used:
      // {$discordChannel} (e.g. #general)
      // {$ircChannel} (e.g. #irc)
      webhookAvatarURL: 'https://robohash.org/{$nickname}', // Default avatar to use for webhook messages
    },
    ircNickColor: false, // Gives usernames a color in IRC for better readability (on by default)
    ircNickColors: [
      'light_blue',
      'dark_blue',
      'light_red',
      'dark_red',
      'light_green',
      'dark_green',
      'magenta',
      'light_magenta',
      'orange',
      'yellow',
      'cyan',
      'light_cyan',
    ], // Which irc-upd colors to use
    parallelPingFix: true, // Prevents users of both IRC and Discord from being mentioned in IRC when they speak in Discord (off by default)
    // Makes the bot hide the username prefix for messages that start
    // with one of these characters (commands):
    commandCharacters: ['!', '.'],
    ircStatusNotices: true, // Enables notifications in Discord when people join/part in the relevant IRC channel
    ignoreUsers: {
      irc: ['irc_nick1', 'irc_nick2'], // Ignore specified IRC nicks and do not send their messages to Discord.
      discord: ['discord_nick1', 'discord_nick2'], // Ignore specified Discord nicks and do not send their messages to IRC.
      discordIds: ['198528216523210752'], // Ignore specified Discord ids and do not send their messages to IRC.
    },
    // List of webhooks per channel
    webhooks: {
      '#discord': 'https://discord.com/api/webhooks/id/token',
    },
  },
];
```

The `ircOptions` object is passed directly to irc-upd ([available options](https://node-irc-upd.readthedocs.io/en/latest/API.html#irc.Client)).

To retrieve a discord channel ID, write `\#channel` on the relevant server – it should produce something of the form `<#1234567890>`, which you can then use in the `channelMapping` config.

### Webhooks

Webhooks lets you override nicknames and avatars, so messages coming from IRC
can appear as regular Discord messages:

![discord-webhook](http://i.imgur.com/lNeJIUI.jpg)

To enable webhooks, follow part 1 of [this
guide](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks)
to create and retrieve a webhook URL for a specific channel, then enable it in
discord-irc's config as follows:

```json
  "webhooks": {
    "#discord-channel": "https://discord.com/api/webhooks/id/token"
  }
```

### Encodings

If you encounter trouble with some characters being corrupted from some clients (particularly umlauted characters, such as `ä` or `ö`), try installing the optional dependencies `iconv` and `node-icu-charset-detector`.
The bot will produce a warning when started if the IRC library is unable to convert between encodings.

Further information can be found in [the installation section of irc-upd](https://github.com/Throne3d/node-irc#character-set-detection).

## Tests

Run the tests with:

```bash
$ npm test
```

## Style Guide

discord-irc follows the [Airbnb Style Guide](https://github.com/airbnb/javascript).
[ESLint](http://eslint.org/) is used to make sure this is followed correctly, which can be run with:

```bash
$ npm run lint
```
