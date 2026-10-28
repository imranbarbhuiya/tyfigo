import { getStaticJSONValue, parseJSON, tokenize } from 'jsonc-eslint-parser';

import { ParseContext } from './format.ts';

import type { Path } from '../positions.ts';
import type { Format, ParseResult } from './format.ts';
import type { AST } from 'jsonc-eslint-parser';

const syntax = { jsonSyntax: 'JSON5' } as const;

const keyName = (key: AST.JSONProperty['key']) => (key.type === 'JSONIdentifier' ? key.name : String(key.value));

const walk = (context: ParseContext, node: AST.JSONExpression, path: Path) => {
	if (node.type === 'JSONObjectExpression') {
		const seen = new Set<string>();
		for (const property of node.properties) {
			const name = keyName(property.key);
			if (seen.has(name)) context.problem(property.key.range, 'duplicate-key', `Duplicate key '${name}'`);
			seen.add(name);
			const childPath = [...path, name];
			context.add(childPath, property.key.range, property.value.range);
			walk(context, property.value, childPath);
		}
	} else if (node.type === 'JSONArrayExpression') {
		for (const [index, item] of node.elements.entries()) {
			if (!item) continue;
			const childPath = [...path, index];
			context.add(childPath, item.range, item.range);
			walk(context, item, childPath);
		}
	}
};

const isEmpty = (text: string) => {
	try {
		return tokenize(text, syntax).length === 0;
	} catch {
		return false;
	}
};

const parse = (text: string, file = ''): ParseResult => {
	const context = new ParseContext(text, file);
	if (isEmpty(text)) {
		context.add([], [0, 0], [0, 0]);
		return context.result({});
	}

	let program: AST.JSONProgram;
	try {
		program = parseJSON(text, syntax);
	} catch (error) {
		const { index = 0, message } = error as Error & { index?: number };
		context.problem([index, index + 1], 'parse-error', message);
		return context.result(undefined);
	}

	const root = program.body[0].expression;
	context.add([], root.range, root.range);
	walk(context, root, []);
	return context.result(getStaticJSONValue(root));
};

const parseScalar = (text: string): unknown => {
	try {
		const value = getStaticJSONValue(parseJSON(text, syntax).body[0].expression);
		return typeof value === 'number' || typeof value === 'boolean' || value === null ? value : text;
	} catch {
		return text;
	}
};

export const json5: Format = { name: 'json5', parse, parseScalar };
