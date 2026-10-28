import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { Effect, Result } from 'effect';

import { processEnv, readEnv } from './env.ts';
import { isFile } from './files.ts';
import { configSuffixes, parseConfigFileName } from './formats/index.ts';
import { discoverLayers } from './layers.ts';
import { locate, mergeLayer } from './merge.ts';
import { resolvePlaceholders } from './placeholders.ts';
import { SourceIndex } from './positions.ts';
import { fileProblem } from './problems.ts';

import type { EnvVariables } from './env.ts';
import type { Format } from './formats/index.ts';
import type { LayerFile, LayerKind } from './layers.ts';
import type { LocatedSpan } from './merge.ts';
import type { PositionMap } from './positions.ts';
import type { Problem } from './problems.ts';

export interface ResolveOptions {
	/**
	 * The real environment variables, which win over every `.env` file. Defaults to a copy of the current ones.
	 */
	readonly env?: EnvVariables | undefined;
	/**
	 * The environment name that picks `app.<environment>.config.yaml` and `.env.<environment>`. Defaults to `env.NODE_ENV`.
	 */
	readonly environment?: string | undefined;
	/**
	 * The layer kinds to read. Defaults to all of them.
	 */
	readonly layers?: readonly LayerKind[] | undefined;
}

export interface ResolvedLayer {
	readonly file: string;
	readonly kind: LayerKind;
	readonly text: string;
	/**
	 * The parsed value with placeholders resolved, or `undefined` when the file could not be parsed.
	 */
	readonly value: unknown;
	readonly positions: PositionMap;
}

export interface ResolvedConfig {
	/**
	 * The base file, resolved to an absolute path.
	 */
	readonly file: string;
	readonly format: Format | undefined;
	readonly environment: string | undefined;
	/**
	 * The merged value, or `undefined` when the base file is missing or could not be parsed.
	 */
	readonly value: unknown;
	readonly layers: readonly ResolvedLayer[];
	readonly envFiles: readonly string[];
	/**
	 * Where each key path of `value` came from, keyed by `pathKey`.
	 */
	readonly positions: ReadonlyMap<string, LocatedSpan>;
	readonly problems: readonly Problem[];
}

const readText = (file: string) =>
	Effect.try({
		try: () => readFileSync(file, 'utf8'),
		catch: (error) => fileProblem(file, 'read-error', `Cannot read ${file}: ${(error as Error).message}`),
	});

const mergeLayers = Effect.fn('mergeLayers')(function* <Layer extends LayerFile>(
	format: Format,
	files: readonly Layer[],
	read: (layer: Layer) => Effect.Effect<string, Problem>,
	variables: EnvVariables,
) {
	const problems: Problem[] = [];
	const layers: ResolvedLayer[] = [];
	let merged: { value: unknown; positions: ReadonlyMap<string, LocatedSpan> } | undefined;

	for (const layer of files) {
		const content = yield* Effect.result(read(layer));
		if (Result.isFailure(content)) {
			problems.push(content.failure);
			continue;
		}

		const text = content.success;
		const parsed = format.parse(text, layer.file);
		problems.push(...parsed.problems);
		const source = new SourceIndex(text);
		const resolved =
			parsed.value === undefined
				? { value: undefined, problems: [] }
				: resolvePlaceholders({
						value: parsed.value,
						positions: parsed.positions,
						source,
						file: layer.file,
						format,
						variables,
					});
		problems.push(...resolved.problems);
		layers.push({ file: layer.file, kind: layer.kind, text, value: resolved.value, positions: parsed.positions });
		if (resolved.value === undefined) continue;

		if (!merged) {
			merged =
				layer.kind === 'base'
					? { value: resolved.value, positions: locate(layer.file, parsed.positions) }
					: undefined;
			continue;
		}
		const result = mergeLayer(merged, {
			file: layer.file,
			value: resolved.value,
			positions: parsed.positions,
			source,
		});
		problems.push(...result.problems);
		merged = result;
	}

	return { layers, value: merged?.value, positions: merged?.positions ?? new Map(), problems };
});

const unsupportedFile = (file: string) =>
	fileProblem(
		file,
		'unsupported-file',
		`${basename(file)} is not a config file; expected a name ending in ${configSuffixes.join(', ')}`,
	);

/**
 * Reads a config file with its environment and local layers and `.env` files, resolves placeholders and merges the layers.
 * Never fails: everything that went wrong is in `problems`.
 */
export const resolveConfig = Effect.fn('resolveConfig')(function* (path: string, options: ResolveOptions = {}) {
	const file = resolve(path);
	const env = options.env ?? processEnv();
	const environment = options.environment ?? (env.NODE_ENV || undefined);
	const name = parseConfigFileName(basename(file));
	const empty = {
		file,
		format: name?.format,
		environment,
		value: undefined,
		layers: [],
		envFiles: [],
		positions: new Map(),
	};
	if (!name) return { ...empty, problems: [unsupportedFile(file)] } satisfies ResolvedConfig;
	if (!(yield* isFile(file))) {
		return {
			...empty,
			problems: [fileProblem(file, 'file-not-found', `Cannot find ${file}`)],
		} satisfies ResolvedConfig;
	}

	const envResult = yield* readEnv(file, { environment, env });
	const files = (yield* discoverLayers(file, environment)).filter(
		(layer) => !options.layers || options.layers.includes(layer.kind),
	);
	const merged = yield* mergeLayers(name.format, files, (layer) => readText(layer.file), envResult.variables);
	return {
		...empty,
		...merged,
		envFiles: envResult.files,
		problems: [...envResult.problems, ...merged.problems],
	} satisfies ResolvedConfig;
});

export interface LayerSource extends LayerFile {
	readonly text: string;
}

export interface ResolveSourcesOptions {
	readonly env?: EnvVariables | undefined;
	readonly environment?: string | undefined;
	/**
	 * A path in the directory to search `.env` files from first, before the nearest directory with a `package.json`.
	 */
	readonly envFrom: string;
}

/**
 * {@link resolveConfig} for layer files whose text was read earlier, such as the layers a bundler inlined at build time. `file`
 * names the base file and picks the format; it is used as given and never read. Never fails: everything that went wrong is in
 * `problems`.
 */
export const resolveConfigSources = Effect.fn('resolveConfigSources')(function* (
	file: string,
	sources: readonly LayerSource[],
	options: ResolveSourcesOptions,
) {
	const env = options.env ?? processEnv();
	const environment = options.environment ?? (env.NODE_ENV || undefined);
	const name = parseConfigFileName(basename(file));
	const empty = {
		file,
		format: name?.format,
		environment,
		value: undefined,
		layers: [],
		envFiles: [],
		positions: new Map(),
	};
	if (!name) return { ...empty, problems: [unsupportedFile(file)] } satisfies ResolvedConfig;

	const envResult = yield* readEnv(options.envFrom, { environment, env });
	const merged = yield* mergeLayers(name.format, sources, (layer) => Effect.succeed(layer.text), envResult.variables);
	return {
		...empty,
		...merged,
		envFiles: envResult.files,
		problems: [...envResult.problems, ...merged.problems],
	} satisfies ResolvedConfig;
});
