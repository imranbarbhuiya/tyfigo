import { describe, expect, it } from 'vitest';

import { json5, jsonc, parseConfigFileName, toml, yaml } from '../../src/core/formats/index.ts';
import { spanText } from '../helpers.ts';

describe('yaml', () => {
	const text = [
		'# comment',
		'name: "héllo ✓"',
		'db:',
		'  url: postgres://x',
		'  port: 5432',
		'tags:',
		'  - a',
		'  - 😀 b',
		'after: true',
		'empty:',
		'',
	].join('\n');

	it('parses the value', () => {
		const result = yaml.parse(text, 'app.config.yaml');
		expect(result.problems).toEqual([]);
		expect(result.value).toEqual({
			name: 'héllo ✓',
			db: { url: 'postgres://x', port: 5_432 },
			tags: ['a', '😀 b'],
			after: true,
			empty: null,
		});
	});

	it('maps every key and value in UTF-8 bytes', () => {
		const { positions } = yaml.parse(text);
		expect(spanText(text, positions, ['name'])).toEqual({ key: 'name', value: '"héllo ✓"' });
		expect(spanText(text, positions, ['db'])).toEqual({ key: 'db', value: 'url: postgres://x\n  port: 5432' });
		expect(spanText(text, positions, ['db', 'url'])).toEqual({ key: 'url', value: 'postgres://x' });
		expect(spanText(text, positions, ['db', 'port'])).toEqual({ key: 'port', value: '5432' });
		expect(spanText(text, positions, ['tags', 1])).toEqual({ key: '😀 b', value: '😀 b' });
		expect(spanText(text, positions, ['after'])).toEqual({ key: 'after', value: 'true' });
		expect(spanText(text, positions, ['empty']).key).toBe('empty');
		expect(positions.has('[]')).toBe(true);
	});

	it('maps keys reached through an alias to the anchor', () => {
		const source = 'base: &b\n  port: 1\ncopy: *b\n';
		const result = yaml.parse(source);
		expect(result.value).toEqual({ base: { port: 1 }, copy: { port: 1 } });
		expect(spanText(source, result.positions, ['copy'])).toEqual({ key: 'copy', value: '*b' });
		expect(spanText(source, result.positions, ['copy', 'port'])).toEqual({ key: 'port', value: '1' });
	});

	it('reports parse errors with line and column', () => {
		const result = yaml.parse('a: 1\nb: c: d\ne: 1\n', 'bad.config.yaml');
		expect(result.problems.length).toBeGreaterThan(0);
		expect(result.problems[0]).toMatchObject({ file: 'bad.config.yaml', code: 'parse-error', line: 2, column: 4 });
	});

	it('reports duplicate keys', () => {
		const result = yaml.parse('a: 1\na: 2\n');
		expect(result.problems[0]).toMatchObject({ code: 'duplicate-key', line: 2, column: 1 });
	});

	it('reads an empty file as an empty object', () => {
		expect(yaml.parse('# nothing\n').value).toEqual({});
	});

	it('reads whole-value placeholders as plain scalars', () => {
		expect(yaml.parseScalar('8080')).toBe(8_080);
		expect(yaml.parseScalar('true')).toBe(true);
		expect(yaml.parseScalar('null')).toBeNull();
		expect(yaml.parseScalar('localhost')).toBe('localhost');
		expect(yaml.parseScalar('a: b')).toBe('a: b');
		expect(yaml.parseScalar('"8080"')).toBe('"8080"');
		expect(yaml.parseScalar('1 # x')).toBe('1 # x');
	});
});

