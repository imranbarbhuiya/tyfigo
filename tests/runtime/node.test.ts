import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { badValue, fixture, merged, run } from './spawn.ts';

import { makeProject } from '../helpers.ts';

const register = fileURLToPath(new URL('../../src/register.ts', import.meta.url));

beforeEach(() => {
	vi.stubEnv('NODE_ENV', 'production');
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('node --import tyfigo/register', () => {
	it('imports the merged config with the environment file and .env', async () => {
		const root = await makeProject(fixture);
		const result = run('node', ['--import', register, 'main.ts'], root);
		expect(result.stderr).toBe('');
		expect(JSON.parse(result.stdout)).toEqual(merged);
	});

	it('requires a config file from CommonJS', async () => {
		const root = await makeProject({
			...fixture,
			'main.cjs': "console.log(JSON.stringify(require('./config/cache.config.toml').default));\n",
		});
		const result = run('node', ['--import', register, 'main.cjs'], root);
		expect(result.stderr).toBe('');
		expect(JSON.parse(result.stdout)).toEqual({ ttl: 60 });
	});

	it('leaves plain .yaml imports to Node', async () => {
		const root = await makeProject(fixture);
		const result = run('node', ['--import', register, 'plain.ts'], root);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('ERR_UNKNOWN_FILE_EXTENSION');
	});

	it('fails with the file, line and column of a bad value', async () => {
		const root = await makeProject(fixture);
		const result = run('node', ['--import', register, 'bad.ts'], root);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(badValue);
	});
});
