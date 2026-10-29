import { execFile } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { build } from 'esbuild';
import { build as tsup } from 'tsup';
import { describe, expect, it, vi } from 'vitest';

import {
	browserPlaceholderError,
	configDirectoryFiles,
	expectBrowserOutput,
	expectConfigDirectoryServerOutput,
	expectServerOutput,
	makeFixture,
	useRuntime,
} from './helpers.ts';

import tyfigo from '../../src/plugins/esbuild.ts';
import { makeProject } from '../helpers.ts';

import type { Entry } from './helpers.ts';

const runtime = useRuntime();

const buildEsbuild = async (
	fixture: string,
	entry: Entry,
	platform: 'browser' | 'node',
	environment: string | false = 'production',
) => {
	const outfile = join(fixture, 'dist', `${entry}.mjs`);
	await build({
		entryPoints: [join(fixture, `${entry}.js`)],
		bundle: true,
		platform,
		format: 'esm',
		outfile,
		external: [runtime.path],
		logLevel: 'silent',
		plugins: [tyfigo({ environment: environment || undefined, runtime: runtime.path })],
	});
	return outfile;
};

const buildTsup = async (fixture: string, entry: Entry, platform: 'browser' | 'node') => {
	const outDir = join(fixture, 'dist');
	await tsup({
		entry: { [entry]: join(fixture, `${entry}.js`) },
		outDir,
		platform,
		format: 'esm',
		config: false,
		silent: true,
		external: [runtime.path],
		esbuildPlugins: [tyfigo({ environment: 'production', runtime: runtime.path })],
	});
	return join(outDir, `${entry}.js`);
};

describe('esbuild', () => {
	it('uses the browser target for platform browser', async () => {
		await expectBrowserOutput(await buildEsbuild(await makeFixture(), 'client', 'browser'));
	});

	it('uses the server target for platform node', async () => {
		const fixture = await makeFixture();
		await expectServerOutput(await buildEsbuild(fixture, 'server', 'node'), fixture, 'production');
	});

	it('picks the environment when a server bundle built without one starts', async () => {
		const fixture = await makeFixture();
		await expectServerOutput(await buildEsbuild(fixture, 'server', 'node', false), fixture);
	});

	it('ignores NODE_ENV at build time for a server bundle built without an environment', async () => {
		const fixture = await makeFixture();
		vi.stubEnv('NODE_ENV', 'staging');
		const file = await buildEsbuild(fixture, 'server', 'node', false);
		vi.unstubAllEnvs();
		await expectServerOutput(file, fixture);
	});

	it('fails on a placeholder in a browser build', async ({ expect }) => {
		await expect(buildEsbuild(await makeFixture(), 'bad', 'browser')).rejects.toThrow(browserPlaceholderError);
	});

	it('loads files in a .config directory and leaves other .yaml files to esbuild', async ({ expect }) => {
		const fixture = await makeProject(configDirectoryFiles);
		await expectBrowserOutput(await buildEsbuild(fixture, 'client', 'browser'));
		await expectConfigDirectoryServerOutput(await buildEsbuild(fixture, 'server', 'node', false));
		await expect(buildEsbuild(fixture, 'plain', 'node')).rejects.toThrow(
			/No loader is configured for "\.yaml" files/u,
		);
	});
});

describe('tsup', () => {
	it('uses the browser target for platform browser', async () => {
		await expectBrowserOutput(await buildTsup(await makeFixture(), 'client', 'browser'));
	});

	it('uses the server target for platform node', async () => {
		const fixture = await makeFixture();
		await expectServerOutput(await buildTsup(fixture, 'server', 'node'), fixture, 'production');
	});

	it('fails on a placeholder in a browser build', async ({ expect }) => {
		await expect(buildTsup(await makeFixture(), 'bad', 'browser')).rejects.toThrow(browserPlaceholderError);
	});
});

describe('esbuild with INI, .properties and XML', () => {
	const files = {
		'package.json': '{ "type": "module" }',
		'app.config.ini': 'name = base\n\n[ui]\ntheme = light\n',
		'app.production.config.ini': '[ui]\ntheme = dark\n',
		'jvm.config.properties': 'heap.max = 512\n',
		'jvm.production.config.properties': 'heap.max = 1024\n',
		'site.config.xml': '<site lang="en"><page>a</page><page>b</page></site>\n',
		'entry.js': [
			"import app from './app.config.ini';",
			"import jvm from './jvm.config.properties';",
			"import site from './site.config.xml';",
			'console.log(JSON.stringify({ app, jvm, site }));',
			'',
		].join('\n'),
	};
	const expected = {
		app: { name: 'base', ui: { theme: 'dark' } },
		jvm: { heap: { max: 1_024 } },
		site: { site: { '@lang': 'en', page: ['a', 'b'] } },
	};

	it.each(['browser', 'node'] as const)('bundles every format for platform %s', async (platform) => {
		const fixture = await makeProject(files);
		const outfile = join(fixture, 'dist', 'entry.mjs');
		await build({
			entryPoints: [join(fixture, 'entry.js')],
			bundle: true,
			platform,
			format: 'esm',
			outfile,
			external: [runtime.path],
			logLevel: 'silent',
			plugins: [tyfigo({ environment: 'production', runtime: runtime.path })],
		});
		const { stdout } = await promisify(execFile)(process.execPath, [outfile], { cwd: fixture });
		expect(JSON.parse(stdout)).toEqual(expected);
	});
});
