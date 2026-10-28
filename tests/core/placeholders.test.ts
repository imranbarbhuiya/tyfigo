import { describe, expect, it } from 'vitest';

import { ini, json5, jsonc, properties, toml, xml, yaml } from '../../src/core/formats/index.ts';
import { resolvePlaceholders } from '../../src/core/placeholders.ts';
import { SourceIndex } from '../../src/core/positions.ts';
import { sliceBytes } from '../helpers.ts';

import type { Format } from '../../src/core/formats/index.ts';
import type { Problem } from '../../src/core/problems.ts';

const variables = { PORT: '8080', DEBUG: 'true', NAME: 'api', EMPTY: '' };

const resolve = (format: Format, text: string) => {
	const parsed = format.parse(text, 'app.config');
	expect(parsed.problems).toEqual([]);
	return resolvePlaceholders({
		value: parsed.value,
		positions: parsed.positions,
		source: new SourceIndex(text),
		file: 'app.config',
		format,
		variables,
	});
};

const problemText = (text: string, problem: Problem | undefined) =>
	problem && sliceBytes(text, problem.start, problem.length);

const expected = {
	port: 8_080,
	debug: true,
	host: 'localhost',
	fallbackPort: 3_000,
	emptyFallback: 'x',
	name: 'api',
	url: 'postgres://db:8080/app',
	embeddedNumber: 'port 8080',
	literal: '${NOT}',
	secret: '${SECRET:?SECRET is required}',
	missing: '${NOPE}',
	list: [8_080, 'a-api'],
};

const cases: [Format, string, unknown?][] = [
	[
		yaml,
		[
			'port: ${PORT}',
			'debug: ${DEBUG}',
			'host: ${HOST:-localhost}',
			'fallbackPort: ${MISSING_PORT:-3000}',
			'emptyFallback: ${EMPTY:-x}',
			'name: ${NAME:?unused}',
			'url: postgres://${HOST:-db}:${PORT}/app',
			'embeddedNumber: port ${PORT}',
			'literal: $${NOT}',
			"secret: '${SECRET:?SECRET is required}'",
			'missing: "${NOPE}"',
			'list: ["${PORT}", "a-${NAME}"]',
			'',
		].join('\n'),
	],
	[
		toml,
		[
			'port = "${PORT}"',
			'debug = "${DEBUG}"',
			'host = "${HOST:-localhost}"',
			'fallbackPort = "${MISSING_PORT:-3000}"',
			'emptyFallback = "${EMPTY:-x}"',
			'name = "${NAME:?unused}"',
			'url = "postgres://${HOST:-db}:${PORT}/app"',
			'embeddedNumber = "port ${PORT}"',
			'literal = "$${NOT}"',
			"secret = '${SECRET:?SECRET is required}'",
			'missing = "${NOPE}"',
			'list = ["${PORT}", "a-${NAME}"]',
			'',
		].join('\n'),
	],
	[
		jsonc,
		[
			'{',
			'\t"port": "${PORT}",',
			'\t"debug": "${DEBUG}",',
			'\t"host": "${HOST:-localhost}",',
			'\t"fallbackPort": "${MISSING_PORT:-3000}",',
			'\t"emptyFallback": "${EMPTY:-x}",',
			'\t"name": "${NAME:?unused}",',
			'\t"url": "postgres://${HOST:-db}:${PORT}/app",',
			'\t"embeddedNumber": "port ${PORT}",',
			'\t"literal": "$${NOT}",',
			'\t"secret": "${SECRET:?SECRET is required}",',
			'\t"missing": "${NOPE}",',
			'\t"list": ["${PORT}", "a-${NAME}"],',
			'}',
		].join('\n'),
	],
	[
		json5,
		[
			'{',
			"\tport: '${PORT}',",
			"\tdebug: '${DEBUG}',",
			"\thost: '${HOST:-localhost}',",
			"\tfallbackPort: '${MISSING_PORT:-3000}',",
			"\temptyFallback: '${EMPTY:-x}',",
			"\tname: '${NAME:?unused}',",
			"\turl: 'postgres://${HOST:-db}:${PORT}/app',",
			"\tembeddedNumber: 'port ${PORT}',",
			"\tliteral: '$${NOT}',",
			"\tsecret: '${SECRET:?SECRET is required}',",
			"\tmissing: '${NOPE}',",
			"\tlist: ['${PORT}', 'a-${NAME}'],",
			'}',
		].join('\n'),
	],
	[
		ini,
		[
			'port = ${PORT}',
			'debug = ${DEBUG}',
			'host = ${HOST:-localhost}',
			'fallbackPort = ${MISSING_PORT:-3000}',
			'emptyFallback = ${EMPTY:-x}',
			'name = ${NAME:?unused}',
			'url = postgres://${HOST:-db}:${PORT}/app',
			'embeddedNumber = port ${PORT}',
			'literal = $${NOT}',
			"secret = '${SECRET:?SECRET is required}'",
			'missing = "${NOPE}"',
			'list[] = ${PORT}',
			'list[] = a-${NAME}',
			'',
		].join('\n'),
	],
	[
		properties,
		[
			'port = ${PORT}',
			'debug = ${DEBUG}',
			'host = ${HOST:-localhost}',
			'fallbackPort = ${MISSING_PORT:-3000}',
			'emptyFallback = ${EMPTY:-x}',
			'name = ${NAME:?unused}',
			'url = postgres://${HOST:-db}:${PORT}/app',
			'embeddedNumber = port ${PORT}',
			'literal = $${NOT}',
			'secret = ${SECRET:?SECRET is required}',
			'missing = ${NOPE}',
			'',
		].join('\n'),
		{ ...expected, list: undefined },
	],
	[
		xml,
		[
			'<config>',
			'\t<port>${PORT}</port>',
			'\t<debug>${DEBUG}</debug>',
			'\t<host>${HOST:-localhost}</host>',
			'\t<fallbackPort>${MISSING_PORT:-3000}</fallbackPort>',
			'\t<emptyFallback>${EMPTY:-x}</emptyFallback>',
			'\t<name>${NAME:?unused}</name>',
			'\t<url>postgres://${HOST:-db}:${PORT}/app</url>',
			'\t<embeddedNumber>port ${PORT}</embeddedNumber>',
			'\t<literal>$${NOT}</literal>',
			'\t<secret>${SECRET:?SECRET is required}</secret>',
			'\t<missing>${NOPE}</missing>',
			'\t<list>${PORT}</list>',
			'\t<list>a-${NAME}</list>',
			'</config>',
		].join('\n'),
		{ config: expected },
	],
];

