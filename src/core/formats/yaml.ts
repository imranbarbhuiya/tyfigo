import { isAlias, isMap, isNode, isScalar, isSeq, parseDocument } from 'yaml';

import { ParseContext } from './format.ts';

import type { Path } from '../positions.ts';
import type { Format, ParseResult } from './format.ts';
import type { Document, Node } from 'yaml';

type Range = readonly [number, number];

const nodeRange = (text: string, node: Node | null | undefined, fallback: number): Range => {
	if (!node?.range) return [fallback, fallback];
	const [start] = node.range;
	let end = node.range[1];
	while (end > start && /\s/u.test(text[end - 1] ?? '')) end--;
	return [start, end];
};

const walk = (context: ParseContext, document: Document, node: unknown, path: Path, seen: Set<Node>) => {
	const target = isAlias(node) ? node.resolve(document) : node;
	if (!isNode(target) || seen.has(target)) return;
	if (isMap(target)) {
		seen.add(target);
		for (const pair of target.items) {
			if (!isScalar(pair.key)) continue;
			const keyRange = nodeRange(context.source.text, pair.key, 0);
			const value = pair.value as Node | null;
			const childPath = [...path, String(pair.key.value)];
			context.add(childPath, keyRange, nodeRange(context.source.text, value, keyRange[1]));
			walk(context, document, value, childPath, seen);
		}
		seen.delete(target);
	} else if (isSeq(target)) {
		seen.add(target);
		for (const [index, item] of target.items.entries()) {
			const range = nodeRange(context.source.text, item as Node | null, target.range?.[0] ?? 0);
			const childPath = [...path, index];
			context.add(childPath, range, range);
			walk(context, document, item, childPath, seen);
		}
		seen.delete(target);
	}
};

const parse = (text: string, file = ''): ParseResult => {
	const context = new ParseContext(text, file);
	const document = parseDocument(text, { prettyErrors: false });
	for (const error of document.errors) {
		context.problem(error.pos, error.code === 'DUPLICATE_KEY' ? 'duplicate-key' : 'parse-error', error.message);
	}
	if (document.contents === null) {
		context.add([], [0, 0], [0, 0]);
		return context.result({});
	}

	const root = nodeRange(text, document.contents, 0);
	context.add([], root, root);
	walk(context, document, document.contents, [], new Set());

	let value: unknown;
	try {
		value = document.toJS();
	} catch (error) {
		context.problem(root, 'parse-error', (error as Error).message);
		return context.result(undefined);
	}
	return context.result(value);
};

const parseScalar = (text: string): unknown => {
	if (text === '') return text;
	const document = parseDocument(text, { prettyErrors: false });
	const node = document.contents;
	if (document.errors.length > 0 || !isScalar(node) || node.type !== 'PLAIN') return text;
	if (node.range[0] !== 0 || node.range[1] !== text.length) return text;
	return node.value;
};

export const yaml: Format = { name: 'yaml', parse, parseScalar };
