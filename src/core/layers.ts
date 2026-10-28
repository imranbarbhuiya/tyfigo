import { basename, dirname, join, resolve } from 'node:path';

import { Effect } from 'effect';

import { findFile, isFile, searchDirectories } from './files.ts';
import { parseConfigFileName } from './formats/index.ts';

export type LayerKind = 'base' | 'environment' | 'local' | 'environment-local';

export interface LayerFile {
	readonly file: string;
	readonly kind: LayerKind;
}

/**
 * The layer files of a base config file, in the order they apply: `app.config.yaml`, `app.<environment>.config.yaml`,
 * `app.local.config.yaml` and `app.<environment>.local.config.yaml`. Only files that exist are listed. Environment files sit next
 * to the base file, and local files are searched next to it first, then in the nearest directory with a `package.json`.
 */
export const discoverLayers = Effect.fn('discoverLayers')(function* (baseFile: string, environment?: string) {
	const file = resolve(baseFile);
	const name = parseConfigFileName(basename(file));
	if (!name) return [];

	const directories = yield* searchDirectories(file);
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
