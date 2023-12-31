# Discord and IRC Relay

> Connects [Discord](https://discord.com/) and [IRC](https://www.ietf.org/rfc/rfc1459.txt) channels by sending messages
> back and forth. This project was originally written [here](https://github.com/reactiflux/discord-irc).

[![CI](https://github.com/aronson/discord-irc/actions/workflows/ci.yaml/badge.svg)](https://github.com/aronson/discord-irc/actions/workflows/ci.yaml)
[![Publish Docker Image and Native Binaries](https://github.com/aronson/discord-irc/actions/workflows/build.yaml/badge.svg)](https://github.com/aronson/discord-irc/actions/workflows/build.yaml)

## Example

![discord-irc](http://i.imgur.com/oI6iCrf.gif)

## Installation and usage

Before you can run discord-irc you need to create a configuration file by following the instructions
[here](https://github.com/aronson/discord-irc#configuration).

### Running native builds (easiest)

Start the bot by downloading the [latest release](https://github.com/aronson/discord-irc/releases) for your platform.

#### Windows

The easiest method is place your config.json in the same folder as discord-irc-windows-x86_64.exe and double-click the
application.

To run manually from command line, or adjust the config file path:

```batch
.\discord-irc-windows-x86_64.exe -c .\config.json
```

#### Linux/macOS

```bash
## Linux users may need to mark as executable first
chmod +x ./discord-irc-linux-x64
./discord-irc-linux-x64 -c ./config.json

## Apple users may need to mark as executable and disable quarantine before running
chmod +x ./discord-irc-apple-* && xattr -c ./discord-irc-apple-*
./discord-irc-apple-* -c ./config.json
```

#### OpenBSD

OpenBSD's Deno distribution currently fails to produce a binary for discord-irc. For now, users should run from source:

```bash
## Install git if not present
pkg_add git
## Install deno
pkg_add deno
## Clone the repo
git clone https://github.com/aronson/discord-irc.git
## Copy your config.json in
cp /path/to/config.json discord-irc/
## Enter source directory
cd discord-irc/
## Start with deno.
deno task start
```

Deno is only provided as a binary package on OpenBSD 7.4+.

#### Config file location

If run with no arguments, the application will search for a `config.json` within the current working directory.

### Running with Deno (developers)

For _development_ work, discord-irc requires [Deno](https://deno.com), as it depends on
[Harmony](https://harmony.mod.land) and [deno-irc](https://deno.land/x/irc). Please see the
[official install instructions](https://deno.land/manual/getting_started/installation) to install Deno for your
platform.

```bash
## Clone the repo
git clone https://github.com/aronson/discord-irc.git
## Copy your config.json in
cp /path/to/config.json discord-irc/
## Enter source directory
cd discord-irc/
## Start with deno.
deno task start

## For custom path
CONFIG_FILE=/path/to/config.json deno task start
```

It can also be used as a module:

```ts
import {
  Config,
  createBots,
  parseConfigObject,
} from 'https://raw.githubusercontent.com/aronson/discord-irc/main/mod.ts';

// Read local config file into an object
const configFileObject = JSON.parse(Deno.readTextFileSync('./config.json'));
// Parse against provided JSON schema to validate integrity of config
const result = parseConfigObject(configFileObject);
if (!result.success) {
  console.log('Error parsing configuration:');
  console.log(result.error);
} else {
  // May still fail if invalid ircOptions
  const config = result.data as Config | Config[];

  const bots = createBots(config);

  // Graceful shutdown of network clients
  Deno.addSignalListener('SIGINT', async () => {
    bots[0].logger.warn('Received Ctrl+C! Disconnecting...');
    for (const bot of bots) {
      try {
        await bot.disconnect();
      } catch (e) {
        bot.logger.error(e);
      }
    }
    Deno.exit();
  });
}
```

### Docker

As an alternative to running discord-irc directly on your machine, we provide a Docker container image. After creating a
configuration file, you can fetch the image from Docker Hub and run it with the following command:

```bash
docker run -v /path/to/config.json:/app/config.json ghcr.io/aronson/discord-irc
```

If you've checked out the repository already, you can build the Docker image locally and run that instead:

```bash
docker build -t discord-irc .
docker run -v /path/to/config.json:/app/config.json discord-irc
```

Note that the path to the config file on the host (`/path/to/`) _must_ be a valid absolute path to a config file.
Otherwise, you may get the error "illegal operation on a directory".

## Configuration

First you need to create a Discord bot user, which you can do by following the instructions
[here](https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token).

### Example configuration

```jsonc
// Bot 1 (minimal configuration):
{
  "nickname": "test",
  "server": "irc.testbot.org",
  "discordToken": "botwantsin123",
  "channelMapping": {
    "#other-discord": "#new-irc-channel"
  }
}
```

```jsonc
// Bot 2 (advanced options, note some are conflicting):
{
  "nickname": "test",
  "server": "irc.bottest.org",
  "port": 6697,
  "tls": true,
  "discordToken": "botwantsin123",
  "channelMapping": {
    // Maps each Discord-channel to an IRC-channel, used to direct messages to the correct place
    "#discord": "#irc channel-password", // Add channel keys after the channel name
    "1234567890": "#channel" // Use a discord channel ID instead of its name (so you can rename it or to disambiguate)
  },
  "ircOptions": {
    // Deno/irc options, see https://github.com/jeromeludmann/deno-irc/blob/main/API.md#options
    "username": "test",
    "password": "p455w0rd",
    "floodDelay": 2000 // milliseconds to wait between messages to avoid flood, 1000-2000 is generally safe
  },
  "format": {
    // Optional custom formatting options
    // Patterns, represented by {$patternName}, are replaced when sending messages
    "commandPrelude": "Command sent by {$nickname}", // Message sent before a command
    "ircText": "<{$displayUsername} [@{$discordUsername}]> {$text}", // When sending a message to IRC
    "urlAttachment": "<{$displayUsername} [@{$discordUsername}]> {$attachmentURL}", // When sending a Discord attachment to IRC
    "discord": "**<{$author}>** {$withMentions}", // When sending a message to Discord
    // Other patterns that can be used:
    // {$discordChannel} (e.g. #general)
    // {$ircChannel} (e.g. #irc)
    "webhookAvatarURL": "https://robohash.org/{$nickname}" // Default avatar to use for webhook messages
  },
  "sendMessageUpdates": true, // Send edits to messages as follow up messages in IRC (off by default)
  "ircNickColor": true, // Gives usernames a color in IRC for better readability (on by default)
  // Not including this property will use all the default colors
  "ircNickColors": [
    "light_blue",
    "dark_blue",
    "light_red",
    "dark_red",
    "light_green",
    "dark_green",
    "magenta",
    "light_magenta",
    "orange",
    "yellow",
    "cyan",
    "light_cyan"
  ], // Which deno-irc colors to use
  // Makes the bot hide the username prefix for messages that start
  // with one of these characters (commands):
  "commandCharacters": ["!", "."],
  "ircStatusNotices": true, // Enables notifications in Discord when people join/part in the relevant IRC channel
  "ignoreUsers": {
    "irc": ["irc_nick1", "irc_nick2"], // Ignore specified IRC nicks and do not send their messages to Discord.
    "discord": ["discord_nick1", "discord_nick2"], // Ignore specified Discord nicks and do not send their messages to IRC.
    "discordIds": ["198528216523210752"] // Ignore specified Discord ids and do not send their messages to IRC.
  },
  // Use webhooks
  "webhooks": true,
  // Commands that will be sent on connect
  // Note: these are typically optional and only provided as a reference
  "autoSendCommands": [
    // NickServ is better handled by ircOptions.password
    ["PRIVMSG", "NickServ", "IDENTIFY password"],
    ["MODE", "test", "+x"],
    ["AUTH", "test", "password"]
  ]
}
```

The `ircOptions` object is passed directly to deno/irc
([available options](https://github.com/jeromeludmann/deno-irc/blob/main/API.md#options)).

To retrieve a discord channel ID, write `\#channel` on the relevant server – it should produce something of the form
`<#1234567890>`, which you can then use in the `channelMapping` config.

### Webhooks

Webhooks lets you override nicknames and avatars, so messages coming from IRC can appear as regular Discord messages:

![discord-webhook](http://i.imgur.com/lNeJIUI.jpg)

To enable webhooks, enable them in discord-irc's config as follows:

```json
"webhooks": true
```

The bot will automatically create and re-use its own webhooks.

## Tests (TODO)

Run the tests with:

```bash
deno test
```

## Style Guide

discord-irc follows the deno standard styles with some tweaks. Please use `deno lint` and `deno fmt` to make sure this
is followed correctly.
