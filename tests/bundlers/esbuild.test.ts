import { join } from 'node:path';

import { build } from 'esbuild';
import { build as tsup } from 'tsup';
import { describe, it } from 'vitest';

import {
	browserPlaceholderError,
	expectBrowserOutput,
	expectServerOutput,
	makeFixture,
	useRuntime,
} from './helpers.ts';

import tyfigo from '../../src/plugins/esbuild.ts';

import type { Entry } from './helpers.ts';

const runtime = useRuntime();

const buildEsbuild = async (fixture: string, entry: Entry, platform: 'browser' | 'node') => {
	const outfile = join(fixture, 'dist', `${entry}.mjs`);
	await build({
		entryPoints: [join(fixture, `${entry}.js`)],
		bundle: true,
		platform,
		format: 'esm',
		outfile,
		external: [runtime.path],
		logLevel: 'silent',
		plugins: [tyfigo({ environment: 'production', runtime: runtime.path })],
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
		await expectServerOutput(await buildEsbuild(fixture, 'server', 'node'), fixture);
	});

	it('fails on a placeholder in a browser build', async ({ expect }) => {
		await expect(buildEsbuild(await makeFixture(), 'bad', 'browser')).rejects.toThrow(browserPlaceholderError);
	});
});

describe('tsup', () => {
	it('uses the browser target for platform browser', async () => {
		await expectBrowserOutput(await buildTsup(await makeFixture(), 'client', 'browser'));
	});

	it('uses the server target for platform node', async () => {
		const fixture = await makeFixture();
		await expectServerOutput(await buildTsup(fixture, 'server', 'node'), fixture);
	});

	it('fails on a placeholder in a browser build', async ({ expect }) => {
		await expect(buildTsup(await makeFixture(), 'bad', 'browser')).rejects.toThrow(browserPlaceholderError);
	});
});
