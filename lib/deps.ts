// IRC exports
export { Client as IrcClient } from 'https://deno.land/x/irc@v0.15.0/mod.ts';
export type { ClientOptions } from 'https://deno.land/x/irc@v0.15.0/mod.ts';
export type { PrivmsgEvent } from 'https://deno.land/x/irc@v0.15.0/plugins/privmsg.ts';
export type { ClientError } from 'https://deno.land/x/irc@v0.15.0/core/errors.ts';
export type { RegisterEvent } from 'https://deno.land/x/irc@v0.15.0/plugins/register.ts';
export type { NoticeEvent } from 'https://deno.land/x/irc@v0.15.0/plugins/notice.ts';
export type { NickEvent } from 'https://deno.land/x/irc@v0.15.0/plugins/nick.ts';
export type { JoinEvent } from 'https://deno.land/x/irc@v0.15.0/plugins/join.ts';
export type { PartEvent } from 'https://deno.land/x/irc@v0.15.0/plugins/part.ts';
export type { QuitEvent } from 'https://deno.land/x/irc@v0.15.0/plugins/quit.ts';
export type { RemoteAddr } from 'https://deno.land/x/irc@v0.15.0/core/client.ts';
export type { NicklistEvent } from 'https://deno.land/x/irc@v0.15.0/plugins/nicklist.ts';
export type { CtcpActionEvent } from 'https://deno.land/x/irc@v0.15.0/plugins/action.ts';
export type { InviteEvent } from 'https://deno.land/x/irc@v0.15.0/plugins/invite.ts';
export type { AnyRawCommand } from 'https://deno.land/x/irc@v0.15.0/core/protocol.ts';
// Harmony/Discord exports
export {
  AllowedMentionType,
  Client,
  GatewayIntents,
  Guild,
  GuildTextChannel,
  Message,
  User,
  Webhook,
} from 'https://raw.githubusercontent.com/harmonyland/harmony/main/mod.ts';
// std exports
export { resolve as resolvePath } from 'https://deno.land/std@0.203.0/path/mod.ts';
export { parse as parseCLI } from 'https://deno.land/std@0.203.0/flags/mod.ts';
export { parse as parseJSONC } from 'https://deno.land/std@0.203.0/jsonc/mod.ts';
// Logging
import Dlog from 'https://deno.land/x/dlog2@2.0/classic.ts';
export { Dlog };
