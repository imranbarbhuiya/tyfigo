import { join } from 'node:path';

import { rolldown } from 'rolldown';
import { rollup } from 'rollup';
import { build as tsdown } from 'tsdown';
import { describe, it } from 'vitest';

import {
	browserPlaceholderError,
	expectBrowserOutput,
	expectServerOutput,
	makeFixture,
	useRuntime,
} from './helpers.ts';

import tyfigoRolldown from '../../src/plugins/rolldown.ts';
import tyfigoRollup from '../../src/plugins/rollup.ts';

import type { LoadTarget } from '../../src/runtime/index.ts';
import type { Entry } from './helpers.ts';

const runtime = useRuntime();

const buildRollup = async (fixture: string, entry: Entry, target?: LoadTarget) => {
	const bundle = await rollup({
		input: join(fixture, `${entry}.js`),
		external: [runtime.path],
		plugins: [tyfigoRollup({ target, environment: 'production', runtime: runtime.path })],
	});
	const file = join(fixture, 'dist', `${entry}.mjs`);
	await bundle.write({ file, format: 'es' });
	return file;
};

const buildRolldown = async (fixture: string, entry: Entry, platform: 'browser' | 'node') => {
	const bundle = await rolldown({
		input: join(fixture, `${entry}.js`),
		platform,
		external: [runtime.path],
		plugins: [tyfigoRolldown({ environment: 'production', runtime: runtime.path })],
	});
	const file = join(fixture, 'dist', `${entry}.mjs`);
	await bundle.write({ file, format: 'es' });
	return file;
};

const buildTsdown = async (fixture: string, entry: Entry, platform: 'browser' | 'node') => {
	const outDir = join(fixture, 'dist');
	await tsdown({
		cwd: fixture,
		entry: [`${entry}.js`],
		outDir,
		platform,
		format: 'esm',
		config: false,
		dts: false,
		logLevel: 'silent',
		deps: { neverBundle: [runtime.path] },
		plugins: [tyfigoRolldown({ environment: 'production', runtime: runtime.path })],
	});
	return join(outDir, `${entry}.${platform === 'node' ? 'mjs' : 'js'}`);
};

describe('rollup', () => {
	it('inlines the base and environment files for the browser by default', async () => {
		await expectBrowserOutput(await buildRollup(await makeFixture(), 'client'));
	});

	it('bundles every layer and reads .env files when the bundle runs with target server', async () => {
		const fixture = await makeFixture();
		await expectServerOutput(await buildRollup(fixture, 'server', 'server'), fixture);
	});

	it('fails on a placeholder in a browser build', async ({ expect }) => {
		await expect(buildRollup(await makeFixture(), 'bad')).rejects.toThrow(browserPlaceholderError);
	});
});

describe('rolldown', () => {
	it('uses the browser target for platform browser', async () => {
		await expectBrowserOutput(await buildRolldown(await makeFixture(), 'client', 'browser'));
	});

	it('uses the server target for platform node', async () => {
		const fixture = await makeFixture();
		await expectServerOutput(await buildRolldown(fixture, 'server', 'node'), fixture);
	});

	it('fails on a placeholder in a browser build', async ({ expect }) => {
		await expect(buildRolldown(await makeFixture(), 'bad', 'browser')).rejects.toThrow(browserPlaceholderError);
	});
});

describe('tsdown', () => {
	it('uses the browser target for platform browser', async () => {
		await expectBrowserOutput(await buildTsdown(await makeFixture(), 'client', 'browser'));
	});

	it('uses the server target for platform node', async () => {
		const fixture = await makeFixture();
		await expectServerOutput(await buildTsdown(fixture, 'server', 'node'), fixture);
	});

	it('fails on a placeholder in a browser build', async ({ expect }) => {
		await expect(buildTsdown(await makeFixture(), 'bad', 'browser')).rejects.toThrow(browserPlaceholderError);
	});
});
