import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { fixtureFiles, useRuntime } from './helpers.ts';

import { configFilePattern } from '../../src/plugins/shared.ts';
import { makeProject } from '../helpers.ts';

const runtime = useRuntime();
const transformer = fileURLToPath(new URL('../../src/plugins/jest.ts', import.meta.url));
const jest = fileURLToPath(new URL('../../node_modules/jest/bin/jest.js', import.meta.url));

const expected = { port: 3_000, secret: 'from-build-machine', name: 'local-server', tier: 'production' };

const jestConfig = (esm = false) =>
	JSON.stringify({
		...(esm ? { extensionsToTreatAsEsm: ['.yaml'] } : {}),
		testEnvironment: 'node',
		testMatch: ['**/*.test.{cjs,mjs}'],
		moduleFileExtensions: ['js', 'cjs', 'mjs', 'json', 'yaml'],
		transform: {
			[configFilePattern.source]: [transformer, { environment: 'production', runtime: runtime.path }],
		},
	});

const runJest = async (fixture: string, flags: readonly string[] = []) => {
	try {
		await promisify(execFile)(process.execPath, [...flags, jest, '--ci', '--no-cache', '--rootDir', fixture], {
			cwd: fixture,
		});
		return '';
	} catch (error) {
		return (error as { stderr: string }).stderr;
	}
};

describe('jest', () => {
	it('inlines the resolved config for CommonJS tests', async () => {
		const fixture = await makeProject({
			...fixtureFiles,
			'package.json': '{ "name": "fixture" }',
			'config.test.cjs': `const config = require('./server.config.yaml').default;\n\ntest('config', () => {\n\texpect(config).toEqual(${JSON.stringify(expected)});\n\texpect(Object.isFrozen(config)).toBe(true);\n});\n`,
		});
		await writeFile(join(fixture, 'jest.config.json'), jestConfig());
		expect(await runJest(fixture)).toBe('');
	});

	it('loads the server module for native ESM tests', async () => {
		const fixture = await makeProject({
			...fixtureFiles,
			'config.test.mjs': `import { getConfigSource } from ${JSON.stringify(runtime.path)};\nimport config from './server.config.yaml';\n\ntest('config', () => {\n\texpect(config).toEqual(${JSON.stringify(expected)});\n\texpect(getConfigSource(config).environment).toBe('production');\n});\n`,
		});
		await writeFile(join(fixture, 'jest.config.json'), jestConfig(true));
		expect(await runJest(fixture, ['--experimental-vm-modules', '--no-warnings'])).toBe('');
	});

	it('fails the test file listing every problem', async () => {
		const fixture = await makeProject({
			...fixtureFiles,
			'package.json': '{ "name": "fixture" }',
			'server.local.config.yaml': 'name: local\nextra: true\n',
			'config.test.cjs': "require('./server.config.yaml');\n\ntest('config', () => {});\n",
		});
		await writeFile(join(fixture, 'jest.config.json'), jestConfig());
		expect(await runJest(fixture)).toMatch(
			/server\.local\.config\.yaml:2:1 - 'extra' is not in server\.config\.yaml.*\(unknown-key\)/u,
		);
	});
});
