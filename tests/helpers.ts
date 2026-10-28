import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach } from 'vitest';

import { pathKey } from '../src/core/positions.ts';

import type { Path, PositionMap } from '../src/core/positions.ts';

const projects: string[] = [];

afterEach(async () => {
	await Promise.all(projects.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })));
});

/**
 * Writes `files` (paths relative to a fresh temporary directory) and returns the directory.
 */
export const makeProject = async (files: Record<string, string>): Promise<string> => {
	const directory = await mkdtemp(join(tmpdir(), 'tyfigo-'));
	projects.push(directory);
	for (const [name, content] of Object.entries(files)) {
		const file = join(directory, name);
		await mkdir(dirname(file), { recursive: true });
		await writeFile(file, content);
	}
	return directory;
};

export const sliceBytes = (text: string, start: number, length: number): string =>
	Buffer.from(text)
		.subarray(start, start + length)
		.toString('utf8');

/**
 * The source text of a path's key and value.
 */
export const spanText = (text: string, positions: PositionMap, path: Path): { key: string; value: string } => {
	const span = positions.get(pathKey(path));
	if (!span) throw new Error(`No position for ${pathKey(path)}`);
	return {
		key: sliceBytes(text, span.keyStart, span.keyLength),
		value: sliceBytes(text, span.valueStart, span.valueLength),
	};
};
