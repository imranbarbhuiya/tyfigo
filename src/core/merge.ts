import { basename } from 'node:path';

import { isPlainObject } from './placeholders.ts';
import { formatPath, pathKey } from './positions.ts';
import { problemAt } from './problems.ts';

import type { Path, PositionMap, SourceIndex, Span } from './positions.ts';
import type { Problem } from './problems.ts';

/**
 * A {@link Span} together with the file it is in.
 */
export interface LocatedSpan extends Span {
	readonly file: string;
}

export interface MergeLayer {
	readonly file: string;
	readonly value: unknown;
	readonly positions: PositionMap;
	readonly source: SourceIndex;
}

export interface MergeResult {
	readonly value: unknown;
	readonly positions: ReadonlyMap<string, LocatedSpan>;
	readonly problems: readonly Problem[];
}

const kindOf = (value: unknown) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);

const isWithin = (id: string, prefix: string) =>
	id === prefix || id.startsWith(prefix === '[]' ? '[' : `${prefix.slice(0, -1)},`);

export const locate = (file: string, positions: PositionMap): Map<string, LocatedSpan> =>
	new Map([...positions].map(([id, span]) => [id, { ...span, file }]));

/**
 * Applies `layer` over `base`. Objects merge, arrays and primitives replace. A key that `base` lacks, or a value of a different
 * type (`null`, boolean, number, string, array or object), is a problem and that part of the layer is skipped.
 */
export const mergeLayer = (
	base: { readonly value: unknown; readonly positions: ReadonlyMap<string, LocatedSpan> },
	layer: MergeLayer,
): MergeResult => {
	const positions = new Map(base.positions);
	const problems: Problem[] = [];

	const report = (path: Path, onKey: boolean, code: 'unknown-key' | 'type-mismatch', message: string) => {
		const span = layer.positions.get(pathKey(path));
		const start = span ? (onKey ? span.keyStart : span.valueStart) : 0;
		const length = span ? (onKey ? span.keyLength : span.valueLength) : 0;
		problems.push(problemAt(layer.source, layer.file, start, length, code, message));
	};

	const origin = (path: Path) => {
		const file = positions.get(pathKey(path))?.file;
		return file ? basename(file) : 'the base file';
	};

	const replace = (path: Path) => {
		const prefix = pathKey(path);
		for (const id of positions.keys()) if (isWithin(id, prefix)) positions.delete(id);
		for (const [id, span] of layer.positions) {
			if (isWithin(id, prefix)) positions.set(id, { ...span, file: layer.file });
		}
	};

	const merge = (current: unknown, next: unknown, path: Path): unknown => {
		if (isPlainObject(current) && isPlainObject(next)) {
			const result = { ...current };
			for (const [key, value] of Object.entries(next)) {
				const childPath = [...path, key];
				if (Object.hasOwn(current, key)) result[key] = merge(current[key], value, childPath);
				else {
					report(
						childPath,
						true,
						'unknown-key',
						`'${formatPath(childPath)}' is not in ${origin(path)}; environment and local files can only override existing keys`,
					);
				}
			}
			return result;
		}

		const expected = kindOf(current);
		const actual = kindOf(next);
		if (expected !== actual) {
			report(
				path,
				false,
				'type-mismatch',
				`Expected ${expected} at '${formatPath(path) || '(root)'}' as in ${origin(path)}, got ${actual}`,
			);
			return current;
		}

		replace(path);
		return next;
	};

	return { value: merge(base.value, layer.value, []), positions, problems };
};
