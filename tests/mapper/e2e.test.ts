import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configSuffixes } from '../../src/core/formats/index.ts';
import { makeProject } from '../helpers.ts';

const root = join(import.meta.dirname, '../..');
const fixtures = join(import.meta.dirname, '../fixtures/mapper');
const tsc = join(root, 'node_modules/typescript/bin/tsc');
const extensions = configSuffixes;

let tyfigo = '';

beforeAll(async () => {
	tyfigo = await mkdtemp(join(tmpdir(), 'tyfigo-package-'));
	const build = spawnSync(
		join(root, 'node_modules/.bin/tsdown'),
		['--out-dir', join(tyfigo, 'dist'), '--log-level', 'error'],
		{ cwd: root, encoding: 'utf8' },
	);
	expect(build.status, build.stderr).toBe(0);
	await copyFile(join(root, 'package.json'), join(tyfigo, 'package.json'));
	await symlink(join(root, 'node_modules'), join(tyfigo, 'node_modules'), 'dir');
}, 120_000);

afterAll(async () => {
	if (tyfigo) await rm(tyfigo, { recursive: true, force: true });
});

interface ProjectOptions {
	readonly files?: Record<string, string>;
	readonly mappers?: readonly { package: string; extensions: readonly string[] }[];
	readonly packages?: Record<string, string>;
}

/**
 * Type checks a project with the fixture config files (overridden by `files`) and the built tyfigo package, and returns tsc's
 * exit code and output lines.
 */
const typeCheck = async ({ files = {}, mappers, packages = {} }: ProjectOptions) => {
	const project = await makeProject({
		'tsconfig.json': JSON.stringify({
			compilerOptions: {
				strict: true,
				noEmit: true,
				module: 'preserve',
				moduleResolution: 'bundler',
				skipLibCheck: true,
				types: [],
			},
			contentMappers: mappers ?? [{ package: 'tyfigo', extensions }],
			include: ['*.ts'],
		}),
		'app.config.yaml': await readFile(join(fixtures, 'app.config.yaml'), 'utf8'),
		'app.production.config.yaml': await readFile(join(fixtures, 'app.production.config.yaml'), 'utf8'),
		...files,
	});
	await mkdir(join(project, 'node_modules'));
	for (const [name, target] of Object.entries({ tyfigo, ...packages })) {
		await symlink(target, join(project, 'node_modules', name), 'dir');
	}
	const result = spawnSync(tsc, ['-p', '.', '--runExternalCode', '--pretty', 'false'], {
		cwd: project,
		encoding: 'utf8',
	});
	return { status: result.status, output: result.stdout.split('\n').filter((line) => line.trim() !== '') };
};

const usesProduction =
	"import production from './app.production.config.yaml';\nconst max: number = production.db.pool.max;\nexport { max };\n";

