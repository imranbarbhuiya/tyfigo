import { readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { Effect } from 'effect';

/**
 * The name of a directory whose files of a format extension are config files, `.config/app.yaml` for example.
 */
export const configDirectory = '.config';

/**
 * Whether `path` is directly inside a `.config` directory.
 */
export const isInConfigDirectory = (path: string): boolean => basename(dirname(path)) === configDirectory;

export const isFile = (path: string): Effect.Effect<boolean> =>
	Effect.sync(() => statSync(path, { throwIfNoEntry: false })?.isFile() ?? false);

/**
 * The names of the entries in `directory`, or none when it cannot be read.
 */
export const listDirectory = (directory: string): Effect.Effect<readonly string[]> =>
	Effect.sync(() => {
		try {
			return readdirSync(directory);
		} catch {
			return [];
		}
	});

/**
 * The nearest directory at or above `directory` that has a `package.json`.
 */
export const findProjectRoot = Effect.fn('findProjectRoot')(function* (directory: string) {
	for (let current = directory; ; current = dirname(current)) {
		if (yield* isFile(join(current, 'package.json'))) return current;
		if (dirname(current) === current) return undefined;
	}
});

/**
 * The first existing `name` in `directories`.
 */
export const findFile = Effect.fn('findFile')(function* (directories: readonly string[], name: string) {
	for (const directory of directories) {
		const path = join(directory, name);
		if (yield* isFile(path)) return path;
	}
	return undefined;
});

const withRoot = Effect.fn('withRoot')(function* (
	directory: string,
	inRoot: (root: string) => string = (root) => root,
) {
	const root = yield* findProjectRoot(directory);
	if (root === undefined) return [directory];
	const second = inRoot(root);
	return second === directory ? [directory] : [directory, second];
});

/**
 * Where the local layers of a base file are searched: its directory, then the project root (the nearest directory with a
 * `package.json`). For a file in a `.config` directory, the project root's `.config` directory.
 */
export const layerDirectories = Effect.fn('layerDirectories')(function* (baseFile: string) {
	const directory = dirname(baseFile);
	return yield* isInConfigDirectory(baseFile)
		? withRoot(directory, (root) => join(root, configDirectory))
		: withRoot(directory);
});

/**
 * Where the `.env` files of a base file are searched: its directory, or the directory containing its `.config` directory, then
 * the project root.
 */
export const envDirectories = Effect.fn('envDirectories')(function* (baseFile: string) {
	const directory = dirname(baseFile);
	return yield* withRoot(isInConfigDirectory(baseFile) ? dirname(directory) : directory);
});
