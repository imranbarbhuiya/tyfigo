import { inferScalar, ParseContext } from './format.ts';

import { isPlainObject } from '../placeholders.ts';

import type { Format, ParseResult } from './format.ts';

type Range = readonly [number, number];

/**
 * A character of a logical line after escapes, with the source range it was read from.
 */
interface Char {
	readonly char: string;
	readonly start: number;
	readonly end: number;
	readonly escaped: boolean;
}

const isBlank = (char: string | undefined) => char === ' ' || char === '\t' || char === '\f';

const escapes: Readonly<Record<string, string>> = { t: '\t', n: '\n', r: '\r', f: '\f' };

const rangeOf = (chars: readonly Char[], fallback: number): Range =>
	chars.length === 0 ? [fallback, fallback] : [chars[0]!.start, chars.at(-1)!.end];

class PropertiesParser {
	readonly context: ParseContext;
	readonly text: string;
	readonly root: Record<string, unknown> = {};

	constructor(context: ParseContext) {
		this.context = context;
		this.text = context.source.text;
	}

	#lineEnd(from: number) {
		let index = from;
		while (index < this.text.length && this.text[index] !== '\n' && this.text[index] !== '\r') index++;
		return index;
	}

	#nextLine(end: number) {
		return this.text[end] === '\r' && this.text[end + 1] === '\n' ? end + 2 : end + 1;
	}

	parse() {
		let index = 0;
		while (index < this.text.length) {
			let start = index;
			while (isBlank(this.text[start])) start++;
			const end = this.#lineEnd(start);
			if (start === end || this.text[start] === '#' || this.text[start] === '!') {
				index = this.#nextLine(end);
				continue;
			}

			const raw: number[] = [];
			let from = start;
			for (;;) {
				const lineEnd = this.#lineEnd(from);
				let backslashes = 0;
				while (lineEnd - backslashes > from && this.text[lineEnd - backslashes - 1] === '\\') backslashes++;
				const continues = backslashes % 2 === 1;
				for (let at = from; at < (continues ? lineEnd - 1 : lineEnd); at++) raw.push(at);
				index = this.#nextLine(lineEnd);
				if (!continues || index >= this.text.length) break;
				from = index;
				while (isBlank(this.text[from])) from++;
			}

			const chars = this.decode(raw);
			if (chars) this.entry(chars);
		}
	}

	decode(raw: readonly number[]): Char[] | undefined {
		const chars: Char[] = [];
		for (let index = 0; index < raw.length; index++) {
			const at = raw[index]!;
			const char = this.text[at]!;
			if (char !== '\\') {
				chars.push({ char, start: at, end: at + 1, escaped: false });
				continue;
			}

			const next = raw[index + 1];
			if (next === undefined) break;
			const escape = this.text[next]!;
			if (escape === 'u') {
				const digits = raw.slice(index + 2, index + 6);
				const hex = digits.map((digit) => this.text[digit]).join('');
				const end = (digits.at(-1) ?? next) + 1;
				if (!/^[\da-f]{4}$/iu.test(hex)) {
					this.context.problem([at, end], 'parse-error', 'Malformed \\uXXXX escape');
					return undefined;
				}
				chars.push({ char: String.fromCodePoint(Number.parseInt(hex, 16)), start: at, end, escaped: true });
				index += 5;
				continue;
			}

			chars.push({ char: escapes[escape] ?? escape, start: at, end: next + 1, escaped: true });
			index++;
		}
		return chars;
	}

	entry(chars: readonly Char[]) {
		const isSeparator = (char: Char | undefined) =>
			char !== undefined && !char.escaped && (char.char === '=' || char.char === ':' || isBlank(char.char));
		const isSpace = (char: Char | undefined) => char !== undefined && !char.escaped && isBlank(char.char);

		let index = 0;
		while (index < chars.length && !isSeparator(chars[index])) index++;
		const key = chars.slice(0, index);
		while (isSpace(chars[index])) index++;
		if (isSeparator(chars[index])) index++;
		while (isSpace(chars[index])) index++;
		let end = chars.length;
		while (end > index && isSpace(chars[end - 1])) end--;
		const value = chars.slice(index, end);
		const valueRange = rangeOf(value, chars[index - 1]?.end ?? rangeOf(key, 0)[1]);

		if (key.length === 0) {
			this.context.problem(rangeOf(chars, 0), 'parse-error', 'Expected a key before the value');
			return;
		}

		const parts: Char[][] = [[]];
		for (const char of key) {
			if (char.char === '.' && !char.escaped) parts.push([]);
			else parts.at(-1)!.push(char);
		}
		const segments = parts.some((part) => part.length === 0) ? [key] : parts;

		let target = this.root;
		const path: string[] = [];
		for (const [position, segment] of segments.entries()) {
			const name = segment.map((char) => char.char).join('');
			const keyRange = rangeOf(segment, 0);
			path.push(name);
			const existing = target[name];
			if (position === segments.length - 1) {
				if (existing !== undefined) {
					this.context.problem(keyRange, 'duplicate-key', `Duplicate key '${path.join('.')}'`);
					if (isPlainObject(existing)) return;
				}
				target[name] = inferScalar(value.map((char) => char.char).join(''));
				this.context.add(path, keyRange, valueRange);
				return;
			}

			if (existing === undefined) target[name] = {};
			else if (!isPlainObject(existing)) {
				this.context.problem(keyRange, 'duplicate-key', `'${path.join('.')}' is already a value`);
				return;
			}
			this.context.add([...path], keyRange, [keyRange[0], valueRange[1]], false);
			target = target[name] as Record<string, unknown>;
		}
	}
}

const parse = (text: string, file = ''): ParseResult => {
	const context = new ParseContext(text, file);
	const parser = new PropertiesParser(context);
	parser.parse();
	const end = text.trimEnd().length;
	const start = Math.min(text.length - text.trimStart().length, end);
	context.add([], [start, end], [start, end]);
	return context.result(context.problems.some((problem) => problem.code === 'parse-error') ? undefined : parser.root);
};

export const properties: Format = { name: 'properties', parse, parseScalar: inferScalar };
