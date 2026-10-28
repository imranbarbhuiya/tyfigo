import { configSuffixes, formatProblems } from '../core/index.ts';
import { load } from '../runtime/load.ts';

import type { LoadOptions, LoadResult, LoadTarget } from '../runtime/load.ts';

export interface TyfigoPluginOptions {
	/**
	 * Overrides the detected target. `browser` inlines the base and environment files and fails on placeholders, `server` inlines
	 * every layer file and reads `.env` files and environment variables when the bundle runs.
	 */
	readonly target?: LoadTarget | undefined;
	/**
	 * The environment name. Defaults to the bundler's mode where it has one (Vite, webpack, Rspack, Rsbuild), otherwise `NODE_ENV`.
	 */
	readonly environment?: string | undefined;
	/**
	 * The specifier server modules import the runtime from. Defaults to `tyfigo/runtime`.
	 */
	readonly runtime?: string | undefined;
}

export const configFilePattern = new RegExp(
	`(?:${configSuffixes.map((suffix) => suffix.replaceAll('.', String.raw`\.`)).join('|')})$`,
	'u',
);

/**
 * Generates the module for a config import and throws one error listing every problem, which fails the build.
 */
export const loadConfigImport = (file: string, options: LoadOptions): LoadResult => {
	const result = load(file, options);
	if (result.problems.length > 0) throw new Error(`Invalid config ${file}\n${formatProblems(result.problems)}`);
	return result;
};

export interface WebpackLikePlatform {
	readonly web?: boolean | null;
	readonly node?: boolean | null;
}

export interface WebpackLikeCompiler {
	readonly platform: WebpackLikePlatform;
	readonly options: { readonly mode?: string | undefined };
}

export const isServerPlatform = (platform: WebpackLikePlatform): boolean => platform.node === true && !platform.web;
