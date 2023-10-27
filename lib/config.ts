import { z } from 'https://deno.land/x/zod@v3.16.1/mod.ts';
import { ClientOptions } from './deps.ts';
import { Dictionary } from './helpers.ts';

export type Format = {
  ircText?: string;
  discord?: string;
  urlAttachment?: string;
  commandPrelude?: string;
  webhookAvatarURL?: string;
};

export type IgnoreUsers = {
  irc?: string[];
  discord?: string[];
  discordIds?: string[];
  roles?: string[];
};

export type GameLogConfig = {
  patterns: {
    user: string;
    matches: {
      regex: string;
      color: string;
    }[];
  }[];
};

export type IgnoreConfig = {
  ignorePatterns?: Dictionary<string[]>;
  ignorePingIrcUsers?: string[];
};

const AutoSendSchema = z.array(z.array(z.string())).optional();

export type Config = {
  server: string;
  port?: number;
  tls?: boolean;
  nickname: string;
  discordToken: string;
  channelMapping: Dictionary<string>;
  ircOptions?: Partial<ClientOptions>;
  sendMessageUpdates?: boolean;
  commandCharacters?: string[];
  ircNickColor?: boolean;
  ircNickColors?: string[];
  parallelPingFix?: boolean;
  ircStatusNotices?: boolean;
  announceSelfJoin?: boolean;
  webhooks?: Dictionary<string>;
  ignoreUsers?: IgnoreUsers;
  gameLogConfig?: GameLogConfig;
  ignoreConfig?: IgnoreConfig;
  // "{$keyName}" => "variableValue"
  // author/nickname: nickname of the user who sent the message
  // discordChannel: Discord channel (e.g. #general)
  // ircChannel: IRC channel (e.g. #irc)
  // text: the (appropriately formatted) message content
  format?: Format;
  autoSendCommands?: z.infer<typeof AutoSendSchema>;
  allowRolePings?: boolean;
  logToFile?: boolean;
  logFolder?: string;
  pluralKit?: boolean;
  pkCacheSeconds?: number;
};

export const FormatSchema = z.object({
  ircText: z.string().optional(),
  discord: z.string().optional(),
  urlAttachment: z.string().optional(),
  commandPrelude: z.string().optional(),
  webhookAvatarURL: z.string().optional(),
});

export const IgnoreUsersSchema = z.object({
  irc: z.array(z.string()).optional(),
  discord: z.array(z.string()).optional(),
  discordIds: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional(),
});

export const GameLogConfigSchema = z.object({
  patterns: z.array(
    z.object({
      user: z.string(),
      matches: z.array(
        z.object({
          regex: z.string(),
          color: z.string(),
        }),
      ),
    }),
  ),
});

export const IgnoreConfigSchema = z.object({
  ignorePatterns: z.record(z.array(z.string())).optional(),
  ignorePingIrcUsers: z.array(z.string()).optional(),
});

export const ConfigSchema = z.object({
  server: z.string(),
  port: z.number().optional(),
  tls: z.boolean().optional(),
  nickname: z.string(),
  discordToken: z.string(),
  channelMapping: z.record(z.string()),
  ircOptions: z.custom<Partial<ClientOptions>>().optional(),
  sendMessageUpdates: z.boolean().optional(),
  commandCharacters: z.array(z.string()).optional(),
  ircNickColor: z.boolean().optional(),
  ircNickColors: z.array(z.string()).optional(),
  parallelPingFix: z.boolean().optional(),
  ircStatusNotices: z.boolean().optional(),
  announceSelfJoin: z.boolean().optional(),
  webhooks: z.record(z.string()).optional(),
  ignoreUsers: IgnoreUsersSchema.optional(),
  gameLogConfig: GameLogConfigSchema.optional(),
  ignoreConfig: IgnoreConfigSchema.optional(),
  format: FormatSchema.optional(),
  autoSendCommands: AutoSendSchema,
  allowRolePings: z.boolean().optional(),
  logToFile: z.boolean().optional(),
  logFolder: z.string().optional(),
  pluralKit: z.boolean().optional(),
  pkCacheSeconds: z.number().optional(),
});

const ConfigArraySchema = z.array(ConfigSchema);

export function parseConfigObject(input: any) {
  if (Array.isArray(input)) {
    const result = ConfigArraySchema.safeParse(input);
    return result;
  } else {
    return ConfigSchema.safeParse(input);
  }
}
