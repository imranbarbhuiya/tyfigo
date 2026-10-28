import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtureFiles, useRuntime } from './helpers.ts';

import { configSuffixes } from '../../src/core/index.ts';
import { typeCheck, withTyfigo } from '../../src/plugins/next.ts';
import { makeProject } from '../helpers.ts';

const runtime = useRuntime();
const repository = fileURLToPath(new URL('../../', import.meta.url));
const next = join(repository, 'node_modules/next/dist/bin/next');
const plugin = join(repository, 'src/plugins/next.ts');

const projects: string[] = [];

beforeEach(() => {
	vi.stubEnv('NEXT_TELEMETRY_DISABLED', '1');
	vi.stubEnv('NODE_ENV', 'production');
});

afterEach(async () => {
	vi.unstubAllEnvs();
	await Promise.all(projects.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })));
});

afterAll(async () => {
	await rm(join(repository, '.tmp'), { recursive: true, force: true });
});

const files = (clientConfig: string): Record<string, string> => ({
	...fixtureFiles,
	'package.json': '{ "name": "fixture", "private": true, "type": "module" }',
	'next.config.mjs': `import { withTyfigo } from ${JSON.stringify(plugin)};\n\nexport default withTyfigo({}, { runtime: './runtime.mjs' });\n`,
	'app/layout.jsx':
		'export default function Layout({ children }) {\n\treturn <html><body>{children}</body></html>;\n}\n',
	'app/client.jsx': `'use client';\nimport config from '../${clientConfig}';\n\nexport function Client() {\n\treturn <p id="client">{JSON.stringify(config)}</p>;\n}\n`,
	'app/page.jsx':
		"import config from '../server.config.yaml';\nimport { Client } from './client.jsx';\n\nexport default function Page() {\n\treturn <main><p id=\"server\">{JSON.stringify(config)}</p><Client /></main>;\n}\n",
});

/**
 * Next.js and Turbopack only resolve files inside the project root they detect from the lockfile, so the fixture lives in this
 * repository instead of the system temporary directory.
 */
const makeNextFixture = async (clientConfig: string) => {
	await mkdir(join(repository, '.tmp'), { recursive: true });
	const fixture = await mkdtemp(join(repository, '.tmp', 'next-'));
	projects.push(fixture);
	for (const [name, content] of Object.entries(files(clientConfig))) {
		await mkdir(dirname(join(fixture, name)), { recursive: true });
		await writeFile(join(fixture, name), content);
	}
	await copyFile(runtime.path, join(fixture, 'runtime.mjs'));
	return fixture;
};

const nextBuild = async (fixture: string, flags: readonly string[]) => {
	try {
		await promisify(execFile)(process.execPath, [next, 'build', ...flags], { cwd: fixture });
		return '';
	} catch (error) {
		const { stdout, stderr } = error as { stdout: string; stderr: string };
		return `${stdout}\n${stderr}`;
	}
};

const readTree = async (directory: string): Promise<string> => {
	const entries = await readdir(directory, { recursive: true, withFileTypes: true });
	const texts = await Promise.all(
		entries
			.filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
			.map(async (entry) => readFile(join(entry.parentPath, entry.name), 'utf8')),
	);
	return texts.join('\n');
};

const quoted = (value: unknown) => JSON.stringify(value).replaceAll('"', '&quot;');

describe.each([
	['Turbopack', [], { name: 'local-client', theme: 'dark' }],
	['webpack', ['--webpack'], { name: 'base', theme: 'dark' }],
] as const)('next build with %s', (_name, flags, clientServerRender) => {
	it('inlines the browser config in client code and bundles the server config', { timeout: 180_000 }, async () => {
		const fixture = await makeNextFixture('client.config.yaml');
		expect(await nextBuild(fixture, flags)).toBe('');

		const html = await readFile(join(fixture, '.next/server/app/index.html'), 'utf8');
		expect(html).toContain(quoted({ port: 3_000, secret: 'from-build-machine', name: 'local-server' }));
		expect(html).toContain(quoted(clientServerRender));

		const client = await readTree(join(fixture, '.next/static'));
		expect(client).toContain('dark');
		expect(client).not.toContain('local-client');
		expect(client).not.toContain('local-server');

		const server = await readTree(join(fixture, '.next/server'));
		expect(server).toContain('resolveBundledConfigModule');
		expect(server).not.toContain(JSON.stringify(join(fixture, 'server.config.yaml')));
	});

	it('fails on a placeholder in client code', { timeout: 180_000 }, async () => {
		const fixture = await makeNextFixture('bad.config.yaml');
		expect(await nextBuild(fixture, flags)).toMatch(/'url' uses an environment placeholder/u);
	});
});

describe('withTyfigo', () => {
	it('turns off the Next.js type check and runs tsc --runExternalCode after the production compile', async () => {
		const config = withTyfigo({ typescript: { tsconfigPath: 'tsconfig.app.json' } });
		expect(config.typescript).toEqual({ tsconfigPath: 'tsconfig.app.json', ignoreBuildErrors: true });
		expect(config.experimental?.useTypeScriptCli).toBe(true);
		expect(config.compiler?.runAfterProductionCompile).toBeTypeOf('function');
		expect(withTyfigo({}, { typeCheck: false }).typescript).toBeUndefined();
		expect(withTyfigo({ typescript: { ignoreBuildErrors: true } }).compiler).toBeUndefined();
	});

	it('keeps the user webpack config and Turbopack rules', () => {
		const config = withTyfigo({
			turbopack: { rules: { '*.svg': { loaders: ['svg-loader'], as: '*.js' } } },
			webpack: (webpackConfig: { marked?: boolean }) => ({ ...webpackConfig, marked: true }),
		});
		expect(Object.keys(config.turbopack?.rules ?? {})).toEqual([
			...configSuffixes.map((suffix) => `*${suffix}`),
			'*.svg',
		]);
		const rules: unknown[] = [];
		const result = config.webpack?.({ module: { rules } }, {
			isServer: false,
			nextRuntime: undefined,
		} as never) as {
			marked: boolean;
		};
		expect(result.marked).toBe(true);
		expect(rules).toEqual([
			expect.objectContaining({ use: [expect.objectContaining({ options: { target: 'browser' } })] }),
		]);
	});

	it('type-checks with tsc --runExternalCode', async () => {
		const project = await makeProject({
			'tsconfig.json': '{ "compilerOptions": { "strict": true, "types": [] }, "files": ["index.ts"] }',
			'index.ts': 'export const port: number = 3000;\n',
		});
		await expect(typeCheck(repository, join(project, 'tsconfig.json'))).resolves.toBeUndefined();

		await writeFile(join(project, 'index.ts'), "export const port: number = '3000';\n");
		await expect(typeCheck(repository, join(project, 'tsconfig.json'))).rejects.toThrow(
			'Type check failed: tsc --noEmit --runExternalCode',
		);
		await expect(typeCheck(project, 'missing.json')).resolves.toBeUndefined();
	});
});
