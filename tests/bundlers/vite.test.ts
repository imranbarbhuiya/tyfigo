import { realpath } from 'node:fs/promises';
import { join } from 'node:path';

import { build, createServer } from 'vite';
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

import tyfigo from '../../src/plugins/vite.ts';
import { makeProject } from '../helpers.ts';

import type { Entry } from './helpers.ts';

const runtime = useRuntime();

const buildVite = async (fixture: string, entry: Entry, ssr: boolean, environment?: string) => {
	const outDir = join(fixture, 'dist');
	await build({
		root: fixture,
		configFile: false,
		envFile: false,
		logLevel: 'silent',
		plugins: [tyfigo({ environment, runtime: runtime.path })],
		build: {
			outDir,
			minify: false,
			ssr: ssr ? join(fixture, `${entry}.js`) : false,
			rolldownOptions: {
				input: join(fixture, `${entry}.js`),
				external: [runtime.path],
				output: { entryFileNames: '[name].mjs' },
			},
		},
	});
	return join(outDir, `${entry}.mjs`);
};

describe('vite', () => {
	it('uses the browser target for the client build', async () => {
		await expectBrowserOutput(await buildVite(await makeFixture(), 'client', false));
	});

	it('uses the bundled server target for an SSR build', async () => {
		const fixture = await makeFixture();
		await expectServerOutput(await buildVite(fixture, 'server', true), fixture);
	});

	it('ignores the mode and NODE_ENV at build time for an SSR build', async () => {
		const fixture = await makeFixture();
		vi.stubEnv('NODE_ENV', 'staging');
		const file = await buildVite(fixture, 'server', true);
		vi.unstubAllEnvs();
		await expectServerOutput(file, fixture);
	});

	it('keeps the environment option of an SSR build', async () => {
		const fixture = await makeFixture();
		await expectServerOutput(await buildVite(fixture, 'server', true, 'production'), fixture, 'production');
	});

	it('fails on a placeholder in a client build', async () => {
		await expect(buildVite(await makeFixture(), 'bad', false)).rejects.toThrow(browserPlaceholderError);
	});

	it('loads files in a .config directory and leaves other .yaml files to Vite', async () => {
		const fixture = await makeProject(configDirectoryFiles);
		await expectBrowserOutput(await buildVite(fixture, 'client', false, 'production'));
		await expectConfigDirectoryServerOutput(await buildVite(fixture, 'server', true));
		await expect(buildVite(fixture, 'plain', true)).rejects.toThrow(/data\.yaml/u);
	});

	it('loads the server module by path and watches the layer and .env files in dev SSR', async () => {
		const fixture = await realpath(await makeFixture());
		const server = await createServer({
			root: fixture,
			configFile: false,
			envFile: false,
			logLevel: 'silent',
			mode: 'production',
			server: { middlewareMode: true, ws: false },
			plugins: [tyfigo({ runtime: runtime.path })],
		});
		try {
			const result = await server.environments.ssr.transformRequest(join(fixture, 'server.config.yaml'));
			expect(result?.code).toContain(
				`.resolveConfigModule)(${JSON.stringify(join(fixture, 'server.config.yaml'))}, { environment: "production" })`,
			);
			expect([...server.environments.ssr.pluginContainer.watchFiles]).toEqual(
				expect.arrayContaining([
					join(fixture, 'server.production.config.yaml'),
					join(fixture, '.env.production'),
				]),
			);

			const client = await server.environments.client.transformRequest(join(fixture, 'client.config.yaml'));
			expect(client?.code).toContain('dark');
			expect(client?.code).not.toContain('local-client');
		} finally {
			await server.close();
		}
	});
});