describe('toml', () => {
	const text = [
		'title = "héllo ✓"',
		'',
		'[db]',
		'url = "postgres://x"',
		'port = 5432',
		'',
		'[[servers]]',
		'name = "a"',
		'',
		'[[servers]]',
		'name = "😀 b"',
		'dotted.key = true',
		'when = 1979-05-27',
		'inline = { x = 1, list = [1, 2] }',
		'',
	].join('\n');

	it('parses the value', () => {
		const result = toml.parse(text);
		expect(result.problems).toEqual([]);
		expect(result.value).toEqual({
			title: 'héllo ✓',
			db: { url: 'postgres://x', port: 5_432 },
			servers: [
				{ name: 'a' },
				{ name: '😀 b', dotted: { key: true }, when: '1979-05-27', inline: { x: 1, list: [1, 2] } },
			],
		});
	});

	it('maps every key and value in UTF-8 bytes', () => {
		const { positions } = toml.parse(text);
		expect(spanText(text, positions, ['title'])).toEqual({ key: 'title', value: '"héllo ✓"' });
		expect(spanText(text, positions, ['db'])).toEqual({
			key: 'db',
			value: '[db]\nurl = "postgres://x"\nport = 5432',
		});
		expect(spanText(text, positions, ['db', 'url'])).toEqual({ key: 'url', value: '"postgres://x"' });
		expect(spanText(text, positions, ['db', 'port'])).toEqual({ key: 'port', value: '5432' });
		expect(spanText(text, positions, ['servers']).key).toBe('servers');
		expect(spanText(text, positions, ['servers']).value).toMatch(
			/^\[\[servers\]\][\s\S]*inline = \{ x = 1, list = \[1, 2\] \}$/u,
		);
		expect(spanText(text, positions, ['servers', 0])).toEqual({ key: 'servers', value: '[[servers]]\nname = "a"' });
		expect(spanText(text, positions, ['servers', 1, 'name'])).toEqual({ key: 'name', value: '"😀 b"' });
		expect(spanText(text, positions, ['servers', 1, 'dotted'])).toEqual({
			key: 'dotted',
			value: 'dotted.key = true',
		});
		expect(spanText(text, positions, ['servers', 1, 'dotted', 'key'])).toEqual({ key: 'key', value: 'true' });
		expect(spanText(text, positions, ['servers', 1, 'when'])).toEqual({ key: 'when', value: '1979-05-27' });
		expect(spanText(text, positions, ['servers', 1, 'inline', 'x'])).toEqual({ key: 'x', value: '1' });
		expect(spanText(text, positions, ['servers', 1, 'inline', 'list', 1])).toEqual({ key: '2', value: '2' });
	});

	it('reports parse errors with line and column', () => {
		const result = toml.parse('a = 1\nb = "x\nc = 2\n', 'bad.config.toml');
		expect(result.value).toBeUndefined();
		expect(result.problems).toEqual([
			expect.objectContaining({ file: 'bad.config.toml', code: 'parse-error', line: 2, column: 7 }),
		]);
	});

	it('reports duplicate keys', () => {
		expect(toml.parse('a = 1\na = 2\n').problems[0]).toMatchObject({ code: 'duplicate-key', line: 2, column: 1 });
	});

	it('reads an empty file as an empty object', () => {
		expect(toml.parse('# nothing\n').value).toEqual({});
	});

	it('reads whole-value placeholders as TOML values', () => {
		expect(toml.parseScalar('8080')).toBe(8_080);
		expect(toml.parseScalar('1_000')).toBe(1_000);
		expect(toml.parseScalar('false')).toBe(false);
		expect(toml.parseScalar('localhost')).toBe('localhost');
		expect(toml.parseScalar('1979-05-27')).toBe('1979-05-27');
		expect(toml.parseScalar('1\nb = 2')).toBe('1\nb = 2');
	});
});

describe('jsonc', () => {
	const text = [
		'// comment',
		'{',
		'\t"name": "héllo ✓", /* block */',
		'\t"db": { "url": "postgres://x", "port": 5432, },',
		'\t"tags": ["a", "😀 b"],',
		'\t"none": null,',
		'}',
		'',
	].join('\n');

	it('parses the value', () => {
		const result = jsonc.parse(text);
		expect(result.problems).toEqual([]);
		expect(result.value).toEqual({
			name: 'héllo ✓',
			db: { url: 'postgres://x', port: 5_432 },
			tags: ['a', '😀 b'],
			none: null,
		});
	});

	it('maps every key and value in UTF-8 bytes', () => {
		const { positions } = jsonc.parse(text);
		expect(spanText(text, positions, ['name'])).toEqual({ key: '"name"', value: '"héllo ✓"' });
		expect(spanText(text, positions, ['db'])).toEqual({
			key: '"db"',
			value: '{ "url": "postgres://x", "port": 5432, }',
		});
		expect(spanText(text, positions, ['db', 'port'])).toEqual({ key: '"port"', value: '5432' });
		expect(spanText(text, positions, ['tags', 1])).toEqual({ key: '"😀 b"', value: '"😀 b"' });
		expect(spanText(text, positions, ['none'])).toEqual({ key: '"none"', value: 'null' });
	});

	it('reports parse errors with line and column', () => {
		const result = jsonc.parse('{\n  "a": 1\n  "b": 2\n}\n', 'bad.config.jsonc');
		expect(result.problems[0]).toMatchObject({
			file: 'bad.config.jsonc',
			code: 'parse-error',
			message: 'Comma expected',
			line: 3,
			column: 3,
		});
	});

	it('reports duplicate keys', () => {
		expect(jsonc.parse('{"a": 1,\n "a": 2}').problems[0]).toMatchObject({
			code: 'duplicate-key',
			line: 2,
			column: 2,
		});
	});

	it('reads an empty file as an empty object', () => {
		expect(jsonc.parse('// nothing\n')).toMatchObject({ value: {}, problems: [] });
	});

	it('reads whole-value placeholders as JSON scalars', () => {
		expect(jsonc.parseScalar('8080')).toBe(8_080);
		expect(jsonc.parseScalar('true')).toBe(true);
		expect(jsonc.parseScalar('null')).toBeNull();
		expect(jsonc.parseScalar('"quoted"')).toBe('"quoted"');
		expect(jsonc.parseScalar('localhost')).toBe('localhost');
	});
});

