import { ConfigProvider, Effect } from 'effect';

import { resolveConfig } from '../core/resolve.ts';
import { ConfigValidationError } from '../schema.ts';

import type { ResolveOptions } from '../core/resolve.ts';
import type { ConfigError } from './load.ts';
import type { Layer } from 'effect';

export interface ConfigProviderLayerOptions {
	/**
	 * Whether the config files win over the provider already installed (by default the environment variables). Defaults to
	 * `true`; with `false` the config files only fill in paths the current provider does not have.
	 */
	readonly asPrimary?: boolean | undefined;
}

/**
 * A `ConfigProvider` that reads a config import (or any object): nested keys are path segments and array items are
 * numeric segments, so `Config.Number('port').pipe(Config.nested('server'))` reads `server.port`. Empty strings are kept.
 */
export const configProvider = (config: unknown): ConfigProvider.ConfigProvider =>
	ConfigProvider.fromUnknown(config, { preserveEmptyStrings: true });

/**
 * Resolves a config file with its layers, `.env` files and placeholders, like a config import does, and returns a
 * `ConfigProvider` over the merged value.
 */
export const configProviderFromFile = Effect.fn('configProviderFromFile')(function* (
	file: string,
	options: ResolveOptions = {},
): Effect.fn.Return<ConfigProvider.ConfigProvider, ConfigError> {
	const result = yield* resolveConfig(file, options);
	if (result.problems.length > 0) {
		return yield* new ConfigValidationError({
			subject: `config ${result.file}`,
			issues: result.problems.map((problem) => ({
				path: [],
				message: `${problem.message} (${problem.code})`,
				location: `${problem.file}:${problem.line}:${problem.column}`,
			})),
		});
	}
	return configProvider(result.value);
});

/**
 * Installs {@link configProvider} for a config import on top of the current `ConfigProvider`, which falls back to the
 * environment variables for paths the config does not have.
 */
export const layerConfigProvider = (config: unknown, options: ConfigProviderLayerOptions = {}): Layer.Layer<never> =>
	ConfigProvider.layerAdd(configProvider(config), { asPrimary: options.asPrimary ?? true });

/**
 * Installs {@link configProviderFromFile} on top of the current `ConfigProvider`.
 */
export const layerConfigProviderFromFile = (
	file: string,
	options: ResolveOptions & ConfigProviderLayerOptions = {},
): Layer.Layer<never, ConfigError> =>
	ConfigProvider.layerAdd(configProviderFromFile(file, options), { asPrimary: options.asPrimary ?? true });
