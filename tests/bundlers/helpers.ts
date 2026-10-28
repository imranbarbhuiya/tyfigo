import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { build } from 'esbuild';
import { afterAll, beforeAll, expect } from 'vitest';

import { makeProject } from '../helpers.ts';

export type Entry = 'client' | 'server' | 'bad';

const runtimeDirectory = { path: '' };

/**
 * The runtime as one JavaScript file, so bundles and Jest can import it before the package is built. Call it at the top
 * level of a test file.
 */
export const useRuntime = (): { readonly path: string } => {
	const runtime = { path: '' };
	beforeAll(async () => {
		runtimeDirectory.path ||= await mkdtemp(join(tmpdir(), 'tyfigo-runtime-'));
		runtime.path = join(runtimeDirectory.path, 'runtime.mjs');
		await build({
			entryPoints: [fileURLToPath(new URL('../../src/runtime/index.ts', import.meta.url))],
			bundle: true,
			platform: 'node',
			format: 'esm',
			mainFields: ['module', 'main'],
			banner: {
				js: "import { createRequire as __tyfigoCreateRequire } from 'node:module';\nconst require = __tyfigoCreateRequire(import.meta.url);",
			},
			outfile: runtime.path,
			logLevel: 'silent',
		});
	});
	afterAll(async () => {
		await rm(runtimeDirectory.path, { recursive: true, force: true });
		runtimeDirectory.path = '';
	});
	return runtime;
};

export const fixtureFiles: Record<string, string> = {
	'package.json': '{ "name": "fixture", "type": "module" }',
	'.env': 'SECRET=from-build-machine',
	'client.config.yaml': 'name: base\ntheme: light\n',
	'client.production.config.yaml': 'theme: dark\n',
	'client.local.config.yaml': 'name: local-client\n',
	'server.config.yaml': 'port: ${PORT:-3000}\nsecret: ${SECRET}\nname: base\n',
	'server.production.config.yaml': 'name: production\n',
	'server.local.config.yaml': 'name: local-server\n',
	'bad.config.yaml': 'url: ${API_URL}\n',
	'client.js': "import config from './client.config.yaml';\n\nconsole.log(JSON.stringify(config));\n",
	'server.js': "import config from './server.config.yaml';\n\nconsole.log(JSON.stringify(config));\n",
	'bad.js': "import config from './bad.config.yaml';\n\nconsole.log(JSON.stringify(config));\n",
};

export const makeFixture = async (): Promise<string> => makeProject(fixtureFiles);

/**
 * Asserts that a browser build inlined the base and production files of `client.config.yaml` and nothing else.
 */
export const expectBrowserOutput = async (file: string) => {
	const output = await readFile(file, 'utf8');
	expect(output).toContain('dark');
	expect(output).toContain('base');
	expect(output).not.toContain('light');
	expect(output).not.toContain('local-client');
};

/**
 * Copies a server bundle to a directory unrelated to the build, with its own `.env` files, runs it with Node.js and asserts the
 * config it prints.
 */
export const expectServerOutput = async (file: string, fixture: string) => {
	const output = await readFile(file, 'utf8');
	expect(output).not.toContain(JSON.stringify(fixture).slice(0, -1));
	expect(output).toContain('local-server');

	const deploy = await makeProject({ '.env': 'SECRET=deployed', '.env.production': 'PORT=8080' });
	await copyFile(file, join(deploy, basename(file)));
	const { stdout } = await promisify(execFile)(process.execPath, [basename(file)], { cwd: deploy });
	expect(JSON.parse(stdout.trim().split('\n').at(-1) ?? '')).toEqual({
		port: 8_080,
		secret: 'deployed',
		name: 'local-server',
	});
};

export const browserPlaceholderError = /bad\.config\.yaml:1:6 - 'url' uses an environment placeholder/u;