describe.each(cases)('placeholders in %s', (format, text, value = expected) => {
	const lineOf = (needle: string) => text.split('\n').findIndex((line) => line.includes(needle)) + 1;

	it('resolves whole values with the format, embedded ones as strings', () => {
		expect(resolve(format, text).value).toEqual(value);
	});

	it('reports ${VAR:?message} with its message at the placeholder', () => {
		const problem = resolve(format, text).problems.find((item) => item.message === 'SECRET is required');
		expect(problem).toMatchObject({ code: 'missing-variable', line: lineOf('secret') });
		expect(problemText(text, problem)).toBe('${SECRET:?SECRET is required}');
	});

	it('reports a missing ${VAR}', () => {
		const problem = resolve(format, text).problems.find((item) => item.message.includes('NOPE'));
		expect(problem).toMatchObject({
			code: 'missing-variable',
			message: "Environment variable 'NOPE' is not set",
			line: lineOf('missing'),
		});
		expect(problemText(text, problem)).toBe('${NOPE}');
	});

	it('reports nothing else', () => {
		expect(resolve(format, text).problems).toHaveLength(2);
	});
});

describe('placeholder edge cases', () => {
	it('reports a placeholder with an invalid name', () => {
		const text = 'a: x-${1BAD}\n';
		const result = resolve(yaml, text);
		expect(result.problems).toEqual([
			expect.objectContaining({ code: 'invalid-placeholder', line: 1, column: 6, length: '${1BAD}'.length }),
		]);
	});

	it('treats an empty variable as set for ${VAR} and as missing for ${VAR:?}', () => {
		const result = resolve(yaml, 'a: "${EMPTY}"\nb: "${EMPTY:?needed}"\n');
		expect(result.value).toEqual({ a: '', b: '${EMPTY:?needed}' });
		expect(result.problems).toEqual([expect.objectContaining({ message: 'needed', line: 2 })]);
	});

	it('never resolves keys', () => {
		expect(resolve(jsonc, '{"${PORT}": 1}').value).toEqual({ '${PORT}': 1 });
	});
});
