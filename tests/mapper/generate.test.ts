import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { json5, jsonc, toml, yaml } from '../../src/core/formats/index.ts';
import { SourceIndex } from '../../src/core/positions.ts';
import { configFileRole, generateTypes, SpanMapKind } from '../../src/mapper/generate.ts';
import { makeProject, sliceBytes } from '../helpers.ts';

import type { Format } from '../../src/core/formats/index.ts';
import type { GeneratedModule } from '../../src/mapper/generate.ts';

const tsc = join(import.meta.dirname, '../../node_modules/.bin/tsc');

const yamlBase = [
	'name: "héllo ✓"',
	'port: ${PORT:-3000}',
	'host: ${HOST}',
	'url: http://${HOST}:8080',
	'debug: false',
	'ratio: .inf',
	'nothing: null',
	'db:',
	'  url: postgres://x',
	'  pool: { min: 1, max: 5 }',
	'tags: [a, b]',
	'mixed: [1, x, true, null, { a: 1 }, { b: 2 }, { a: 3 }, [1]]',
	'plugins: []',
	'extra: {}',
	'',
].join('\n');

const yamlEnvironment = [
	'port: ${PORT}',
	'debug: "yes"',
	'unknown: 1',
	'db:',
	'  pool:',
	'    min: "1"',
	'    oops: 2',
	'  url: x',
	'tags: [1, x]',
	'',
].join('\n');

const tomlBase = ['name = "api"', 'port = 3000', 'tags = ["a", 1]', '', '[db]', 'url = "postgres://x"', ''].join('\n');
const tomlEnvironment = ['port = "3000"', '', '[db]', 'url = "y"', 'size = 1', ''].join('\n');
const jsoncBase = '{\n\t// comment\n\t"name": "api",\n\t"port": 3000,\n\t"db": { "url": "postgres://x" },\n}\n';
const jsoncEnvironment = '{\n\t"port": "3000",\n\t"db": { "host": "x" }\n}\n';
const json5Base = "{\n\tname: 'api',\n\tport: 3000,\n\t'my-key': true,\n\tdb: { url: 'postgres://x' },\n}\n";
const json5Environment = "{\n\tport: 0x10,\n\t'my-key': 'no',\n}\n";

const cases: readonly { format: Format; suffix: string; base: string; environment: string }[] = [
	{ format: yaml, suffix: '.config.yaml', base: yamlBase, environment: yamlEnvironment },
	{ format: toml, suffix: '.config.toml', base: tomlBase, environment: tomlEnvironment },
	{ format: jsonc, suffix: '.config.jsonc', base: jsoncBase, environment: jsoncEnvironment },
	{ format: json5, suffix: '.config.json5', base: json5Base, environment: json5Environment },
];

const virtualText = (module: GeneratedModule, start: number, length: number) => sliceBytes(module.text, start, length);

/**
 * Every original range a mapping may point at: the key and value span of each path.
 */
const spanTexts = (format: Format, text: string) => {
	const ranges = new Set<string>();
	for (const span of format.parse(text).positions.values()) {
		ranges.add(`${span.keyStart}:${span.keyLength}`);
		ranges.add(`${span.valueStart}:${span.valueLength}`);
	}
	return ranges;
};

const expectMappings = (format: Format, text: string, module: GeneratedModule) => {
	const ranges = spanTexts(format, text);
	let previousEnd = 0;
	for (const [virtualStart, virtualLength, start, length, kind] of module.mappings) {
		expect(ranges.has(`${start}:${length}`), `${start}:${length} is a key or value span`).toBe(true);
		expect(virtualStart).toBeGreaterThanOrEqual(previousEnd);
		previousEnd = virtualStart + virtualLength;
		const original = sliceBytes(text, start, length);
		const generated = virtualText(module, virtualStart, virtualLength);
		if (kind === SpanMapKind.Verbatim) expect(generated).toBe(original);
		else expect(generated).not.toBe(original);
	}
};

/**
 * The original text and kind of the mapping that covers each occurrence of `virtual` in the generated text.
 */
