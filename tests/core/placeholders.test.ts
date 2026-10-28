import { describe, expect, it } from 'vitest';

import { ini, json5, jsonc, properties, toml, xml, yaml } from '../../src/core/formats/index.ts';
import { resolvePlaceholders } from '../../src/core/placeholders.ts';
import { SourceIndex } from '../../src/core/positions.ts';
import { sliceBytes } from '../helpers.ts';

import type { Format } from '../../src/core/formats/index.ts';
import type { Path } from '../../src/core/positions.ts';
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
	port: '8080',
	debug: 'true',
	host: 'localhost',
	fallbackPort: 3_000,
	typedPort: 8_080,
	typedDebug: true,
	emptyFallback: 'x',
	name: 'api',
	url: 'postgres://db:8080/app',
	embeddedNumber: 'port 8080',
	literal: '${NOT}',
	secret: '${SECRET:?SECRET is required}',
	missing: '${NOPE}',
	list: ['8080', 'a-api'],
};

const cases: [Format, string, unknown?][] = [
	[
		yaml,
		[
			'port: ${PORT}',
			'debug: ${DEBUG}',
			'host: ${HOST:-localhost}',
			'fallbackPort: ${MISSING_PORT:-3000}',
			'typedPort: ${PORT:-3000}',
			'typedDebug: ${DEBUG:-false}',
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
			'typedPort = "${PORT:-3000}"',
			'typedDebug = "${DEBUG:-false}"',
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
			'\t"typedPort": "${PORT:-3000}",',
			'\t"typedDebug": "${DEBUG:-false}",',
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
			"\ttypedPort: '${PORT:-3000}',",
			"\ttypedDebug: '${DEBUG:-false}',",
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
			'typedPort = ${PORT:-3000}',
			'typedDebug = ${DEBUG:-false}',
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
			'typedPort = ${PORT:-3000}',
			'typedDebug = ${DEBUG:-false}',
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
			'\t<typedPort>${PORT:-3000}</typedPort>',
			'\t<typedDebug>${DEBUG:-false}</typedDebug>',
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

	it('types whole values by their default and keeps the rest as strings', () => {
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

const typedCases: [Format, string, string][] = [
	[yaml, 'port: ${PORT:-3000}\nraw: ${PORT}\n', 'port: ${PORT}\n'],
	[toml, 'port = "${PORT:-3000}"\nraw = "${PORT}"\n', 'port = "${PORT}"\n'],
	[ini, 'port = ${PORT:-3000}\nraw = ${PORT}\n', 'port = ${PORT}\n'],
];

const resolveTyped = (
	format: Format,
	text: string,
	variables: Record<string, string>,
	baseValueAt?: (path: Path) => unknown,
) => {
	const parsed = format.parse(text, 'app.config');
	expect(parsed.problems).toEqual([]);
	return resolvePlaceholders({
		value: parsed.value,
		positions: parsed.positions,
		source: new SourceIndex(text),
		file: 'app.config',
		format,
		variables,
		baseValueAt,
	});
};

const port = (value: unknown) => (path: Path) => (path[0] === 'port' ? value : undefined);

describe.each(typedCases)('whole-value placeholder types in %s', (format, base, override) => {
	it('converts ${PORT:-3000} to a number and keeps ${PORT} a string', () => {
		expect(resolveTyped(format, base, { PORT: '8080' })).toEqual({
			value: { port: 8_080, raw: '8080' },
			problems: [],
		});
		expect(resolveTyped(format, base, {}).value).toMatchObject({ port: 3_000 });
	});

	it('converts an override to the type of the base key', () => {
		expect(resolveTyped(format, override, { PORT: '8080' }, port(3_000)).value).toEqual({ port: 8_080 });
		expect(resolveTyped(format, override, { PORT: '8080' }, port('x')).value).toEqual({ port: '8080' });
		expect(resolveTyped(format, override, { PORT: 'true' }, port(false)).value).toEqual({ port: true });
	});

	it('reports a value that is not of the default type at the placeholder', () => {
		const result = resolveTyped(format, base, { PORT: 'abc' });
		expect(result.problems).toEqual([
			expect.objectContaining({
				code: 'placeholder-type',
				line: 1,
				column: base.indexOf('${') + 1,
				message: `Expected number at 'port', but environment variable 'PORT' is "abc"`,
			}),
		]);
		expect(problemText(base, result.problems[0])).toBe('${PORT:-3000}');
	});

	it('reports an override that is not of the base type at the placeholder', () => {
		const result = resolveTyped(format, override, { PORT: 'abc' }, port(3_000));
		expect(result.problems).toEqual([
			expect.objectContaining({
				code: 'placeholder-type',
				line: 1,
				column: override.indexOf('${') + 1,
				message: `Expected number at 'port', but environment variable 'PORT' is "abc"`,
			}),
		]);
		expect(problemText(override, result.problems[0])).toBe('${PORT}');
	});
});

describe('whole-value placeholder type edge cases', () => {
	it('types booleans and null by their default', () => {
		const text = 'a: ${A:-false}\nb: ${B:-null}\n';
		expect(resolveTyped(yaml, text, { A: 'true', B: '~' }).value).toEqual({ a: true, b: null });
		expect(resolveTyped(yaml, text, { A: 'yes', B: 'x' }).problems.map((problem) => problem.message)).toEqual([
			`Expected boolean at 'a', but environment variable 'A' is "yes"`,
			`Expected null at 'b', but environment variable 'B' is "x"`,
		]);
	});

	it('keeps a placeholder with a string default, an empty default or a required one as text', () => {
		expect(resolveTyped(yaml, 'a: ${A:-bob}\nb: ${B:?set B}\nc: ${C:-}\n', { A: '8080', B: 'true' }).value).toEqual(
			{ a: '8080', b: 'true', c: '' },
		);
	});

	it('reports a default that does not match the base type', () => {
		expect(resolveTyped(yaml, 'port: ${PORT:-abc}\n', {}, () => 3_000).problems).toEqual([
			expect.objectContaining({
				code: 'placeholder-type',
				message: `Expected number at 'port', but the default of 'PORT' is "abc"`,
			}),
		]);
	});

	it('keeps the base value when an override cannot resolve, so only the missing variable is reported', () => {
		const result = resolveTyped(yaml, 'port: ${PORT}\n', {}, () => 3_000);
		expect(result.value).toEqual({ port: 3_000 });
		expect(result.problems.map((problem) => problem.code)).toEqual(['missing-variable']);
	});

	it('leaves a placeholder over an object to the merge', () => {
		expect(resolveTyped(yaml, 'db: ${DB}\n', { DB: '1' }, () => ({ host: 'x' })).value).toEqual({ db: '1' });
	});
});
