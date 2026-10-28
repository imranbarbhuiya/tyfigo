import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { Effect } from 'effect';

export const isFile = (path: string): Effect.Effect<boolean> =>
	Effect.sync(() => statSync(path, { throwIfNoEntry: false })?.isFile() ?? false);

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

/**
 * The base file's directory followed by the project root when it is a different directory.
 */
export const searchDirectories = Effect.fn('searchDirectories')(function* (baseFile: string) {
	const directory = dirname(baseFile);
	const root = yield* findProjectRoot(directory);
	return root === undefined || root === directory ? [directory] : [directory, root];
});
