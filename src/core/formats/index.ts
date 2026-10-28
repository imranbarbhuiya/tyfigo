import { json5 } from './json5.ts';
import { jsonc } from './jsonc.ts';
import { toml } from './toml.ts';
import { yaml } from './yaml.ts';

import type { Format } from './format.ts';

export type { Format, FormatName, ParseResult } from './format.ts';
export { json5 } from './json5.ts';
export { jsonc } from './jsonc.ts';
export { toml } from './toml.ts';
export { yaml } from './yaml.ts';

export const formats: Readonly<Record<string, Format>> = {
	'.config.yaml': yaml,
	'.config.yml': yaml,
	'.config.toml': toml,
	'.config.jsonc': jsonc,
	'.config.json5': json5,
};

export const configSuffixes = Object.keys(formats);

export interface ConfigFileName {
	/**
	 * The file name before the suffix, `app` for `app.config.yaml`.
	 */
	readonly stem: string;
	/**
	 * The claimed suffix, `.config.yaml` for `app.config.yaml`.
	 */
	readonly suffix: string;
	readonly format: Format;
}

/**
 * Splits a config file name (not a path) into its stem and suffix, or returns `undefined` when tyfigo does not claim it.
 */
export const parseConfigFileName = (fileName: string): ConfigFileName | undefined => {
	for (const [suffix, format] of Object.entries(formats)) {
		if (fileName.endsWith(suffix) && fileName.length > suffix.length) {
			return { stem: fileName.slice(0, -suffix.length), suffix, format };
		}
	}
	return undefined;
};
