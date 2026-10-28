import { configSuffixes, formatProblems } from '../core/index.ts';
import { load } from '../runtime/load.ts';

import type { LoadOptions, LoadResult, LoadTarget } from '../runtime/load.ts';

export interface TyfigoPluginOptions {
	/**
	 * Overrides the detected target. `browser` inlines the base and environment files and fails on placeholders and on imports of
	 * `loadEnv` and the other exports that need Node.js. `server` inlines the base, environment and local files of the build's
	 * environment and reads `.env` files and environment variables when the bundle runs.
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

const nodeOnlyExports: Readonly<Record<string, readonly string[]>> = {
	tyfigo: ['loadEnv', 'loadEnvAsync'],
	'tyfigo/effect': ['loadEnv', 'layerEnv', 'configProviderFromFile', 'layerConfigProviderFromFile'],
};

const tyfigoImport = /\b(?:import|export)\s+(type\s+)?([\w$\s{},*]+?)\s*from\s*["'](tyfigo(?:\/effect)?)["']/gu;

export const tyfigoImportPattern = /["']tyfigo(?:\/effect)?["']/u;

const usesNamespaceMember = (code: string, namespace: string, name: string) =>
	new RegExp(String.raw`(?<![\w$.])${namespace.replaceAll('$', String.raw`\$`)}\s*\??\.\s*${name}\b`, 'u').test(code);

/**
 * Finds imports of the tyfigo exports that need Node.js, such as `loadEnv`, and returns one message per import for a browser
 * build to fail with.
 */
export const findNodeOnlyImports = (code: string, id: string): string[] => {
	const messages: string[] = [];
	for (const match of code.matchAll(tyfigoImport)) {
		const [, typeOnly, clause = '', source = ''] = match;
		if (typeOnly) continue;
		const specifiers = (/\{([^}]*)\}/u.exec(clause)?.[1] ?? '')
			.split(',')
			.map((specifier) => specifier.trim().split(/\s+/u)[0]);
		const namespace = /\*\s*as\s+([\w$]+)/u.exec(clause)?.[1];
		const used = (nodeOnlyExports[source] ?? []).filter(
			(name) =>
				specifiers.includes(name) || (namespace !== undefined && usesNamespaceMember(code, namespace, name)),
		);
		const before = code.slice(0, match.index);
		const location = `${id}:${before.split('\n').length}:${match.index - before.lastIndexOf('\n')}`;
		for (const name of used) {
			messages.push(
				`${location} - ${name} from '${source}' reads files and environment variables with Node.js, so it cannot run in a browser bundle. Call it in server code, or set the tyfigo plugin's target option to 'server' if this bundle runs on a server.`,
			);
		}
	}
	return messages;
};