const mappedFrom = (text: string, module: GeneratedModule, virtual: string) =>
	module.mappings
		.filter(([start, length]) => virtualText(module, start, length) === virtual)
		.map(([, , start, length, kind]) => ({ original: sliceBytes(text, start, length), kind }));

describe('configFileRole', () => {
	it('reads the layer from the name', () => {
		expect(configFileRole('app.config.yaml')).toMatchObject({ kind: 'base', base: 'app.config.yaml' });
		expect(configFileRole('app.production.config.yml')).toMatchObject({
			kind: 'environment',
			base: 'app.config.yml',
			environment: 'production',
		});
		expect(configFileRole('app.local.config.toml')).toMatchObject({ kind: 'local', base: 'app.config.toml' });
		expect(configFileRole('app.test.local.config.json5')).toMatchObject({
			kind: 'environment-local',
			base: 'app.config.json5',
			environment: 'test',
		});
		expect(configFileRole('app.json')).toBeUndefined();
	});
});

describe.each(cases)('$format.name', ({ format, suffix, base, environment }) => {
	const baseModule = generateTypes(`/project/app${suffix}`, base);
	const environmentModule = generateTypes(`/project/app.production${suffix}`, environment);

	it('generates the base module', () => {
		expect(baseModule.diagnostics).toEqual([]);
		expect(baseModule.extension).toBe('.ts');
		expect(baseModule.text).toMatchSnapshot();
	});

	it('generates the environment module', () => {
		expect(environmentModule.diagnostics).toEqual([]);
		expect(environmentModule.text).toContain(`import type Base from "./app${suffix}";`);
		expect(environmentModule.text).toMatchSnapshot();
	});

	it('maps keys and values to their spans', () => {
		expectMappings(format, base, baseModule);
		expectMappings(format, environment, environmentModule);
		const port = format === jsonc ? '"port"' : 'port';
		expect(mappedFrom(base, baseModule, port)).toEqual([{ original: port, kind: SpanMapKind.Verbatim }]);
		expect(mappedFrom(environment, environmentModule, port)).toEqual([
			{ original: port, kind: SpanMapKind.Verbatim },
		]);
	});

	it('generates local files against the base file', () => {
		const local = generateTypes(`/project/app.local${suffix}`, environment);
		const environmentLocal = generateTypes(`/project/app.production.local${suffix}`, environment);
		expect(local.text).toBe(environmentModule.text);
		expect(environmentLocal.text).toBe(environmentModule.text);
	});
});

