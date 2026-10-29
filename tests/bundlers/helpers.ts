import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { build } from 'esbuild';
import { afterAll, beforeAll, expect } from 'vitest';

import { makeProject } from '../helpers.ts';

export type Entry = 'client' | 'server' | 'bad' | 'plain';

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

const packageDirectory = { path: '' };

/**
 * The `.` and `./effect` entries of tyfigo built from source into a `node_modules/tyfigo` package with the same export conditions
 * as `package.json`. Browser entries are bundled for platform browser, so a Node.js import in them fails this build. Call it at the
 * top level of a test file and link the package into a fixture with {@link linkPackage}.
 */
export const usePackage = (): { readonly path: string } => {
	const pkg = { path: '' };
	beforeAll(async () => {
		packageDirectory.path ||= await mkdtemp(join(tmpdir(), 'tyfigo-package-'));
		pkg.path = join(packageDirectory.path, 'node_modules', 'tyfigo');
		const manifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as {
			readonly exports: Readonly<Record<string, Readonly<Record<string, string>> | string>>;
		};
		const exports: Record<string, Record<string, string>> = {};
		for (const subpath of ['.', './effect']) {
			const conditions = manifest.exports[subpath];
			if (typeof conditions !== 'object') continue;
			exports[subpath] = {};
			for (const [condition, target] of Object.entries(conditions)) {
				if (condition === 'types') continue;
				exports[subpath][condition] = target;
				await build({
					entryPoints: [
						fileURLToPath(
							new URL(target.replace(/^\.\/dist\/(.+)\.mjs$/u, '../../src/$1.ts'), import.meta.url),
						),
					],
					bundle: true,
					platform: condition === 'browser' ? 'browser' : 'node',
					format: 'esm',
					outfile: join(pkg.path, target),
					logLevel: 'silent',
				});
			}
		}
		await writeFile(join(pkg.path, 'package.json'), JSON.stringify({ name: 'tyfigo', type: 'module', exports }));
	});
	afterAll(async () => {
		await rm(packageDirectory.path, { recursive: true, force: true });
		packageDirectory.path = '';
	});
	return pkg;
};

export const linkPackage = async (fixture: string, pkg: { readonly path: string }) => {
	await mkdir(join(fixture, 'node_modules'), { recursive: true });
	await symlink(pkg.path, join(fixture, 'node_modules', 'tyfigo'), 'dir');
};

export const fixtureFiles: Record<string, string> = {
	'package.json': '{ "name": "fixture", "type": "module" }',
	'.env': 'SECRET=from-build-machine',
	'client.config.yaml': 'name: base\ntheme: light\n',
	'client.production.config.yaml': 'theme: dark\n',
	'client.local.config.yaml': 'name: local-client\n',
	'server.config.yaml': 'port: ${PORT:-3000}\nsecret: ${SECRET}\nname: base\ntier: base\n',
	'server.production.config.yaml': 'name: production\ntier: production\n',
	'server.staging.config.yaml': 'tier: staging\n',
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
 * Runs a bundle with Node.js in `cwd` with only `NODE_ENV` set, and returns the config it prints.
 */
export const runBundle = async (file: string, cwd: string, nodeEnv?: string): Promise<unknown> => {
	const { stdout } = await promisify(execFile)(process.execPath, [file], {
		cwd,
		env: (nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv }) as NodeJS.ProcessEnv,
	});
	return JSON.parse(stdout.trim().split('\n').at(-1) ?? '');
};

/**
 * Copies a server bundle to a directory unrelated to the build, with its own `.env` files, runs it with Node.js under
 * `NODE_ENV=production` and with no environment, and asserts the config it prints. Pass the `environment` the bundle was built
 * with when the build fixed it.
 */
export const expectServerOutput = async (file: string, fixture: string, environment?: string) => {
	const output = await readFile(file, 'utf8');
	expect(output).not.toContain(JSON.stringify(fixture).slice(0, -1));
	expect(output).toContain('local-server');
	if (environment === undefined) expect(output).toContain('staging');
	else expect(output).not.toContain('staging');

	const deploy = await makeProject({ '.env': 'SECRET=deployed', '.env.production': 'PORT=8080' });
	await copyFile(file, join(deploy, basename(file)));
	const production = { port: 8_080, secret: 'deployed', name: 'local-server', tier: 'production' };
	expect(await runBundle(basename(file), deploy, 'production')).toEqual(production);
	expect(await runBundle(basename(file), deploy)).toEqual(
		environment === undefined
			? { port: 3_000, secret: 'deployed', name: 'local-server', tier: 'base' }
			: production,
	);
};

export const configDirectoryFiles: Record<string, string> = {
	'package.json': '{ "name": "fixture", "type": "module" }',
	'.config/client.yaml': 'name: base\ntheme: light\n',
	'.config/client.production.yaml': 'theme: dark\n',
	'.config/client.local.yaml': 'name: local-client\n',
	'.config/server.yaml': 'port: ${PORT:-3000}\nname: base\ntier: base\n',
	'.config/server.production.yaml': 'tier: production\n',
	'.config/server.local.yaml': 'name: local-server\n',
	'client.js': "import config from './.config/client.yaml';\n\nconsole.log(JSON.stringify(config));\n",
	'server.js': "import config from './.config/server.yaml';\n\nconsole.log(JSON.stringify(config));\n",
	'plain.js': "import data from './data.yaml';\n\nconsole.log(JSON.stringify(data));\n",
	'data.yaml': 'plain: true\n',
};

/**
 * Asserts that a server build of {@link configDirectoryFiles} adds the local file and reads `.env` files where it runs.
 */
export const expectConfigDirectoryServerOutput = async (server: string) => {
	const deploy = await makeProject({ '.env.production': 'PORT=8080' });
	await copyFile(server, join(deploy, 'server.mjs'));
	expect(await runBundle('server.mjs', deploy, 'production')).toEqual({
		port: 8_080,
		name: 'local-server',
		tier: 'production',
	});
};

export const browserPlaceholderError = /bad\.config\.yaml:1:6 - 'url' uses an environment placeholder/u;
