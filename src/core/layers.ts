import { dirname, join, resolve } from 'node:path';

import { Effect } from 'effect';

import { findFile, isFile, layerDirectories, listDirectory } from './files.ts';
import { parseConfigPath } from './formats/index.ts';

export type LayerKind = 'base' | 'environment' | 'local' | 'environment-local';

export interface LayerFile {
	readonly file: string;
	readonly kind: LayerKind;
}

/**
 * The layer files of a base config file, in the order they apply: `app.config.yaml`, `app.<environment>.config.yaml`,
 * `app.local.config.yaml` and `app.<environment>.local.config.yaml` (`.config/app.yaml`, `.config/app.<environment>.yaml` and so
 * on in a `.config` directory). Only files that exist are listed. Environment files sit next to the base file, and local files are
 * searched next to it first, then in the project root (or its `.config` directory), see {@link layerDirectories}.
 */
export const discoverLayers = Effect.fn('discoverLayers')(function* (baseFile: string, environment?: string) {
	const file = resolve(baseFile);
	const name = parseConfigPath(file);
	if (!name) return [];

	const directories = yield* layerDirectories(file);
	const layers: LayerFile[] = [];
	if (yield* isFile(file)) layers.push({ file, kind: 'base' });
	if (environment) {
		const environmentFile = join(dirname(file), `${name.stem}.${environment}${name.suffix}`);
		if (yield* isFile(environmentFile)) layers.push({ file: environmentFile, kind: 'environment' });
	}

	const local = yield* findFile(directories, `${name.stem}.local${name.suffix}`);
	if (local) layers.push({ file: local, kind: 'local' });
	if (environment) {
		const environmentLocal = yield* findFile(directories, `${name.stem}.${environment}.local${name.suffix}`);
		if (environmentLocal) layers.push({ file: environmentLocal, kind: 'environment-local' });
	}

	return layers;
});

/**
 * The environment names that have a layer file for a base config file: every `app.<environment>.config.yaml` next to it, and
 * every `app.<environment>.local.config.yaml` where {@link discoverLayers} searches local files. Sorted.
 */
export const discoverEnvironments = Effect.fn('discoverEnvironments')(function* (baseFile: string) {
	const file = resolve(baseFile);
	const name = parseConfigPath(file);
	if (!name) return [];

	const environments = new Set<string>();
	for (const directory of yield* layerDirectories(file)) {
		for (const entry of yield* listDirectory(directory)) {
			if (!entry.startsWith(`${name.stem}.`) || !entry.endsWith(name.suffix)) continue;
			const middle = entry.slice(name.stem.length + 1, -name.suffix.length);
			const local = middle.endsWith('.local');
			const environment = local ? middle.slice(0, -'.local'.length) : middle;
			if (!local && directory !== dirname(file)) continue;
			if (/^[^.]+$/u.test(environment) && environment !== 'local') environments.add(environment);
		}
	}
	return [...environments].toSorted((a, b) => a.localeCompare(b));
});
