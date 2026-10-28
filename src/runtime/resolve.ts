import { basename, join } from 'node:path';
import process from 'node:process';

import { Data } from 'effect';

import { formatProblems, pathKey, resolveConfigSourcesSync, resolveConfigSync, SourceIndex } from '../core/index.ts';

import type { LayerSource, Path, Problem, ResolvedConfig } from '../core/index.ts';

/**
 * The key of the non-enumerable {@link ConfigSource} on a config object exported by a generated server module.
 */
export const configSource = Symbol.for('tyfigo.source');

export interface SourcePosition {
	readonly file: string;
	readonly line: number;
	readonly column: number;
}

export interface ConfigSource {
	/**
	 * The base config file, as an absolute path.
	 */
	readonly file: string;
	readonly environment: string | undefined;
	/**
	 * The layer files that were merged, in the order they apply.
	 */
	readonly layers: readonly string[];
	/**
	 * The `.env` files that were read, in the order they apply.
	 */
	readonly envFiles: readonly string[];
	/**
	 * Where the value at `path` was set. A path the config does not have resolves to its nearest ancestor that it does have.
	 */
	readonly position: (path: Path) => SourcePosition | undefined;
}

export class ConfigModuleError extends Data.TaggedError('ConfigModuleError')<{
	readonly message: string;
	readonly file: string;
	readonly problems: readonly Problem[];
}> {}

export interface ConfigModuleOptions {
	/**
	 * The environment name that picks `app.<environment>.config.yaml` and `.env.<environment>`. Defaults to `NODE_ENV`.
	 */
	readonly environment?: string | undefined;
}

export const deepFreeze = <T>(value: T): T => {
	if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const item of Object.values(value)) deepFreeze(item);
	}
	return value;
};

export const getConfigSource = (value: unknown): ConfigSource | undefined =>
	typeof value === 'object' && value !== null
		? (value as { readonly [configSource]?: ConfigSource })[configSource]
		: undefined;

const sourceOf = (result: ResolvedConfig): ConfigSource => {
	const texts = new Map(result.layers.map((layer) => [layer.file, layer.text]));
	const indexes = new Map<string, SourceIndex>();
	const indexOf = (file: string) => {
		const text = texts.get(file);
		if (text === undefined) return undefined;
		const index = indexes.get(file) ?? new SourceIndex(text);
		indexes.set(file, index);
		return index;
	};

	return {
		file: result.file,
		environment: result.environment,
		layers: result.layers.map((layer) => layer.file),
		envFiles: result.envFiles,
		position: (path) => {
			for (let depth = path.length; depth >= 0; depth--) {
				const span = result.positions.get(pathKey(path.slice(0, depth)));
				if (!span) continue;
				const index = indexOf(span.file);
				return index ? { file: span.file, ...index.lineColumn(span.valueStart) } : undefined;
			}
			return undefined;
		},
	};
};

const toModule = (result: ResolvedConfig): unknown => {
	if (result.problems.length > 0) {
		throw new ConfigModuleError({
			message: `Invalid config ${result.file}\n${formatProblems(result.problems)}`,
			file: result.file,
			problems: result.problems,
		});
	}

	if (typeof result.value === 'object' && result.value !== null) {
		Object.defineProperty(result.value, configSource, { value: sourceOf(result) });
	}
	return deepFreeze(result.value);
};

/**
 * Resolves a config file with its layers, `.env` files and placeholders, and returns the deep-frozen value. This is what a
 * generated server module calls when it is evaluated. Throws a {@link ConfigModuleError} listing every problem.
 */
export const resolveConfigModule = (file: string, options: ConfigModuleOptions = {}): unknown =>
	toModule(resolveConfigSync(file, { environment: options.environment }));

/**
 * The layer files a bundled server module carries, with paths relative to the project root of the machine that built it.
 */
export interface BundledConfig {
	readonly file: string;
	readonly environment?: string | undefined;
	readonly layers: readonly LayerSource[];
}

/**
 * {@link resolveConfigModule} for a bundled server module: merges the layers inlined at build time with the `.env` files found
 * from `process.cwd()` and the environment variables.
 */
export const resolveBundledConfigModule = (bundle: BundledConfig): unknown =>
	toModule(
		resolveConfigSourcesSync(bundle.file, bundle.layers, {
			environment: bundle.environment,
			envFrom: join(process.cwd(), basename(bundle.file)),
		}),
	);