describe('yaml details', () => {
	const baseModule = generateTypes('/project/app.config.yaml', yamlBase);
	const environmentModule = generateTypes('/project/app.production.config.yaml', yamlEnvironment);

	it('types placeholders by their default', () => {
		expect(baseModule.text).toContain('readonly port: number;');
		expect(baseModule.text).toContain('readonly host: string;');
		expect(baseModule.text).toContain('readonly url: string;');
		expect(mappedFrom(yamlBase, baseModule, 'number')).toContainEqual({
			original: '${PORT:-3000}',
			kind: SpanMapKind.Alias,
		});
	});

	it('maps placeholders in environment files as Alias', () => {
		expect(mappedFrom(yamlEnvironment, environmentModule, '(undefined as never)')).toEqual([
			{ original: '${PORT}', kind: SpanMapKind.Alias },
		]);
	});

	it('unions the element types of mixed arrays', () => {
		expect(baseModule.text).toContain('readonly tags: readonly string[];');
		expect(baseModule.text).toContain('readonly plugins: readonly unknown[];');
		expect(baseModule.text).toMatch(
			/readonly mixed: readonly \(number \| string \| boolean \| null \| \{\n\t{2}readonly a: number;\n\t\} \| \{\n\t{2}readonly b: number;\n\t\} \| readonly number\[\]\)\[\];/u,
		);
	});

	it('maps UTF-8 offsets', () => {
		const text = 'ünï: "✓"\nafter: 1\n';
		const module = generateTypes('/project/app.production.config.yaml', text);
		expect(module.text).toContain('({ "ünï": "✓" })');
		expect(mappedFrom(text, module, '"ünï"')).toEqual([{ original: 'ünï', kind: SpanMapKind.Alias }]);
		expect(mappedFrom(text, module, '"✓"')).toEqual([{ original: '"✓"', kind: SpanMapKind.Verbatim }]);
		expect(mappedFrom(text, module, 'after')).toEqual([{ original: 'after', kind: SpanMapKind.Verbatim }]);
		expectMappings(yaml, text, module);
	});

	it('reuses the original spelling of quoted keys and strings', () => {
		const text = '{ \'my-key\': \'no\', "port": "x" }';
		const module = generateTypes('/project/app.production.config.json5', text);
		expect(module.text).toContain("({ 'my-key': 'no' })");
		expect(module.text).toContain('({ "port": "x" })');
		expect(module.mappings.every(([, , , , kind]) => kind === SpanMapKind.Verbatim)).toBe(true);
	});

	it('quotes keys that are not identifiers', () => {
		const module = generateTypes('/project/app.config.yaml', 'my-key: 1\n"quoted": 2\n');
		expect(module.text).toContain('readonly "my-key": number;');
		expect(mappedFrom('my-key: 1\n"quoted": 2\n', module, '"my-key"')).toEqual([
			{ original: 'my-key', kind: SpanMapKind.Alias },
		]);
		expect(mappedFrom('my-key: 1\n"quoted": 2\n', module, '"quoted"')).toEqual([
			{ original: '"quoted"', kind: SpanMapKind.Verbatim },
		]);
	});

	it('checks a root that is not an object as a whole', () => {
		const text = '- 1\n- 2\n';
		const module = generateTypes('/project/app.production.config.yaml', text);
		expect(module.text).toContain('([1, 2]) satisfies Override<Config>;');
		expect(mappedFrom(text, module, 'satisfies')).toEqual([{ original: '- 1\n- 2', kind: SpanMapKind.Atom }]);
	});

	it('leaves helpers out of an empty environment file', () => {
		const module = generateTypes('/project/app.production.config.yaml', '');
		expect(module.text).toBe(
			'import type Base from "./app.config.yaml";\n\ntype Config = typeof Base;\n\ndeclare const config: Config;\nexport default config;\n',
		);
	});

	it('imports the base file given in the options', () => {
		const module = generateTypes('/project/app.local.config.yaml', 'port: 1\n', {
			base: '/project/config/app.config.yaml',
		});
		expect(module.text).toContain('import type Base from "./config/app.config.yaml";');
		const base = generateTypes('/project/my.app.config.yaml', 'port: 1\n', { base: '/project/my.app.config.yaml' });
		expect(base.text).toContain('declare const config: {\n\treadonly port: number;\n};');
	});
});

describe('problems', () => {
	it('reports a parse failure and types the module as any', () => {
		const text = '{\n\t"port": 1,,\n}';
		const module = generateTypes('/project/app.config.jsonc', text);
		expect(module.text).toBe('declare const config: any;\nexport default config;\n');
		expect(module.mappings).toEqual([]);
		expect(module.diagnostics.length).toBeGreaterThan(0);
		expect(module.diagnostics[0]).toMatchObject({ code: 1_001, messageText: 'Property name expected' });
		expect(sliceBytes(text, module.diagnostics[0]!.start, module.diagnostics[0]!.length)).toBe(',');
	});

	it('reports a parse failure in toml', () => {
		const module = generateTypes('/project/app.production.config.toml', 'port = \n');
		expect(module.text).toBe('declare const config: any;\nexport default config;\n');
		expect(module.diagnostics).toMatchObject([{ code: 1_001 }]);
	});

	it('keeps the types of a file with recoverable problems', () => {
		const text = 'port: 1\nport: 2\n';
		const module = generateTypes('/project/app.config.yaml', text);
		expect(module.text).toContain('readonly port: number;');
		expect(module.diagnostics).toMatchObject([{ code: 1_002 }]);
	});

	it('reports invalid placeholders but not missing variables', () => {
		const text = 'a: ${1BAD}\nb: ${REQUIRED:?set it}\n';
		const module = generateTypes('/project/app.config.yaml', text);
		expect(module.diagnostics).toHaveLength(1);
		expect(module.diagnostics[0]).toMatchObject({ code: 1_007 });
		expect(sliceBytes(text, module.diagnostics[0]!.start, module.diagnostics[0]!.length)).toBe('${1BAD}');
	});

	it('reports a file tyfigo does not claim', () => {
		const module = generateTypes('/project/app.json', '{}');
		expect(module.text).toBe('declare const config: any;\nexport default config;\n');
		expect(module.diagnostics).toMatchObject([{ code: 1_005 }]);
	});
});

