import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import { Effect } from 'effect';

import { findProjectRoot, isFile, searchDirectories } from '../core/files.ts';
import {
	configSuffixes,
	discoverEnvironments,
	envFileNames,
	fileProblem,
	formatPath,
	formatProblems,
	hasPlaceholder,
	isPlainObject,
	parseConfigFileName,
	pathKey,
	problemAt,
	processEnv,
	resolveConfig,
	SourceIndex,
} from '../core/index.ts';

import type { LayerKind, Path, PositionMap, Problem, ResolvedConfig } from '../core/index.ts';
import type { BundledConfig, BundledLayer } from './resolve.ts';

export type LoadTarget = 'server' | 'browser';

export interface LoadOptions {
	/**
	 * `server` resolves the config when the module runs. `browser` inlines the base and environment files at build time and
	 * reports every placeholder as a problem.
	 */
	readonly target: LoadTarget;
	/**
	 * The environment name, such as the bundler's mode. Defaults to `NODE_ENV`, read when the server module runs and when
	 * `load` runs for the browser. A bundled server module inlines only this environment's files when it is given, and every
	 * environment's files otherwise.
	 */
	readonly environment?: string | undefined;
	/**
	 * The specifier the server module imports the runtime from. Defaults to `tyfigo/runtime`.
	 */
	readonly runtime?: string | undefined;
	/**
	 * For `server`: inline the text of the layer files that exist at build time, for every environment unless `environment` is
	 * given, and pick the environment's layers and read `.env` files and environment variables from `process.cwd()` when the
	 * module runs, so a bundle does not depend on the paths of the machine that built it.
	 */
	readonly bundle?: boolean | undefined;
}

export interface LoadResult {
	/**
	 * The JavaScript module, with the config as its default export.
	 */
	readonly code: string;
	/**
	 * Every file whose creation, change or removal changes the module, whether or not it exists now.
	 */
	readonly watchFiles: readonly string[];
	readonly problems: readonly Problem[];
}

const browserLayers = ['base', 'environment'] as const;

const watchFilesOf = Effect.fn('watchFilesOf')(function* (
	file: string,
	environment: string | undefined,
	target: LoadTarget,
) {
	const name = parseConfigFileName(basename(file));
	if (!name) return [file];

	const files = [file];
	if (environment) files.push(join(dirname(file), `${name.stem}.${environment}${name.suffix}`));
	if (target === 'browser') return files;

	const directories = yield* searchDirectories(file);
	const locals = environment
		? [`${name.stem}.local${name.suffix}`, `${name.stem}.${environment}.local${name.suffix}`]
		: [`${name.stem}.local${name.suffix}`];
	for (const fileName of [...locals, ...envFileNames(environment)]) {
		for (const directory of directories) files.push(join(directory, fileName));
	}
	return files;
});

/**
 * A JavaScript expression that evaluates to a deep-frozen copy of a config value.
 */
export const valueLiteral = (value: unknown, indent = ''): string => {
	if (value === undefined) return 'undefined';
	if (typeof value === 'number') return Object.is(value, -0) ? '-0' : String(value);
	if (typeof value === 'bigint') return `${value}n`;
	if (value instanceof Date) return `new Date(${valueLiteral(value.getTime(), indent)})`;
	const inner = `${indent}\t`;
	if (Array.isArray(value)) {
		if (value.length === 0) return 'Object.freeze([])';
		const items = value.map((item) => `${inner}${valueLiteral(item, inner)},\n`);
		return `Object.freeze([\n${items.join('')}${indent}])`;
	}
	if (isPlainObject(value)) {
		const entries = Object.entries(value);
		if (entries.length === 0) return 'Object.freeze({})';
		const properties = entries.map(([key, item]) => {
			const name = key === '__proto__' ? `[${JSON.stringify(key)}]` : JSON.stringify(key);
			return `${inner}${name}: ${valueLiteral(item, inner)},\n`;
		});
		return `Object.freeze({\n${properties.join('')}${indent}})`;
	}
	return JSON.stringify(value);
};

const hasUnescapedPlaceholder = (text: string) => hasPlaceholder(text.replaceAll('$${', ''));

const placeholderProblems = (file: string, text: string, value: unknown, positions: PositionMap) => {
	const source = new SourceIndex(text);
	const problems: Problem[] = [];
	const visit = (item: unknown, path: Path) => {
		if (typeof item === 'string') {
			if (!hasUnescapedPlaceholder(item)) return;
			const span = positions.get(pathKey(path));
			problems.push(
				problemAt(
					source,
					file,
					span?.valueStart ?? 0,
					span?.valueLength ?? 0,
					'browser-placeholder',
					`'${formatPath(path) || '(root)'}' uses an environment placeholder, which browser builds cannot read`,
				),
			);
		} else if (Array.isArray(item)) for (const [index, child] of item.entries()) visit(child, [...path, index]);
		else if (isPlainObject(item)) for (const [key, child] of Object.entries(item)) visit(child, [...path, key]);
	};
	visit(value, []);
	return problems;
};

