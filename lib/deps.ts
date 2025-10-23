// IRC exports
export { Client as IrcClient } from 'https://deno.land/x/irc@v0.17.2/mod.ts';
export type { ClientOptions } from 'https://deno.land/x/irc@v0.17.2/mod.ts';
export type { PrivmsgEvent } from 'https://deno.land/x/irc@v0.17.2/plugins/privmsg.ts';
export type { ClientError } from 'https://deno.land/x/irc@v0.17.2/core/errors.ts';
export type { RegisterEvent } from 'https://deno.land/x/irc@v0.17.2/plugins/register.ts';
export type { NoticeEvent } from 'https://deno.land/x/irc@v0.17.2/plugins/notice.ts';
export type { NickEvent } from 'https://deno.land/x/irc@v0.17.2/plugins/nick.ts';
export type { JoinEvent } from 'https://deno.land/x/irc@v0.17.2/plugins/join.ts';
export type { PartEvent } from 'https://deno.land/x/irc@v0.17.2/plugins/part.ts';
export type { QuitEvent } from 'https://deno.land/x/irc@v0.17.2/plugins/quit.ts';
export type { RemoteAddr } from 'https://deno.land/x/irc@v0.17.2/core/client.ts';
export type { NicklistEvent } from 'https://deno.land/x/irc@v0.17.2/plugins/nicklist.ts';
export type { CtcpActionEvent } from 'https://deno.land/x/irc@v0.17.2/plugins/action.ts';
export type { InviteEvent } from 'https://deno.land/x/irc@v0.17.2/plugins/invite.ts';
export type { AnyRawCommand } from 'https://deno.land/x/irc@v0.17.2/core/protocol.ts';
export type { CtcpVersionEvent } from 'https://deno.land/x/irc@v0.17.2/plugins/version.ts';

// Harmony/Discord exports
export {
  AllowedMentionType,
  Client,
  Command,
  CommandClient,
  type CommandContext,
  DiscordAPIError,
  event,
  GatewayIntents,
  Guild,
  GuildChannel,
  GuildTextChannel,
  Interaction,
  InteractionResponseType,
  Member as GuildMember,
  Message,
  Role,
  slash,
  SlashCommandOptionType,
  type SlashCommandPartial,
  User,
  Webhook,
} from 'https://raw.githubusercontent.com/harmonyland/harmony/1821fc19428def11f468102631b9c53f37036f0b/mod.ts';
export type { AllWebhookMessageOptions } from 'https://raw.githubusercontent.com/harmonyland/harmony/1821fc19428def11f468102631b9c53f37036f0b/src/structures/webhook.ts';

// std exports
export { resolve as resolvePath } from 'https://deno.land/std@0.218.2/path/mod.ts';
export { parse as parseCLI } from 'https://deno.land/std@0.218.2/flags/mod.ts';
export { parse as parseJSONC } from 'https://deno.land/std@0.218.2/jsonc/mod.ts';

// Logging
import Dlog from 'https://deno.land/x/dlog2@2.0/classic.ts';
export { Dlog };

// PluralKit support
export { APIError, Member as PKMember, PKAPI } from 'https://deno.land/x/pkapi@v6.0.1/lib/mod.ts';

// Queue
export { Queue } from 'https://deno.land/x/queue@1.2.0/mod.ts';

// Time to Live cache
import TTL from 'https://deno.land/x/ttl@1.0.1/mod.ts';
export { TTL };

// Event handler
export { Reflect } from 'https://deno.land/x/reflect_metadata@v0.1.12/mod.ts';

// Regex escape
export { escapeStringRegexp } from 'https://deno.land/x/escape_string_regexp@v0.0.1/mod.ts';
