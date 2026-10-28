import { readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';

import { createRsbuild } from '@rsbuild/core';
import { rspack } from '@rspack/core';
import { describe, expect, it } from 'vitest';
import webpack from 'webpack';

import {
	browserPlaceholderError,
	expectBrowserOutput,
	expectServerOutput,
	makeFixture,
	useRuntime,
} from './helpers.ts';

import tyfigoRsbuild from '../../src/plugins/rsbuild.ts';
import tyfigoRspack from '../../src/plugins/rspack.ts';
import tyfigoWebpack from '../../src/plugins/webpack.ts';

import type { Entry } from './helpers.ts';

const runtime = useRuntime();

interface Stats {
	readonly compilation: { readonly fileDependencies: Iterable<string> };
	readonly hasErrors: () => boolean;
	readonly toString: (options: { readonly all: false; readonly errors: true }) => string;
}

const run = async (compiler: { run: (callback: (error: Error | null, stats?: Stats) => void) => void }) =>
	new Promise<Stats | undefined>((resolve, reject) => {
		compiler.run((error, stats) => {
			if (error) reject(error);
			else if (stats?.hasErrors()) reject(new Error(stats.toString({ all: false, errors: true })));
			else resolve(stats);
		});
	});

const options = (fixture: string, entry: Entry, target: 'node' | 'web') => ({
	mode: 'production' as const,
	context: fixture,
	entry: `./${entry}.js`,
	target: target === 'node' ? ('node24' as const) : ('web' as const),
	output: { path: join(fixture, 'dist'), filename: `${entry}.cjs` },
	externals: { [runtime.path]: `import ${runtime.path}` },
	optimization: { minimize: false },
});

const buildWebpack = async (fixture: string, entry: Entry, target: 'node' | 'web') => {
	await run(webpack({ ...options(fixture, entry, target), plugins: [tyfigoWebpack({ runtime: runtime.path })] }));
	return join(fixture, 'dist', `${entry}.cjs`);
};

const buildRspack = async (fixture: string, entry: Entry, target: 'node' | 'web') => {
	await run(rspack({ ...options(fixture, entry, target), plugins: [tyfigoRspack({ runtime: runtime.path })] }));
	return join(fixture, 'dist', `${entry}.cjs`);
};

const buildRsbuild = async (fixture: string, entry: Entry, target: 'node' | 'web') => {
	const rsbuild = await createRsbuild({
		cwd: fixture,
		config: {
			mode: 'production',
			logLevel: 'silent',
			plugins: [tyfigoRsbuild({ runtime: runtime.path })],
			source: { entry: { [entry]: `./${entry}.js` } },
			output: {
				target,
				distPath: { root: 'dist', js: '' },
				filename: { js: '[name].cjs' },
				filenameHash: false,
				minify: false,
				module: false,
				externals: { [runtime.path]: `import ${runtime.path}` },
			},
			performance: { chunkSplit: { strategy: 'all-in-one' } },
			tools: { htmlPlugin: false },
		},
	});
	let errors = '';
	rsbuild.onAfterBuild(({ stats }) => {
		if (stats?.hasErrors()) errors = stats.toString({ all: false, errors: true });
	});
	await rsbuild.build().catch((error: unknown) => {
		throw new Error(errors || String(error));
	});
	return join(fixture, 'dist', `${entry}.cjs`);
};

describe.each([
	['webpack', buildWebpack],
	['rspack', buildRspack],
	['rsbuild', buildRsbuild],
] as const)('%s', (_name, build) => {
	it('uses the browser target for target web', async () => {
		await expectBrowserOutput(await build(await makeFixture(), 'client', 'web'));
	});

	it('uses the server target for target node', async () => {
		const fixture = await makeFixture();
		const file = await build(fixture, 'server', 'node');
		expect(await readdir(join(fixture, 'dist'))).toContain('server.cjs');
		await expectServerOutput(file, fixture);
	});

	it('fails on a placeholder in a browser build', async () => {
		await expect(build(await makeFixture(), 'bad', 'web')).rejects.toThrow(browserPlaceholderError);
	});
});

describe('watch files', () => {
	it('registers every layer and .env file with webpack and Rspack', async () => {
		const fixture = await realpath(await makeFixture());
		const expected = [
			join(fixture, 'server.production.config.yaml'),
			join(fixture, 'server.production.local.config.yaml'),
			join(fixture, '.env.production'),
		];
		const webpackStats = await run(
			webpack({ ...options(fixture, 'server', 'node'), plugins: [tyfigoWebpack({ runtime: runtime.path })] }),
		);
		expect([...(webpackStats?.compilation.fileDependencies ?? [])]).toEqual(expect.arrayContaining(expected));
		const rspackStats = await run(
			rspack({ ...options(fixture, 'server', 'node'), plugins: [tyfigoRspack({ runtime: runtime.path })] }),
		);
		expect([...(rspackStats?.compilation.fileDependencies ?? [])]).toEqual(expect.arrayContaining(expected));
	});
});
