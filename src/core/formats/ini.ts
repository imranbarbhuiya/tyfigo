import { inferScalar, ParseContext } from './format.ts';

import { isPlainObject } from '../placeholders.ts';
import { pathKey } from '../positions.ts';

import type { Path } from '../positions.ts';
import type { Format, ParseResult } from './format.ts';

type Range = readonly [number, number];

const isSpace = (char: string | undefined) => char === ' ' || char === '\t' || char === '\r' || char === '\n';

const trim = (text: string, [start, end]: Range): Range => {
	let from = start;
	let to = end;
	while (from < to && isSpace(text[from])) from++;
	while (to > from && isSpace(text[to - 1])) to--;
	return [from, to];
};

const isComment = (text: string, index: number, start: number) =>
	(text[index] === ';' || text[index] === '#') && (index === start || isSpace(text[index - 1]));

interface Section {
	readonly path: Path;
	readonly keys: readonly Range[];
	readonly start: number;
	end: number;
}

class IniParser {
	readonly context: ParseContext;
	readonly text: string;
	readonly root: Record<string, unknown> = {};
	readonly #arrays = new Map<string, { key: Range; start: number }>();
	#target: Record<string, unknown> | undefined = this.root;
	#path: Path = [];
	#section: Section | undefined;

	constructor(context: ParseContext) {
		this.context = context;
		this.text = context.source.text;
	}

	parse() {
		let start = 0;
		while (start <= this.text.length) {
			let end = this.text.indexOf('\n', start);
			if (end === -1) end = this.text.length;
			this.line(trim(this.text, [start, end]));
			start = end + 1;
		}
		this.#closeSection();
	}

	line(range: Range) {
		const [start, end] = range;
		if (start === end || isComment(this.text, start, start)) return;
		if (this.text[start] === '[') {
			this.header(range);
			return;
		}
		this.keyValue(range);
		if (this.#section) this.#section.end = end;
	}

	header([start, end]: Range) {
		this.#closeSection();
		const close = this.text.indexOf(']', start);
		const rest = close === -1 || close >= end ? undefined : trim(this.text, [close + 1, end]);
		if (!rest || (rest[0] !== rest[1] && !isComment(this.text, rest[0], rest[0]))) {
			this.context.problem([start, end], 'parse-error', "Expected a section header like '[name]'");
			this.#target = undefined;
			return;
		}

		const keys: Range[] = [];
		let from = start + 1;
		for (let index = start + 1; index <= close; index++) {
			if (index < close && this.text[index] !== '.') continue;
			const part = trim(this.text, [from, index]);
			if (part[0] === part[1]) {
				this.context.problem([start, close + 1], 'parse-error', 'Section names cannot have empty parts');
				this.#target = undefined;
				return;
			}
			keys.push(part);
			from = index + 1;
		}

		let target = this.root;
		const path: string[] = [];
		for (const key of keys) {
			const name = this.text.slice(key[0], key[1]);
			path.push(name);
			const existing = target[name];
			if (existing === undefined) target[name] = {};
			else if (!isPlainObject(existing)) {
				this.context.problem(key, 'duplicate-key', `'${path.join('.')}' is already a value`);
				this.#target = undefined;
				return;
			}
			target = target[name] as Record<string, unknown>;
		}

		this.#target = target;
		this.#path = path;
		this.#section = { path, keys, start, end: close + 1 };
	}

	#closeSection() {
		const section = this.#section;
		if (!section) return;
		for (const [index, key] of section.keys.entries()) {
			this.context.add(section.path.slice(0, index + 1), key, [section.start, section.end], false);
		}
		this.#section = undefined;
	}

	keyValue([start, end]: Range) {
		const equals = this.text.indexOf('=', start);
		if (equals === -1 || equals >= end) {
			this.context.problem([start, end], 'parse-error', "Expected '=' after the key");
			return;
		}

		let key = trim(this.text, [start, equals]);
		const isArray = this.text.slice(key[1] - 2, key[1]) === '[]';
		if (isArray) key = trim(this.text, [key[0], key[1] - 2]);
		if (key[0] === key[1]) {
			this.context.problem([start, equals + 1], 'parse-error', 'Expected a key before the value');
			return;
		}

		const value = this.value(trim(this.text, [equals + 1, end]));
		const target = this.#target;
		if (!value || !target) return;

		const name = this.text.slice(key[0], key[1]);
		const path = [...this.#path, name];
		const id = pathKey(path);
		const existing = target[name];
		if (isArray) {
			const array = this.#arrays.get(id);
			if (existing !== undefined && !array) {
				this.context.problem(key, 'duplicate-key', `Duplicate key '${name}'`);
				return;
			}
			const items = (existing as unknown[] | undefined) ?? [];
			const first = array ?? { key, start: value.range[0] };
			this.#arrays.set(id, first);
			target[name] = [...items, value.value];
			this.context.add(path, first.key, [first.start, value.range[1]]);
			this.context.add([...path, items.length], value.range, value.range);
			return;
		}

		if (existing !== undefined) {
			this.context.problem(key, 'duplicate-key', `Duplicate key '${name}'`);
			if (isPlainObject(existing) || Array.isArray(existing)) return;
		}
		target[name] = value.value;
		this.context.add(path, key, value.range);
	}

	value(range: Range): { value: unknown; range: Range } | undefined {
		const [start, end] = range;
		const quote = this.text[start];
		if (quote !== '"' && quote !== "'") {
			let to = end;
			for (let index = start; index < end; index++) {
				if (isComment(this.text, index, start)) {
					to = index;
					break;
				}
			}
			const value = trim(this.text, [start, to]);
			return { value: inferScalar(this.text.slice(value[0], value[1])), range: value };
		}

		let close = -1;
		for (let index = start + 1; index < end; index++) {
			if (quote === '"' && this.text[index] === '\\') index++;
			else if (this.text[index] === quote) {
				close = index;
				break;
			}
		}
		if (close === -1) {
			this.context.problem(range, 'parse-error', 'Unterminated string');
			return undefined;
		}

		const rest = trim(this.text, [close + 1, end]);
		if (rest[0] !== rest[1] && !isComment(this.text, rest[0], rest[0])) {
			this.context.problem(rest, 'parse-error', 'Unexpected text after the quoted value');
			return undefined;
		}

		const raw = this.text.slice(start, close + 1);
		if (quote === "'") return { value: raw.slice(1, -1), range: [start, close + 1] };
		try {
			return { value: JSON.parse(raw) as string, range: [start, close + 1] };
		} catch {
			this.context.problem([start, close + 1], 'parse-error', 'Invalid escape sequence in string');
			return undefined;
		}
	}
}

const parse = (text: string, file = ''): ParseResult => {
	const context = new ParseContext(text, file);
	const parser = new IniParser(context);
	parser.parse();
	const root = trim(text, [0, text.length]);
	context.add([], root, root);
	return context.result(context.problems.some((problem) => problem.code === 'parse-error') ? undefined : parser.root);
};

export const ini: Format = { name: 'ini', parse, parseScalar: inferScalar };
