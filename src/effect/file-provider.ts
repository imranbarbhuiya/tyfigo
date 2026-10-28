import { ConfigProvider, Effect } from 'effect';

import { configProvider } from './provider.ts';

import { resolveConfig } from '../core/resolve.ts';
import { ConfigValidationError } from '../schema.ts';

import type { ResolveOptions } from '../core/resolve.ts';
import type { ConfigError } from './load.ts';
import type { ConfigProviderLayerOptions } from './provider.ts';
import type { Layer } from 'effect';

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
 * Installs {@link configProviderFromFile} on top of the current `ConfigProvider`.
 */
export const layerConfigProviderFromFile = (
	file: string,
	options: ResolveOptions & ConfigProviderLayerOptions = {},
): Layer.Layer<never, ConfigError> =>
	ConfigProvider.layerAdd(configProviderFromFile(file, options), { asPrimary: options.asPrimary ?? true });
