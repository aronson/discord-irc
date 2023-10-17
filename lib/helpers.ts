import { ConfigurationError } from './errors.ts';
import { Config } from './config.ts';
import Bot from './bot.ts';

export const tuple = <T extends unknown[]>(args: [...T]): T => args;

export async function exists(filename: string) {
  try {
    await Deno.stat(filename);
    // successful, file or directory must exist
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      // file or directory does not exist
      return false;
    } else {
      // unexpected error, maybe permissions, pass it along
      throw error;
    }
  }
}

export function invert(obj: any) {
  // WARNING: This is not a drop in replacement solution and
  // it might not work for some edge cases. Test your code!
  return Object.entries(obj).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [value as string]: key,
    }),
    {},
  );
}

export async function forEachAsync<T>(
  array: Array<T>,
  callback: (item: T, index: number) => Promise<void>,
) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index);
  }
}

export async function replaceAsync(
  str: string,
  regex: RegExp,
  asyncFn: (match: any, ...args: any) => Promise<any>,
) {
  const promises: Promise<any>[] = [];
  str.replace(regex, (match, ...args) => {
    promises.push(asyncFn(match, ...args));
    return match;
  });
  const data = await Promise.all(promises);
  return str.replace(regex, () => data.shift());
}

export function isObject(a: any) {
  return a instanceof Object;
}

export interface Dictionary<T> {
  [index: string]: T;
}

export function escapeMarkdown(text: string) {
  const unescaped = text.replace(/\\(\*|_|`|~|\\)/g, '$1'); // unescape any "backslashed" character
  const escaped = unescaped.replace(/(\*|_|`|~|\\)/g, '\\$1'); // escape *, _, `, ~, \
  return escaped;
}

/**
 * Reads from the provided config file and returns an array of bots
 * @return {object[]}
 */
export function createBots(
  configFile: Config | Config[],
): Bot[] {
  const bots: Bot[] = [];

  // The config file can be both an array and an object
  // The config file can be both an array and an object
  if (Array.isArray(configFile)) {
    configFile.forEach((config) => {
      const bot = new Bot(config);
      bot.connect();
      bots.push(bot);
    });
  } else if (isObject(configFile)) {
    const bot = new Bot(configFile);
    bot.connect();
    bots.push(bot);
  } else {
    throw new ConfigurationError('');
  }

  return bots;
}
