import { pathKey, SourceIndex } from '../positions.ts';
import { problemAt } from '../problems.ts';

import type { Path, PositionMap, Span } from '../positions.ts';
import type { Problem, ProblemCode } from '../problems.ts';

export type FormatName = 'yaml' | 'toml' | 'jsonc' | 'json5' | 'ini' | 'properties' | 'xml';

/**
 * A parsed config file. `value` is `undefined` when the file could not be parsed at all. An empty file is `{}`.
 */
export interface ParseResult {
	readonly value: unknown;
	readonly positions: PositionMap;
	readonly problems: readonly Problem[];
}

export interface Format {
	readonly name: FormatName;
	readonly parse: (text: string, file?: string) => ParseResult;
	/**
	 * Reads the text a whole-value placeholder resolved to with the format's scalar rules. Returns the text itself when it is not a
	 * number, boolean or null.
	 */
	readonly parseScalar: (text: string) => unknown;
}

export class ParseContext {
	readonly source: SourceIndex;
	readonly file: string;
	readonly positions = new Map<string, Span>();
	readonly problems: Problem[] = [];

	constructor(text: string, file: string) {
		this.source = new SourceIndex(text);
		this.file = file;
	}

	/**
	 * Records a span from UTF-16 ranges. The first span recorded for a path wins unless `replace` is set.
	 */
	add(path: Path, key: readonly [number, number], value: readonly [number, number], replace = true) {
		const id = pathKey(path);
		if (!replace && this.positions.has(id)) return;
		this.positions.set(id, this.source.span(path, key, value));
	}

	/**
	 * Records a problem from a UTF-16 range.
	 */
	problem(range: readonly [number, number], code: ProblemCode, message: string) {
		const start = this.source.byteOffset(range[0]);
		this.problems.push(
			problemAt(this.source, this.file, start, this.source.byteOffset(range[1]) - start, code, message),
		);
	}

	result(value: unknown): ParseResult {
		return { value, positions: this.positions, problems: this.problems };
	}
}

/**
 * The scalar rule of formats whose values are all text (INI, `.properties` and XML): `true` and `false` are booleans, a number
 * is a number only when JavaScript prints it back as the same text (`8080`, `-1.5`, not `08080`, `1.50` or `1e3`), and
 * anything else stays a string.
 */
export const inferScalar = (text: string): unknown => {
	if (text === 'true') return true;
	if (text === 'false') return false;
	const number = Number(text);
	return text !== '' && Number.isFinite(number) && String(number) === text ? number : text;
};
