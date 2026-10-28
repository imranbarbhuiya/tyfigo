import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { rspack } from '@rspack/core';
import { build as esbuild } from 'esbuild';
import { build as vite } from 'vite';
import { describe, expect, it } from 'vitest';
import webpack from 'webpack';

import { fixtureFiles, linkPackage, usePackage } from './helpers.ts';

import tyfigoEsbuild from '../../src/plugins/esbuild.ts';
import tyfigoRspack from '../../src/plugins/rspack.ts';
import { findNodeOnlyImports } from '../../src/plugins/shared.ts';
import tyfigoVite from '../../src/plugins/vite.ts';
import tyfigoWebpack from '../../src/plugins/webpack.ts';
import { makeProject } from '../helpers.ts';

const pkg = usePackage();

type Entry = 'config' | 'env' | 'effect-env' | 'namespace';

const files: Record<string, string> = {
	...fixtureFiles,
	'config.js': [
		"import config from './client.config.yaml';",
		"import { loadConfig } from 'tyfigo';",
		"import { configProvider } from 'tyfigo/effect';",
		'',
		"const schema = { '~standard': { version: 1, vendor: 'test', validate: (value) => ({ value }) } };",
		'console.log(JSON.stringify({ config: loadConfig(config, schema), provider: typeof configProvider(config) }));',
		'',
	].join('\n'),
	'env.js':
		"import config from './client.config.yaml';\nimport { loadConfig, loadEnv } from 'tyfigo';\n\nconsole.log(config, loadConfig, loadEnv);\n",
	'effect-env.js': "import { layerEnv as layer } from 'tyfigo/effect';\n\nconsole.log(layer);\n",
	'namespace.js': "import * as tyfigo from 'tyfigo';\n\nconsole.log(tyfigo.loadEnvAsync);\n",
	'node-env.js': [
		"import { loadEnv } from 'tyfigo';",
		'',
		"const schema = { '~standard': { version: 1, vendor: 'test', validate: (value) => ({ value }) } };",
		'console.log(loadEnv(schema).SECRET);',
		'',
	].join('\n'),
};

const makeBrowserFixture = async () => {
	const fixture = await makeProject(files);
	await linkPackage(fixture, pkg);
	return fixture;
};

interface Stats {
	readonly hasErrors: () => boolean;
	readonly toString: (options: { readonly all: false; readonly errors: true }) => string;
}

const run = async (compiler: { run: (callback: (error: Error | null, stats?: Stats) => void) => void }) =>
	new Promise<void>((resolve, reject) => {
		compiler.run((error, stats) => {
			if (error) reject(error);
			else if (stats?.hasErrors()) reject(new Error(stats.toString({ all: false, errors: true })));
			else resolve();
		});
	});

const webpackOptions = (fixture: string, entry: Entry) => ({
	mode: 'production' as const,
	context: fixture,
	entry: `./${entry}.js`,
	target: 'web' as const,
	output: { path: join(fixture, 'dist'), filename: `${entry}.js` },
	optimization: { minimize: false },
});

const builds = {
	vite: async (fixture: string, entry: Entry) => {
		await vite({
			root: fixture,
			configFile: false,
			envFile: false,
			logLevel: 'silent',
			plugins: [tyfigoVite()],
			build: {
				outDir: join(fixture, 'dist'),
				minify: false,
				rolldownOptions: { input: join(fixture, `${entry}.js`), output: { entryFileNames: '[name].js' } },
			},
		});
		return join(fixture, 'dist', `${entry}.js`);
	},
	esbuild: async (fixture: string, entry: Entry) => {
		const outfile = join(fixture, 'dist', `${entry}.js`);
		await esbuild({
			entryPoints: [join(fixture, `${entry}.js`)],
			bundle: true,
			platform: 'browser',
			format: 'esm',
			outfile,
			logLevel: 'silent',
			plugins: [tyfigoEsbuild({ environment: 'production' })],
		});
		return outfile;
	},
	webpack: async (fixture: string, entry: Entry) => {
		await run(webpack({ ...webpackOptions(fixture, entry), plugins: [tyfigoWebpack()] }));
		return join(fixture, 'dist', `${entry}.js`);
	},
	rspack: async (fixture: string, entry: Entry) => {
		await run(rspack({ ...webpackOptions(fixture, entry), plugins: [tyfigoRspack()] }));
		return join(fixture, 'dist', `${entry}.js`);
	},
};

describe.each(Object.entries(builds))('%s browser build', (_name, build) => {
	it('bundles loadConfig without Node.js code and runs', async () => {
		const fixture = await makeBrowserFixture();
		const output = await build(fixture, 'config');
		const code = await readFile(output, 'utf8');
		expect(code).not.toMatch(/process\.cwd|readFileSync|parseEnv|__vite-browser-external/u);

		const { stdout } = await promisify(execFile)(process.execPath, [output], { cwd: fixture });
		expect(JSON.parse(stdout)).toEqual({ config: { name: 'base', theme: 'dark' }, provider: 'object' });
	});

	it.each([
		['env', /env\.js:2:1 - loadEnv from 'tyfigo' reads files and environment variables with Node\.js/u],
		['effect-env', /effect-env\.js:1:1 - layerEnv from 'tyfigo\/effect' reads files/u],
		['namespace', /namespace\.js:1:1 - loadEnvAsync from 'tyfigo' reads files/u],
	] as const)('fails when %s.js imports a Node.js-only export', async (entry, error) => {
		await expect(build(await makeBrowserFixture(), entry)).rejects.toThrow(error);
	});
});

describe('server build', () => {
	it('allows loadEnv when esbuild targets Node.js', async () => {
		const fixture = await makeBrowserFixture();
		const outfile = join(fixture, 'dist', 'node-env.mjs');
		await esbuild({
			entryPoints: [join(fixture, 'node-env.js')],
			bundle: true,
			platform: 'node',
			format: 'esm',
			outfile,
			logLevel: 'silent',
			plugins: [tyfigoEsbuild({ environment: 'production' })],
		});
		const { stdout } = await promisify(execFile)(process.execPath, [outfile], { cwd: fixture });
		expect(stdout.trim()).toBe('from-build-machine');
	});
});

describe('findNodeOnlyImports', () => {
	it.each([
		"import type { LoadEnvOptions } from 'tyfigo';",
		"import { type loadEnv, loadConfig } from 'tyfigo';",
		"import { configProvider } from 'tyfigo/effect';",
		"import { loadEnv } from 'tyfigo/runtime';",
		"import * as tyfigo from 'tyfigo';\ntyfigo.loadConfig(config, schema);",
	])('allows %s', (code) => {
		expect(findNodeOnlyImports(code, 'main.ts')).toEqual([]);
	});

	it('reports every Node.js-only import with its position', () => {
		const code = [
			'const a = 1;',
			"import {\n\tloadEnv as env,\n\tloadEnvAsync,\n} from 'tyfigo';",
			"export { configProviderFromFile } from 'tyfigo/effect';",
			'import * as $effect from "tyfigo/effect";\n$effect?.layerConfigProviderFromFile;',
		].join('\n');
		expect(findNodeOnlyImports(code, 'main.ts').map((message) => message.split(' reads ')[0])).toEqual([
			"main.ts:2:1 - loadEnv from 'tyfigo'",
			"main.ts:2:1 - loadEnvAsync from 'tyfigo'",
			"main.ts:6:1 - configProviderFromFile from 'tyfigo/effect'",
			"main.ts:7:1 - layerConfigProviderFromFile from 'tyfigo/effect'",
		]);
	});
});
