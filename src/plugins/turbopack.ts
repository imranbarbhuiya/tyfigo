import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { configSuffixes } from '../core/index.ts';

import type { LoadTarget } from '../runtime/load.ts';
import type { TyfigoPluginOptions } from './shared.ts';
import type { TurbopackRuleCondition, TurbopackRuleConfigCollection } from 'next/dist/server/config-shared.js';

// The loader sits next to this module: `loader.mjs` in the package, `loader.ts` when this runs from source.
export const loaderPath = fileURLToPath(new URL(`loader${extname(import.meta.url)}`, import.meta.url));

export const loaderOptions = (options: Omit<TyfigoPluginOptions, 'target'>, target: LoadTarget) => ({
	target,
	...(options.environment === undefined ? {} : { environment: options.environment }),
	...(options.runtime === undefined ? {} : { runtime: options.runtime }),
});

const browser: TurbopackRuleCondition = { any: ['browser', 'edge-light'] };

/**
 * `turbopack.rules` that load config files with the tyfigo loader: client and Edge code gets the browser module, Node.js
 * server code the bundled server module.
 */
export const turbopackRules = (
	options: Omit<TyfigoPluginOptions, 'target'> = {},
): Record<string, TurbopackRuleConfigCollection> =>
	Object.fromEntries(
		configSuffixes.map((suffix) => [
			`*${suffix}`,
			[
				{
					condition: browser,
					loaders: [{ loader: loaderPath, options: loaderOptions(options, 'browser') }],
					as: '*.js',
				},
				{
					condition: { not: browser },
					loaders: [{ loader: loaderPath, options: loaderOptions(options, 'server') }],
					as: '*.js',
				},
			],
		]),
	);
