import { Effect } from 'effect';

import { resolveConfig, resolveConfigSources } from './resolve.ts';

import type { LayerSource, ResolveOptions, ResolveSourcesOptions, ResolvedConfig } from './resolve.ts';

/**
 * {@link resolveConfig} for synchronous callers such as Node `registerHooks` load hooks.
 */
export const resolveConfigSync = (path: string, options?: ResolveOptions): ResolvedConfig =>
	Effect.runSync(resolveConfig(path, options));

/**
 * {@link resolveConfigSources} for synchronous callers such as the module a bundler generates.
 */
export const resolveConfigSourcesSync = (
	file: string,
	sources: readonly LayerSource[],
	options: ResolveSourcesOptions,
): ResolvedConfig => Effect.runSync(resolveConfigSources(file, sources, options));