/**
 * Runs tsc over the generated modules and maps each error back to the text of the config file it lands on.
 */
const typeCheck = async (files: Record<string, { text: string; module: GeneratedModule }>) => {
	const project = await makeProject({
		'tsconfig.json': JSON.stringify({
			compilerOptions: {
				strict: true,
				noEmit: true,
				module: 'preserve',
				moduleResolution: 'bundler',
				allowArbitraryExtensions: true,
				noUnusedLocals: true,
				exactOptionalPropertyTypes: true,
				types: [],
			},
		}),
		...Object.fromEntries(Object.entries(files).map(([name, { module }]) => [name, module.text])),
	});
	const result = spawnSync(tsc, ['-p', project, '--pretty', 'false'], { encoding: 'utf8' });
	return result.stdout
		.split('\n')
		.filter((line) => line.includes('error TS'))
		.map((line) => {
			const [, name = '', row = '', column = '', message = ''] = /^(.+?)\((\d+),(\d+)\): (.*)$/u.exec(line) ?? [];
			const entry = Object.entries(files).find(([file]) => name.endsWith(file));
			if (!entry) return { file: name, message };
			const [file, { text, module }] = entry;
			const generated = readFileSync(join(project, file), 'utf8');
			const lineStart =
				generated
					.split('\n')
					.slice(0, Number(row) - 1)
					.join('\n').length + (Number(row) > 1 ? 1 : 0);
			const offset = new SourceIndex(generated).byteOffset(lineStart + Number(column) - 1);
			const mapping = module.mappings.find(([start, length]) => offset >= start && offset < start + length);
			return {
				file,
				at: mapping ? sliceBytes(text, mapping[2], mapping[3]) : undefined,
				line: mapping ? new SourceIndex(text).lineColumn(mapping[2]).line : undefined,
				message: message.replace(/^error /u, ''),
			};
		});
};

describe('type checking', () => {
	it('accepts a valid environment file', async () => {
		const environment = 'port: ${PORT}\ndb:\n  url: y\ntags: [c]\nmixed: [{ b: 1 }, x]\nextra: {}\n';
		const errors = await typeCheck({
			'app.config.d.yaml.ts': { text: yamlBase, module: generateTypes('/p/app.config.yaml', yamlBase) },
			'app.production.ts': {
				text: environment,
				module: generateTypes('/p/app.production.config.yaml', environment),
			},
			'use.ts': {
				text: '',
				module: {
					text: "import config from './app.production';\nconst port: number = config.port;\nexport { port };\n",
					extension: '.ts',
					mappings: [],
					diagnostics: [],
				},
			},
		});
		expect(errors).toEqual([]);
	});

	it.each(cases)('maps errors in $format.name environment files to their keys and values', async (item) => {
		const errors = await typeCheck({
			[`app.config.d.${item.suffix.slice('.config.'.length)}.ts`]: {
				text: item.base,
				module: generateTypes(`/p/app${item.suffix}`, item.base),
			},
			'app.production.ts': {
				text: item.environment,
				module: generateTypes(`/p/app.production${item.suffix}`, item.environment),
			},
		});
		expect(errors).toMatchSnapshot();
	});

	it('maps a root of the wrong type', async () => {
		const environment = '- 1\n';
		const errors = await typeCheck({
			'app.config.d.yaml.ts': { text: yamlBase, module: generateTypes('/p/app.config.yaml', yamlBase) },
			'app.production.ts': {
				text: environment,
				module: generateTypes('/p/app.production.config.yaml', environment),
			},
		});
		expect(errors).toEqual([
			{ file: 'app.production.ts', at: '- 1', line: 1, message: expect.stringMatching(/^TS2559: /u) },
		]);
	});
});