describe('json5', () => {
	const text = [
		'// comment',
		'{',
		"\tname: 'héllo ✓',",
		'\tdb: { url: "postgres://x", port: 0x10, },',
		"\ttags: ['a', '😀 b',],",
		'\tinf: +Infinity,',
		'}',
		'',
	].join('\n');

	it('parses the value', () => {
		const result = json5.parse(text);
		expect(result.problems).toEqual([]);
		expect(result.value).toEqual({
			name: 'héllo ✓',
			db: { url: 'postgres://x', port: 16 },
			tags: ['a', '😀 b'],
			inf: Infinity,
		});
	});

	it('maps every key and value in UTF-8 bytes', () => {
		const { positions } = json5.parse(text);
		expect(spanText(text, positions, ['name'])).toEqual({ key: 'name', value: "'héllo ✓'" });
		expect(spanText(text, positions, ['db'])).toEqual({ key: 'db', value: '{ url: "postgres://x", port: 0x10, }' });
		expect(spanText(text, positions, ['db', 'port'])).toEqual({ key: 'port', value: '0x10' });
		expect(spanText(text, positions, ['tags', 1])).toEqual({ key: "'😀 b'", value: "'😀 b'" });
		expect(spanText(text, positions, ['inf'])).toEqual({ key: 'inf', value: '+Infinity' });
	});

	it('reports parse errors with line and column', () => {
		const result = json5.parse('{\n  a: 1\n  b: 2\n}\n', 'bad.config.json5');
		expect(result.value).toBeUndefined();
		expect(result.problems).toEqual([
			expect.objectContaining({ file: 'bad.config.json5', code: 'parse-error', line: 3, column: 3 }),
		]);
	});

	it('reports duplicate keys', () => {
		expect(json5.parse('{a: 1,\n a: 2}').problems[0]).toMatchObject({ code: 'duplicate-key', line: 2, column: 2 });
	});

	it('reads an empty file as an empty object', () => {
		expect(json5.parse('// nothing\n')).toMatchObject({ value: {}, problems: [] });
	});

	it('reads whole-value placeholders as JSON5 scalars', () => {
		expect(json5.parseScalar('8080')).toBe(8_080);
		expect(json5.parseScalar('0x10')).toBe(16);
		expect(json5.parseScalar('true')).toBe(true);
		expect(json5.parseScalar("'quoted'")).toBe("'quoted'");
		expect(json5.parseScalar('localhost')).toBe('localhost');
	});
});

describe('parseConfigFileName', () => {
	it('claims only *.config.<ext>', () => {
		expect(parseConfigFileName('app.config.yaml')).toMatchObject({ stem: 'app', suffix: '.config.yaml' });
		expect(parseConfigFileName('app.production.config.yml')).toMatchObject({
			stem: 'app.production',
			suffix: '.config.yml',
		});
		expect(parseConfigFileName('app.config.toml')?.format.name).toBe('toml');
		expect(parseConfigFileName('app.config.jsonc')?.format.name).toBe('jsonc');
		expect(parseConfigFileName('app.config.json5')?.format.name).toBe('json5');
		expect(parseConfigFileName('app.yaml')).toBeUndefined();
		expect(parseConfigFileName('.config.yaml')).toBeUndefined();
		expect(parseConfigFileName('app.config.json')).toBeUndefined();
	});
});
