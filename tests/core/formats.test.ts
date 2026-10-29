import { describe, expect, it } from 'vitest';

import {
	configPathPattern,
	ini,
	json5,
	jsonc,
	parseConfigPath,
	properties,
	toml,
	xml,
	yaml,
} from '../../src/core/formats/index.ts';
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

describe('ini', () => {
	const text = [
		'; comment',
		'name = héllo ✓',
		'port = 3000',
		'',
		'[db]',
		'url = "postgres://x" ; inline',
		"quoted = '3000'",
		'version = 1.50',
		'empty =',
		'link = http://x/#frag',
		'',
		'[server.http]',
		'hosts[] = a',
		'hosts[] = 😀 b',
		'debug = false',
		'',
	].join('\n');

	it('parses the value', () => {
		const result = ini.parse(text);
		expect(result.problems).toEqual([]);
		expect(result.value).toEqual({
			name: 'héllo ✓',
			port: 3_000,
			db: { url: 'postgres://x', quoted: '3000', version: '1.50', empty: '', link: 'http://x/#frag' },
			server: { http: { hosts: ['a', '😀 b'], debug: false } },
		});
	});

	it('maps every key and value in UTF-8 bytes', () => {
		const { positions } = ini.parse(text);
		expect(spanText(text, positions, ['name'])).toEqual({ key: 'name', value: 'héllo ✓' });
		expect(spanText(text, positions, ['port'])).toEqual({ key: 'port', value: '3000' });
		expect(spanText(text, positions, ['db'])).toEqual({
			key: 'db',
			value: [
				'[db]',
				'url = "postgres://x" ; inline',
				"quoted = '3000'",
				'version = 1.50',
				'empty =',
				'link = http://x/#frag',
			].join('\n'),
		});
		expect(spanText(text, positions, ['db', 'url'])).toEqual({ key: 'url', value: '"postgres://x"' });
		expect(spanText(text, positions, ['db', 'quoted'])).toEqual({ key: 'quoted', value: "'3000'" });
		expect(spanText(text, positions, ['db', 'empty'])).toEqual({ key: 'empty', value: '' });
		expect(spanText(text, positions, ['server']).key).toBe('server');
		expect(spanText(text, positions, ['server', 'http'])).toEqual({
			key: 'http',
			value: '[server.http]\nhosts[] = a\nhosts[] = 😀 b\ndebug = false',
		});
		expect(spanText(text, positions, ['server', 'http', 'hosts'])).toEqual({
			key: 'hosts',
			value: 'a\nhosts[] = 😀 b',
		});
		expect(spanText(text, positions, ['server', 'http', 'hosts', 1])).toEqual({ key: '😀 b', value: '😀 b' });
		expect(spanText(text, positions, ['server', 'http', 'debug'])).toEqual({ key: 'debug', value: 'false' });
		expect(positions.has('[]')).toBe(true);
	});

	it('reports parse errors with line and column', () => {
		const result = ini.parse('a = 1\n[db\nb = 2\n', 'bad.config.ini');
		expect(result.value).toBeUndefined();
		expect(result.problems).toEqual([
			expect.objectContaining({ file: 'bad.config.ini', code: 'parse-error', line: 2, column: 1 }),
		]);
		expect(ini.parse('a = 1\njust a line\n').problems[0]).toMatchObject({ code: 'parse-error', line: 2 });
		expect(ini.parse('a = "x\n').problems[0]).toMatchObject({ message: 'Unterminated string', line: 1, column: 5 });
		expect(ini.parse('[a..b]\n').problems[0]).toMatchObject({ code: 'parse-error', line: 1 });
	});

	it('reports duplicate keys and a section that clashes with a value', () => {
		expect(ini.parse('a = 1\na = 2\n')).toMatchObject({
			value: { a: 2 },
			problems: [{ code: 'duplicate-key', line: 2, column: 1 }],
		});
		expect(ini.parse('db = 1\n[db]\nx = 1\n').problems[0]).toMatchObject({
			code: 'duplicate-key',
			line: 2,
			column: 2,
		});
	});

	it('merges a repeated section', () => {
		expect(ini.parse('[a]\nx = 1\n[b]\n[a]\ny = 2\n').value).toEqual({ a: { x: 1, y: 2 }, b: {} });
	});

	it('reads an empty file as an empty object', () => {
		expect(ini.parse('; nothing\n')).toMatchObject({ value: {}, problems: [] });
	});

	it('reads whole-value placeholders with the INI scalar rule', () => {
		expect(ini.parseScalar('8080')).toBe(8_080);
		expect(ini.parseScalar('-1.5')).toBe(-1.5);
		expect(ini.parseScalar('true')).toBe(true);
		expect(ini.parseScalar('08080')).toBe('08080');
		expect(ini.parseScalar('1e3')).toBe('1e3');
		expect(ini.parseScalar('9007199254740993')).toBe('9007199254740993');
		expect(ini.parseScalar('NaN')).toBe('NaN');
		expect(ini.parseScalar('TRUE')).toBe('TRUE');
		expect(ini.parseScalar('')).toBe('');
	});
});

