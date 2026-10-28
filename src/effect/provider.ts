import { ConfigProvider } from 'effect';

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
 * Installs {@link configProvider} for a config import on top of the current `ConfigProvider`, which falls back to the
 * environment variables for paths the config does not have.
 */
export const layerConfigProvider = (config: unknown, options: ConfigProviderLayerOptions = {}): Layer.Layer<never> =>
	ConfigProvider.layerAdd(configProvider(config), { asPrimary: options.asPrimary ?? true });
