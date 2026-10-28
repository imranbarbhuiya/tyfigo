import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { issuePaths, validationError } from './helpers.ts';

import { loadConfig, loadEnv } from '../../src/index.ts';
import { makeProject } from '../helpers.ts';

const schema = z.object({
	server: z.object({ host: z.string(), port: z.coerce.number().int().min(1) }),
	tags: z.array(z.string().min(2)),
});

describe('zod', () => {
	it('returns the parsed output with coercion', () => {
		const config = loadConfig({ server: { host: 'localhost', port: '8080' }, tags: ['ab'] }, schema);
		expect(config).toEqual({ server: { host: 'localhost', port: 8_080 }, tags: ['ab'] });
		expectTypeOf(config).toEqualTypeOf<{ server: { host: string; port: number }; tags: string[] }>();
	});

	it('lists every failed refinement with its path', () => {
		const error = validationError(() =>
			loadConfig({ server: { host: 'localhost', port: 0 }, tags: ['ab', 'c'] }, schema),
		);
		expect(issuePaths(error)).toEqual([
			['server', 'port'],
			['tags', 1],
		]);
		expect(error.message).toMatch(/^Invalid config:\n {2}server\.port: .+\n {2}tags\[1\]: .+$/);
	});

	it('validates the environment', async () => {
		const cwd = await makeProject({ 'package.json': '{}', '.env': 'PORT=3000\nDEBUG=true' });
		const env = loadEnv(z.object({ PORT: z.coerce.number(), DEBUG: z.stringbool() }), { cwd, env: {} });
		expect(env).toEqual({ PORT: 3_000, DEBUG: true });
		expectTypeOf(env).toEqualTypeOf<{ PORT: number; DEBUG: boolean }>();
	});

	it('fails when a required variable is missing', async () => {
		const cwd = await makeProject({ 'package.json': '{}' });
		const error = validationError(() => loadEnv(z.object({ API_KEY: z.string() }), { cwd, env: {} }));
		expect(error.subject).toBe('environment variables');
		expect(issuePaths(error)).toEqual([['API_KEY']]);
	});
});
