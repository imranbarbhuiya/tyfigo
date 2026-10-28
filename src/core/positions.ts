/**
 * A key path into a config value. Strings are object keys and numbers are array indices.
 */
export type Path = readonly (string | number)[];

/**
 * Where a key and its value sit in the source, in UTF-8 byte offsets.
 *
 * Array elements have no key, so their key span is the same as their value span. The root (`[]`) spans the whole document value.
 */
export interface Span {
	readonly path: Path;
	readonly keyStart: number;
	readonly keyLength: number;
	readonly valueStart: number;
	readonly valueLength: number;
}

/**
 * Spans keyed by {@link pathKey}.
 */
export type PositionMap = ReadonlyMap<string, Span>;

export const pathKey = (path: Path): string => JSON.stringify(path);

export const formatPath = (path: Path): string =>
	path.reduce<string>(
		(text, segment) =>
			typeof segment === 'number' ? `${text}[${segment}]` : text === '' ? segment : `${text}.${segment}`,
		'',
	);

const isAscii = (text: string) => /^\p{ASCII}*$/u.test(text);

/**
 * Converts between UTF-16 string indices, UTF-8 byte offsets and 1-based line and column numbers.
 */
export class SourceIndex {
	readonly text: string;
	readonly #bytes: Uint32Array | undefined;
	readonly #lineStarts: number[];

	constructor(text: string) {
		this.text = text;
		this.#lineStarts = [0];
		for (let index = 0; index < text.length; index++) if (text[index] === '\n') this.#lineStarts.push(index + 1);
		if (isAscii(text)) return;
		const bytes = new Uint32Array(text.length + 1);
		let byte = 0;
		for (let index = 0; index < text.length; index++) {
			bytes[index] = byte;
			const code = text.codePointAt(index) ?? 0;
			if (code < 0x80) byte += 1;
			else if (code < 0x800) byte += 2;
			else if (code < 0x1_00_00) byte += 3;
			else {
				byte += 4;
				bytes[++index] = byte;
			}
		}
		bytes[text.length] = byte;
		this.#bytes = bytes;
	}

	/**
	 * The UTF-8 byte offset of a UTF-16 string index.
	 */
	byteOffset(index: number): number {
		const clamped = Math.max(0, Math.min(index, this.text.length));
		return this.#bytes ? (this.#bytes[clamped] ?? 0) : clamped;
	}

	/**
	 * The UTF-16 string index of a UTF-8 byte offset.
	 */
	charIndex(byteOffset: number): number {
		const bytes = this.#bytes;
		if (!bytes) return Math.max(0, Math.min(byteOffset, this.text.length));
		let low = 0;
		let high = this.text.length;
		while (low < high) {
			const middle = (low + high + 1) >>> 1;
			if ((bytes[middle] ?? 0) <= byteOffset) low = middle;
			else high = middle - 1;
		}
		return low;
	}

	/**
	 * The 1-based line and column (in UTF-16 code units) of a UTF-8 byte offset.
	 */
	lineColumn(byteOffset: number): { readonly line: number; readonly column: number } {
		const index = this.charIndex(byteOffset);
		let low = 0;
		let high = this.#lineStarts.length - 1;
		while (low < high) {
			const middle = (low + high + 1) >>> 1;
			if ((this.#lineStarts[middle] ?? 0) <= index) low = middle;
			else high = middle - 1;
		}
		return { line: low + 1, column: index - (this.#lineStarts[low] ?? 0) + 1 };
	}

	/**
	 * A {@link Span} from UTF-16 ranges.
	 */
	span(path: Path, key: readonly [number, number], value: readonly [number, number]): Span {
		const keyStart = this.byteOffset(key[0]);
		const valueStart = this.byteOffset(value[0]);
		return {
			path,
			keyStart,
			keyLength: this.byteOffset(key[1]) - keyStart,
			valueStart,
			valueLength: this.byteOffset(value[1]) - valueStart,
		};
	}
}
