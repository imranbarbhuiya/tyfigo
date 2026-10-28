import { Effect } from 'effect';

import { resolveConfig } from './resolve.ts';

import type { ResolveOptions, ResolvedConfig } from './resolve.ts';

/**
 * {@link resolveConfig} for synchronous callers such as Node `registerHooks` load hooks.
 */
export const resolveConfigSync = (path: string, options?: ResolveOptions): ResolvedConfig =>
	Effect.runSync(resolveConfig(path, options));
