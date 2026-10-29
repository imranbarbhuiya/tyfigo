import { basename, extname } from 'node:path';

import { ini } from './ini.ts';
import { json5 } from './json5.ts';
import { jsonc } from './jsonc.ts';
import { properties } from './properties.ts';
import { toml } from './toml.ts';
import { xml } from './xml.ts';
import { yaml } from './yaml.ts';

import { configDirectory, isInConfigDirectory } from '../files.ts';

import type { Format } from './format.ts';

export type { Format, FormatName, ParseResult } from './format.ts';
export { ini } from './ini.ts';
export { json5 } from './json5.ts';
export { jsonc } from './jsonc.ts';
export { properties } from './properties.ts';
export { toml } from './toml.ts';
export { xml } from './xml.ts';
export { yaml } from './yaml.ts';

/**
 * The formats by file extension.
 */
export const formatExtensions: Readonly<Record<string, Format>> = {
	'.yaml': yaml,
	'.yml': yaml,
	'.toml': toml,
	'.jsonc': jsonc,
	'.json5': json5,
	'.ini': ini,
	'.properties': properties,
	'.xml': xml,
};

export const formats: Readonly<Record<string, Format>> = Object.fromEntries(
	Object.entries(formatExtensions).map(([extension, format]) => [`.config${extension}`, format]),
);

export const configSuffixes = Object.keys(formats);

export interface ConfigFileName {
	/**
	 * The file name before the suffix, `app` for `app.config.yaml` and `.config/app.yaml`.
	 */
	readonly stem: string;
	/**
	 * The claimed suffix, `.config.yaml` for `app.config.yaml` and `.yaml` for `.config/app.yaml`.
	 */
	readonly suffix: string;
	readonly format: Format;
}

/**
 * The format of a file extension such as `.yaml`, or `undefined` when tyfigo does not read it.
 */
export const formatOfExtension = (extension: string): Format | undefined =>
	Object.hasOwn(formatExtensions, extension) ? formatExtensions[extension] : undefined;

/**
 * Splits a config file path into its stem and suffix, or returns `undefined` when tyfigo does not claim it. A config file's name
 * ends in a suffix such as `.config.yaml`, or it has a format extension such as `.yaml` and sits in a `.config` directory.
 */
export const parseConfigPath = (path: string): ConfigFileName | undefined => {
	const fileName = basename(path);
	for (const [suffix, format] of Object.entries(formats)) {
		if (fileName.endsWith(suffix) && fileName.length > suffix.length) {
			return { stem: fileName.slice(0, -suffix.length), suffix, format };
		}
	}
	const suffix = extname(fileName);
	const format = formatOfExtension(suffix);
	if (!format || !isInConfigDirectory(path) || fileName.startsWith('.')) return undefined;
	return { stem: fileName.slice(0, -suffix.length), suffix, format };
};

const escape = (text: string) => text.replaceAll('.', String.raw`\.`);

/**
 * Matches the paths {@link parseConfigPath} claims, with either path separator, for loader and bundler filters.
 */
export const configPathPattern = new RegExp(
	String.raw`(?:[^/\\](?:${configSuffixes.map(escape).join('|')})|(?:^|[/\\])${escape(configDirectory)}[/\\][^/\\.][^/\\]*(?:${Object.keys(formatExtensions).map(escape).join('|')}))$`,
	'u',
);

/**
 * A short description of the files tyfigo claims, for error messages.
 */
export const configFileDescription = `a name ending in ${configSuffixes.join(', ')}, or a ${Object.keys(formatExtensions).join(', ')} file in a ${configDirectory} directory`;