describe('content mapper', () => {
	it('types the base file and environment files', async () => {
		const result = await typeCheck({
			files: {
				'index.ts': [
					"import config from './app.config.yaml';",
					"import production from './app.production.config.yaml';",
					'const n: number = config.port;',
					'const max: number = production.db.pool.max;',
					'const tags: readonly string[] = config.tags;',
					'// @ts-expect-error the port is a number',
					'const wrong: string = config.port;',
					'export { n, max, tags, wrong };',
					'',
				].join('\n'),
			},
		});
		expect(result).toEqual({ status: 0, output: [] });
	});

	it('reports a wrong value at its line in the environment file', async () => {
		const result = await typeCheck({
			files: {
				'app.production.config.yaml': 'port: ${PORT}\ndb:\n  pool:\n    max: twenty\n',
				'index.ts': usesProduction,
			},
		});
		expect(result).toEqual({
			status: 2,
			output: [
				"app.production.config.yaml(4,5): error TS2322: Type 'string' is not assignable to type 'number'.",
			],
		});
	});

	it('reports an extra key at its line', async () => {
		const result = await typeCheck({
			files: {
				'app.production.config.yaml': 'port: 8080\ndb:\n  pool:\n    max: 20\n    idle: 5\ncache: true\n',
				'index.ts': usesProduction,
			},
		});
		expect(result.status).toBe(2);
		expect(result.output).toEqual([
			expect.stringMatching(
				/^app\.production\.config\.yaml\(5,5\): error TS2353: Object literal may only specify known properties, and 'idle' does not exist in type '\{ readonly min\?: number \| undefined; readonly max\?: number \| undefined; \}'\.$/u,
			),
			expect.stringMatching(
				/^app\.production\.config\.yaml\(6,1\): error TS2353: Object literal may only specify known properties, and 'cache' does not exist in type /u,
			),
		]);
	});

	it('reports a syntax error from tyfigo at its line', async () => {
		const result = await typeCheck({
			files: {
				'app.production.config.yaml': 'port: 8080\ndb: { url: x\n',
				'index.ts': usesProduction,
			},
		});
		expect(result).toEqual({
			status: 2,
			output: [expect.stringMatching(/^app\.production\.config\.yaml\(3,1\): error tyfigo1001: /u)],
		});
	});

	it('leaves other suffixes to another mapper', async () => {
		const result = await typeCheck({
			files: {
				'data.yaml': 'anything: [',
				'index.ts': [
					"import config from './app.config.yaml';",
					"import data from './data.yaml';",
					'const n: number = config.port;',
					'const other: true = data.other;',
					'export { n, other };',
					'',
				].join('\n'),
			},
			mappers: [
				{ package: 'other-mapper', extensions: ['.yaml'] },
				{ package: 'tyfigo', extensions },
			],
			packages: { 'other-mapper': join(fixtures, 'other-mapper') },
		});
		expect(result).toEqual({ status: 0, output: [] });
	});

	it('names the suffixes it handles for a file it does not claim', async () => {
		const result = await typeCheck({
			files: { 'data.yaml': 'a: 1\n', 'index.ts': "import data from './data.yaml';\nexport { data };\n" },
			mappers: [{ package: 'tyfigo', extensions: ['.yaml'] }],
		});
		expect(result).toEqual({
			status: 2,
			output: [
				`data.yaml(1,1): error tyfigo1005: data.yaml is not a config file. tyfigo handles files ending in ${configSuffixes.join(', ')}`,
			],
		});
	});

	it('types INI, .properties and XML files and reports their errors at their lines', async () => {
		const result = await typeCheck({
			files: {
				'server.config.ini': 'port = 3000\n\n[db]\nhosts[] = a\nhosts[] = b\n',
				'server.production.config.ini': '[db]\nhosts[] = 1\n',
				'jvm.config.properties': 'heap.max = 512\nheap.gc = g1\n',
				'jvm.production.config.properties': 'heap.max = big\n',
				'site.config.xml': '<site lang="en">\n\t<debug>false</debug>\n</site>\n',
				'site.production.config.xml': '<site lang="de">\n\t<debug>no</debug>\n</site>\n',
				'index.ts': [
					"import server from './server.config.ini';",
					"import serverProduction from './server.production.config.ini';",
					"import jvm from './jvm.config.properties';",
					"import jvmProduction from './jvm.production.config.properties';",
					"import site from './site.config.xml';",
					"import siteProduction from './site.production.config.xml';",
					'const port: number = server.port;',
					'const hosts: readonly string[] = server.db.hosts;',
					'const max: number = jvm.heap.max;',
					"const lang: string = site.site['@lang'];",
					'const debug: boolean = site.site.debug;',
					'export { port, hosts, max, lang, debug, serverProduction, jvmProduction, siteProduction };',
					'',
				].join('\n'),
			},
		});
		expect(result).toEqual({
			status: 2,
			output: [
				"jvm.production.config.properties(1,6): error TS2322: Type 'string' is not assignable to type 'number'.",
				"server.production.config.ini(2,11): error TS2322: Type 'number' is not assignable to type 'string'.",
				"site.production.config.xml(2,3): error TS2322: Type 'string' is not assignable to type 'boolean | undefined'.",
			],
		});
	});

	it('reports a missing base file in the environment file', async () => {
		const result = await typeCheck({
			files: {
				'app.staging.config.toml': 'port = 1\n',
				'index.ts': "import staging from './app.staging.config.toml';\nexport { staging };\n",
			},
		});
		expect(result).toEqual({
			status: 2,
			output: [
				"app.staging.config.toml(1,1): error TS2307: Cannot find module './app.config.toml' or its corresponding type declarations.",
			],
		});
	});

	it('shows the original text of Alias keys and maps a root of the wrong type through satisfies', async () => {
		const result = await typeCheck({
			files: {
				'app.staging.config.yaml': 'my-key: 1\n"q-key": 2\n',
				'app.test.config.yaml': '- 1\n- 2\n',
				'index.ts':
					"import staging from './app.staging.config.yaml';\nimport test from './app.test.config.yaml';\nexport { staging, test };\n",
			},
		});
		expect(result.status).toBe(2);
		expect(result.output).toEqual([
			expect.stringMatching(
				/^app\.staging\.config\.yaml\(1,1\): error TS2353: .* and 'my-key' does not exist in type /u,
			),
			expect.stringMatching(
				/^app\.staging\.config\.yaml\(2,1\): error TS2353: .* and '"q-key"' does not exist in type /u,
			),
			expect.stringMatching(
				/^app\.test\.config\.yaml\(1,1\): error TS2559: Type 'number\[\]' has no properties in common /u,
			),
		]);
	});

	it('reports a loadConfig schema mismatch at the call site', async () => {
		const result = await typeCheck({
			files: {
				'index.ts': [
					"import { loadConfig } from 'tyfigo';",
					"import { z } from 'zod';",
					"import config from './app.config.yaml';",
					'const schema = z.object({ port: z.string() });',
					'export const loaded = loadConfig(config, schema);',
					'',
				].join('\n'),
			},
			packages: { zod: join(root, 'node_modules/zod') },
		});
		expect(result.status).toBe(2);
		expect(result.output[0]).toMatch(/^index\.ts\(5,34\): error TS2345: Argument of type /u);
		expect(result.output.slice(1)).toEqual([
			"  Types of property 'port' are incompatible.",
			"    Type 'number' is not assignable to type 'string'.",
		]);
	});
});
