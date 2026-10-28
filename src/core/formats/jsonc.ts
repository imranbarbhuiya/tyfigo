import { getNodeValue, parseTree, printParseErrorCode } from 'jsonc-parser';

import { ParseContext } from './format.ts';

import type { Path } from '../positions.ts';
import type { Format, ParseResult } from './format.ts';
import type { Node, ParseError } from 'jsonc-parser';

const nodeRange = (node: Node): readonly [number, number] => [node.offset, node.offset + node.length];

const errorMessage = (error: ParseError) => {
	const words = printParseErrorCode(error.error)
		.replaceAll(/(?<=[a-z])(?=[A-Z])/gu, ' ')
		.toLowerCase();
	return words.charAt(0).toUpperCase() + words.slice(1);
};

const walk = (context: ParseContext, node: Node, path: Path) => {
	if (node.type === 'object') {
		const seen = new Set<string>();
		for (const property of node.children ?? []) {
			const [key, value] = property.children ?? [];
			if (key?.type !== 'string') continue;
			const name = String(key.value);
			if (seen.has(name)) context.problem(nodeRange(key), 'duplicate-key', `Duplicate key '${name}'`);
			seen.add(name);
			const childPath = [...path, name];
			const keyRange = nodeRange(key);
			context.add(childPath, keyRange, value ? nodeRange(value) : [keyRange[1], keyRange[1]]);
			if (value) walk(context, value, childPath);
		}
	} else if (node.type === 'array') {
		for (const [index, item] of (node.children ?? []).entries()) {
			const childPath = [...path, index];
			context.add(childPath, nodeRange(item), nodeRange(item));
			walk(context, item, childPath);
		}
	}
};

const parse = (text: string, file = ''): ParseResult => {
	const context = new ParseContext(text, file);
	const errors: ParseError[] = [];
	const root = parseTree(text, errors, { allowTrailingComma: true, disallowComments: false });
	if (!root) {
		const onlyComments = errors.length === 1 && printParseErrorCode(errors[0]!.error) === 'ValueExpected';
		if (onlyComments && errors[0]!.offset >= text.trimEnd().length) {
			context.add([], [0, 0], [0, 0]);
			return context.result({});
		}
	}

	for (const error of errors) {
		context.problem([error.offset, error.offset + error.length], 'parse-error', errorMessage(error));
	}
	if (!root) return context.result(undefined);
	context.add([], nodeRange(root), nodeRange(root));
	walk(context, root, []);
	return context.result(getNodeValue(root));
};

const parseScalar = (text: string): unknown => {
	try {
		const value: unknown = JSON.parse(text);
		return typeof value === 'number' || typeof value === 'boolean' || value === null ? value : text;
	} catch {
		return text;
	}
};

export const jsonc: Format = { name: 'jsonc', parse, parseScalar };