describe('properties', () => {
	const text = [
		'# comment',
		'! also a comment',
		'name = héllo ✓',
		'port=3000',
		'db.url: postgres://x',
		'db.pool 5',
		'message = hello \\',
		'    world',
		'unicode = \\u00e9\\t😀',
		'dotted\\.key = 1.50',
		'empty =',
		'',
	].join('\n');

	it('parses the value', () => {
		const result = properties.parse(text);
		expect(result.problems).toEqual([]);
		expect(result.value).toEqual({
			name: 'héllo ✓',
			port: 3_000,
			db: { url: 'postgres://x', pool: 5 },
			message: 'hello world',
			unicode: 'é\t😀',
			'dotted.key': '1.50',
			empty: '',
		});
	});

	it('maps every key and value in UTF-8 bytes', () => {
		const { positions } = properties.parse(text);
		expect(spanText(text, positions, ['name'])).toEqual({ key: 'name', value: 'héllo ✓' });
		expect(spanText(text, positions, ['port'])).toEqual({ key: 'port', value: '3000' });
		expect(spanText(text, positions, ['db'])).toEqual({ key: 'db', value: 'db.url: postgres://x' });
		expect(spanText(text, positions, ['db', 'url'])).toEqual({ key: 'url', value: 'postgres://x' });
		expect(spanText(text, positions, ['db', 'pool'])).toEqual({ key: 'pool', value: '5' });
		expect(spanText(text, positions, ['message'])).toEqual({ key: 'message', value: 'hello \\\n    world' });
		expect(spanText(text, positions, ['unicode'])).toEqual({ key: 'unicode', value: '\\u00e9\\t😀' });
		expect(spanText(text, positions, ['dotted.key'])).toEqual({ key: 'dotted\\.key', value: '1.50' });
		expect(spanText(text, positions, ['empty']).key).toBe('empty');
		expect(positions.has('[]')).toBe(true);
	});

	it('reports parse errors with line and column', () => {
		const result = properties.parse('a = 1\nb = \\u12x4\n', 'bad.config.properties');
		expect(result.value).toBeUndefined();
		expect(result.problems).toEqual([
			expect.objectContaining({ file: 'bad.config.properties', code: 'parse-error', line: 2, column: 5 }),
		]);
	});

	it('reports duplicate keys and a key that is both a value and a group', () => {
		expect(properties.parse('a = 1\na = 2\n')).toMatchObject({
			value: { a: 2 },
			problems: [{ code: 'duplicate-key', line: 2, column: 1 }],
		});
		expect(properties.parse('a = 1\na.b = 2\n')).toMatchObject({
			value: { a: 1 },
			problems: [{ code: 'duplicate-key', message: "'a' is already a value", line: 2, column: 1 }],
		});
	});

	it('keeps keys with empty parts flat', () => {
		expect(properties.parse('a..b = 1\n.c = 2\n').value).toEqual({ 'a..b': 1, '.c': 2 });
	});

	it('reads an empty file as an empty object', () => {
		expect(properties.parse('# nothing\n')).toMatchObject({ value: {}, problems: [] });
	});

	it('reads whole-value placeholders with the same scalar rule', () => {
		expect(properties.parseScalar('8080')).toBe(8_080);
		expect(properties.parseScalar('false')).toBe(false);
		expect(properties.parseScalar('localhost')).toBe('localhost');
	});
});

