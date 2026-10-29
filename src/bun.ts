import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { plugin } from 'bun';

import { configSuffixes, formatProblems } from './core/index.ts';
import { load } from './runtime/index.ts';

import type { BunPlugin } from 'bun';

// The runtime next to this module, so it resolves from config files outside the dependency tree: `.ts` in this repo, `.mjs` once built.
const runtime = fileURLToPath(new URL(`runtime/index${extname(import.meta.url)}`, import.meta.url));

const filter = new RegExp(`[^/\\\\](?:${configSuffixes.map((suffix) => suffix.replaceAll('.', '\\.')).join('|')})$`);

export interface TyfigoBunOptions {
	/**
	 * The environment name. Defaults to `NODE_ENV`, read when the config loads, or when a server `Bun.build` bundle starts.
	 * Setting it fixes the environment of a server bundle.
	 */
	readonly environment?: string | undefined;
}

/**
 * The tyfigo Bun plugin. Importing `tyfigo/bun` (a `bunfig.toml` `preload`) registers it for the runtime and `bun test`; pass
 * `tyfigo()` in `plugins` to use it with `Bun.build`, where a `browser` target inlines the config and a server target inlines the config files and reads `.env` files when it runs.
 */
export const tyfigo = (options: TyfigoBunOptions = {}): BunPlugin => ({
	name: 'tyfigo',
	setup(build) {
		const config = build.config as typeof build.config | undefined;
		const target = config?.target === 'browser' ? 'browser' : 'server';
		build.onLoad({ filter }, ({ path }) => {
			const result = load(path, {
				target,
				runtime,
				bundle: config !== undefined,
				environment: options.environment,
			});
			if (result.problems.length > 0) {
				throw new Error(`Invalid config ${path}\n${formatProblems(result.problems)}`);
			}
			return { contents: result.code, loader: 'js' };
		});
	},
});

void plugin(tyfigo());
