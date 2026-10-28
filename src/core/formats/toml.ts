import { getStaticTOMLValue, parseTOML } from 'toml-eslint-parser';

import { ParseContext } from './format.ts';

import { pathKey } from '../positions.ts';

import type { Path } from '../positions.ts';
import type { Format, ParseResult } from './format.ts';
import type { AST } from 'toml-eslint-parser';

type Range = readonly [number, number];

const keyName = (part: AST.TOMLBare | AST.TOMLQuoted) => (part.type === 'TOMLBare' ? part.name : part.value);

class TomlWalker {
	readonly context: ParseContext;
	readonly dates: { path: Path; text: string }[] = [];
	readonly #arrayStarts = new Map<string, { key: Range; start: number }>();

	constructor(context: ParseContext) {
		this.context = context;
	}

	table(table: AST.TOMLTable) {
		const parts = table.key.keys;
		const path: (string | number)[] = [];
		let part = 0;
		for (const [index, segment] of table.resolvedKey.entries()) {
			path.push(segment);
			const isLast = index === table.resolvedKey.length - 1;
			if (typeof segment === 'number') {
				this.context.add([...path], table.key.range, table.range, isLast);
				continue;
			}

			const keyRange = parts[part++]?.range ?? table.key.range;
			const nextIsIndex = typeof table.resolvedKey[index + 1] === 'number';
			if (nextIsIndex && table.kind === 'array' && index === table.resolvedKey.length - 2) {
				const id = pathKey(path);
				const first = this.#arrayStarts.get(id) ?? { key: keyRange, start: table.range[0] };
				this.#arrayStarts.set(id, first);
				this.context.add([...path], first.key, [first.start, table.range[1]]);
			} else this.context.add([...path], keyRange, isLast ? table.range : [keyRange[0], table.range[1]], isLast);
		}

		for (const keyValue of table.body) this.keyValue(keyValue, table.resolvedKey);
	}

	keyValue(keyValue: AST.TOMLKeyValue, base: Path) {
		const path = [...base];
		for (const [index, part] of keyValue.key.keys.entries()) {
			path.push(keyName(part));
			const isLast = index === keyValue.key.keys.length - 1;
			this.context.add(
				[...path],
				part.range,
				isLast ? keyValue.value.range : [part.range[0], keyValue.range[1]],
				isLast,
			);
		}

		this.value(keyValue.value, path);
	}

	value(node: AST.TOMLContentNode, path: Path) {
		if (node.type === 'TOMLInlineTable') for (const keyValue of node.body) this.keyValue(keyValue, path);
		else if (node.type === 'TOMLArray') {
			for (const [index, item] of node.elements.entries()) {
				const childPath = [...path, index];
				this.context.add(childPath, item.range, item.range);
				this.value(item, childPath);
			}
		} else if (
			node.kind !== 'string' &&
			node.kind !== 'integer' &&
			node.kind !== 'float' &&
			node.kind !== 'boolean'
		) {
			this.dates.push({ path, text: node.datetime });
		}
	}
}

const setAt = (root: unknown, path: Path, value: unknown) => {
	let target = root as Record<string | number, unknown>;
	for (const segment of path.slice(0, -1)) target = target[segment] as Record<string | number, unknown>;
	target[path.at(-1)!] = value;
};

const parse = (text: string, file = ''): ParseResult => {
	const context = new ParseContext(text, file);
	let program: AST.TOMLProgram;
	try {
		program = parseTOML(text);
	} catch (error) {
		const { index = 0, message } = error as Error & { index?: number };
		context.problem(
			[index, index + 1],
			message.startsWith('Defining a key multiple times') ? 'duplicate-key' : 'parse-error',
			message,
		);
		return context.result(undefined);
	}

	const top = program.body[0];
	context.add([], top.range, top.range);
	const walker = new TomlWalker(context);
	for (const item of top.body) {
		if (item.type === 'TOMLTable') walker.table(item);
		else walker.keyValue(item, []);
	}

	const value = getStaticTOMLValue(program);
	for (const date of walker.dates) setAt(value, date.path, date.text);
	return context.result(value);
};

const parseScalar = (text: string): unknown => {
	if (/[\n\r]/u.test(text)) return text;
	try {
		const item = parseTOML(`value = ${text}`).body[0].body[0];
		if (item?.type !== 'TOMLKeyValue' || item.value.type !== 'TOMLValue') return text;
		const { kind, value } = item.value;
		return kind === 'integer' || kind === 'float' || kind === 'boolean' ? value : text;
	} catch {
		return text;
	}
};

export const toml: Format = { name: 'toml', parse, parseScalar };
