#!/usr/bin/env -S deno run --allow-net --allow-env=CONFIG_FILE,DEBUG,VERBOSE --allow-read --allow-write

import run from './lib/cli.ts';

await run();
