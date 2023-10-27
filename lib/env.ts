const debug = 'DEBUG';
const verbose = 'VERBOSE';
export const DEBUG = (Deno.env.get(debug) ?? Deno.env.get(verbose) ?? 'false').toLowerCase() === 'true';
export const VERBOSE = (Deno.env.get('VERBOSE') ?? 'false').toLowerCase() === 'true';