describe('xml', () => {
	const text = [
		'<?xml version="1.0"?>',
		'<!-- comment -->',
		'<config env="prod" debug="true">',
		'  <name>héllo ✓</name>',
		'  <port>3000</port>',
		'  <version>1.50</version>',
		'  <empty/>',
		'  <db url="postgres://x" pool="5"/>',
		'  <tags><tag>a</tag><tag>😀 b</tag></tags>',
		'  <server host="a">text &amp; more</server>',
		'  <raw><![CDATA[<x>]]></raw>',
		'</config>',
		'',
	].join('\n');

	it('parses the value', () => {
		const result = xml.parse(text);
		expect(result.problems).toEqual([]);
		expect(result.value).toEqual({
			config: {
				'@env': 'prod',
				'@debug': true,
				name: 'héllo ✓',
				port: 3_000,
				version: '1.50',
				empty: '',
				db: { '@url': 'postgres://x', '@pool': 5 },
				tags: { tag: ['a', '😀 b'] },
				server: { '@host': 'a', '#text': 'text & more' },
				raw: '<x>',
			},
		});
	});

	it('maps every key and value in UTF-8 bytes', () => {
		const { positions } = xml.parse(text);
		expect(spanText(text, positions, ['config']).key).toBe('config');
		expect(spanText(text, positions, ['config']).value).toMatch(/^<config env="prod"[\s\S]*<\/config>$/u);
		expect(spanText(text, positions, ['config', '@env'])).toEqual({ key: 'env', value: '"prod"' });
		expect(spanText(text, positions, ['config', 'name'])).toEqual({ key: 'name', value: 'héllo ✓' });
		expect(spanText(text, positions, ['config', 'port'])).toEqual({ key: 'port', value: '3000' });
		expect(spanText(text, positions, ['config', 'empty'])).toEqual({ key: 'empty', value: '<empty/>' });
		expect(spanText(text, positions, ['config', 'db', '@pool'])).toEqual({ key: 'pool', value: '"5"' });
		expect(spanText(text, positions, ['config', 'tags', 'tag'])).toEqual({
			key: 'tag',
			value: '<tag>a</tag><tag>😀 b</tag>',
		});
		expect(spanText(text, positions, ['config', 'tags', 'tag', 1])).toEqual({ key: 'tag', value: '😀 b' });
		expect(spanText(text, positions, ['config', 'server', '#text'])).toEqual({
			key: 'text &amp; more',
			value: 'text &amp; more',
		});
		expect(spanText(text, positions, ['config', 'raw'])).toEqual({ key: 'raw', value: '<![CDATA[<x>]]>' });
		expect(positions.has('[]')).toBe(true);
	});

	it('reports parse errors with line and column', () => {
		const result = xml.parse('<a>\n  <b>1</c>\n</a>\n', 'bad.config.xml');
		expect(result.value).toBeUndefined();
		expect(result.problems).toEqual([
			expect.objectContaining({ file: 'bad.config.xml', code: 'parse-error', line: 2, column: 7 }),
		]);
		expect(result.problems[0]?.message).not.toContain('\n');
	});

	it('reports a duplicate attribute', () => {
		expect(xml.parse('<a x="1" x="2"/>').problems[0]).toMatchObject({ code: 'parse-error', line: 1, column: 15 });
	});

	it('reads an empty file as an empty object', () => {
		expect(xml.parse('<?xml version="1.0"?>\n<!-- nothing -->\n')).toMatchObject({ value: {}, problems: [] });
	});

	it('reads whole-value placeholders with the same scalar rule', () => {
		expect(xml.parseScalar('8080')).toBe(8_080);
		expect(xml.parseScalar('true')).toBe(true);
		expect(xml.parseScalar('<x/>')).toBe('<x/>');
	});
});

describe('parseConfigPath', () => {
	it('claims only *.config.<ext>', () => {
		expect(parseConfigPath('app.config.yaml')).toMatchObject({ stem: 'app', suffix: '.config.yaml' });
		expect(parseConfigPath('app.production.config.yml')).toMatchObject({
			stem: 'app.production',
			suffix: '.config.yml',
		});
		expect(parseConfigPath('app.config.toml')?.format.name).toBe('toml');
		expect(parseConfigPath('app.config.jsonc')?.format.name).toBe('jsonc');
		expect(parseConfigPath('app.config.json5')?.format.name).toBe('json5');
		expect(parseConfigPath('app.config.ini')?.format.name).toBe('ini');
		expect(parseConfigPath('app.config.properties')?.format.name).toBe('properties');
		expect(parseConfigPath('app.config.xml')?.format.name).toBe('xml');
		expect(parseConfigPath('app.xml')).toBeUndefined();
		expect(parseConfigPath('app.yaml')).toBeUndefined();
		expect(parseConfigPath('.config.yaml')).toBeUndefined();
		expect(parseConfigPath('app.config.json')).toBeUndefined();
	});

	it('claims files of a format extension in a .config directory', () => {
		expect(parseConfigPath('/project/.config/app.yaml')).toMatchObject({ stem: 'app', suffix: '.yaml' });
		expect(parseConfigPath('/project/.config/app.production.local.yml')).toMatchObject({
			stem: 'app.production.local',
			suffix: '.yml',
		});
		expect(parseConfigPath('/project/.config/app.config.toml')).toMatchObject({
			stem: 'app',
			suffix: '.config.toml',
		});
		for (const extension of ['toml', 'jsonc', 'json5', 'ini', 'properties', 'xml']) {
			expect(parseConfigPath(`/project/.config/app.${extension}`)?.format.name).toBe(extension);
		}
		expect(parseConfigPath('/project/data.yaml')).toBeUndefined();
		expect(parseConfigPath('/project/.config/app.json')).toBeUndefined();
		expect(parseConfigPath('/project/.config/.yaml')).toBeUndefined();
		expect(parseConfigPath('/project/.config/nested/app.yaml')).toBeUndefined();
		expect(parseConfigPath('/project/my.config/app.yaml')).toBeUndefined();
	});
});

describe('configPathPattern', () => {
	it('matches the paths parseConfigPath claims with either separator', () => {
		const paths = [
			'/project/app.config.yaml',
			'/project/.config/app.yaml',
			'/project/.config/app.production.toml',
			'C:\\project\\.config\\app.yaml',
			'C:\\project\\app.config.ini',
			'/project/data.yaml',
			'/project/.config.yaml',
			'/project/.config/.yaml',
			'/project/.config/app.json',
			'/project/.config/nested/app.yaml',
			'/project/my.config/app.yaml',
		];
		expect(paths.filter((path) => configPathPattern.test(path))).toEqual(paths.slice(0, 5));
		for (const path of paths.filter((item) => item.startsWith('/'))) {
			expect(configPathPattern.test(path)).toBe(parseConfigPath(path) !== undefined);
		}
	});
});