const failingCode = (file: string, problems: readonly Problem[]) =>
	`throw new Error(${JSON.stringify(`Invalid config ${file}\n${formatProblems(problems)}`)});\n\nexport default undefined;\n`;

const serverModule = Effect.fn('serverModule')(function* (file: string, options: LoadOptions) {
	const problems: Problem[] = [];
	if (!parseConfigFileName(basename(file))) {
		problems.push(
			fileProblem(
				file,
				'unsupported-file',
				`${basename(file)} is not a config file; expected a name ending in ${configSuffixes.join(', ')}`,
			),
		);
	} else if (!(yield* isFile(file))) problems.push(fileProblem(file, 'file-not-found', `Cannot find ${file}`));

	const settings =
		options.environment === undefined ? '' : `, { environment: ${JSON.stringify(options.environment)} }`;
	const code = `import { resolveConfigModule } from ${JSON.stringify(options.runtime ?? 'tyfigo/runtime')};\n\nexport default resolveConfigModule(${JSON.stringify(file)}${settings});\n`;
	const environment = options.environment ?? (processEnv().NODE_ENV || undefined);
	return { code, watchFiles: yield* watchFilesOf(file, environment, 'server'), problems } satisfies LoadResult;
});

const browserModule = Effect.fn('browserModule')(function* (file: string, options: LoadOptions) {
	const environment = options.environment ?? (processEnv().NODE_ENV || undefined);
	const result = yield* resolveConfig(file, { environment, env: {}, layers: browserLayers });
	const files = new Set([result.file, ...result.layers.map((layer) => layer.file)]);
	const problems = result.problems.filter(
		(problem) =>
			files.has(problem.file) && problem.code !== 'missing-variable' && problem.code !== 'invalid-placeholder',
	);
	for (const layer of result.layers) {
		const parsed = result.format?.parse(layer.text, layer.file);
		if (parsed?.value !== undefined) {
			problems.push(...placeholderProblems(layer.file, layer.text, parsed.value, layer.positions));
		}
	}

	const code =
		problems.length > 0
			? failingCode(result.file, problems)
			: `export default ${valueLiteral(result.value, '')};\n`;
	return {
		code,
		watchFiles: yield* watchFilesOf(result.file, environment, 'browser'),
		problems,
	} satisfies LoadResult;
});

const layerOrder: Readonly<Record<LayerKind, number>> = { base: 0, environment: 1, local: 2, 'environment-local': 3 };

const bundledServerModule = Effect.fn('bundledServerModule')(function* (file: string, options: LoadOptions) {
	const environments =
		options.environment === undefined ? [undefined, ...(yield* discoverEnvironments(file))] : [options.environment];
	const results: ResolvedConfig[] = [];
	for (const environment of environments) {
		results.push(
			yield* resolveConfig(file, environment === undefined ? { layers: ['base', 'local'] } : { environment }),
		);
	}

	const root = (yield* findProjectRoot(dirname(file))) ?? dirname(file);
	const name = (path: string) => relative(root, path).split(sep).join('/');
	const problems = new Map<string, Problem>();
	const layers = new Map<string, BundledLayer>();
	for (const result of results) {
		for (const problem of result.problems) {
			if (problem.code === 'missing-variable' || problem.code === 'placeholder-type') continue;
			problems.set(JSON.stringify([problem.file, problem.start, problem.code, problem.message]), problem);
		}
		for (const layer of result.layers) {
			const specific = layer.kind === 'environment' || layer.kind === 'environment-local';
			layers.set(layer.file, {
				file: name(layer.file),
				kind: layer.kind,
				...(specific ? { environment: result.environment } : {}),
				text: layer.text,
			});
		}
	}
	const bundle: BundledConfig = {
		file: name(file),
		...(options.environment === undefined ? {} : { environment: options.environment }),
		layers: [...layers.values()].toSorted((a, b) => layerOrder[a.kind] - layerOrder[b.kind]),
	};

	const watchFiles = new Set<string>();
	for (const environment of new Set([...environments, processEnv().NODE_ENV || undefined])) {
		for (const watchFile of yield* watchFilesOf(file, environment, 'server')) watchFiles.add(watchFile);
	}
	const code =
		problems.size > 0
			? failingCode(file, [...problems.values()])
			: `import { resolveBundledConfigModule } from ${JSON.stringify(options.runtime ?? 'tyfigo/runtime')};\n\nexport default resolveBundledConfigModule(${JSON.stringify(bundle)});\n`;
	return {
		code,
		watchFiles: [...watchFiles],
		problems: [...problems.values()],
	} satisfies LoadResult;
});

/**
 * Generates the JavaScript module for a config file import. Loaders fail the import or build when `problems` is not empty.
 */
export const loadModule = Effect.fn('loadModule')(function* (path: string, options: LoadOptions) {
	const file = resolve(path);
	if (options.target === 'browser') return yield* browserModule(file, options);
	return options.bundle ? yield* bundledServerModule(file, options) : yield* serverModule(file, options);
});

/**
 * {@link loadModule} for synchronous callers such as Node `registerHooks` load hooks.
 */
export const load = (path: string, options: LoadOptions): LoadResult => Effect.runSync(loadModule(path, options));
