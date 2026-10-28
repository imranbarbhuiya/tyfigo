import * as v from 'valibot';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { issuePaths, validationError } from './helpers.ts';

import { loadConfig, loadEnv } from '../../src/index.ts';
import { makeProject } from '../helpers.ts';

const schema = v.object({
	server: v.object({
		host: v.string(),
		port: v.pipe(v.union([v.number(), v.string()]), v.transform(Number), v.integer(), v.minValue(1)),
	}),
	tags: v.array(v.pipe(v.string(), v.minLength(2))),
});

describe('valibot', () => {
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
	});

	it('validates the environment', async () => {
		const cwd = await makeProject({ 'package.json': '{}', '.env': 'PORT=3000' });
		const env = loadEnv(v.object({ PORT: v.pipe(v.string(), v.transform(Number)) }), { cwd, env: {} });
		expect(env).toEqual({ PORT: 3_000 });
		expectTypeOf(env).toEqualTypeOf<{ PORT: number }>();
	});
});
