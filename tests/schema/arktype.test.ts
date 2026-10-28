import { type } from 'arktype';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { issuePaths, validationError } from './helpers.ts';

import { loadConfig, loadEnv } from '../../src/index.ts';
import { makeProject } from '../helpers.ts';

const schema = type({
	server: { host: 'string', port: 'string.integer.parse | number.integer' },
	tags: 'string >= 2 []',
});

describe('arktype', () => {
	it('returns the parsed output with coercion', () => {
		const config = loadConfig({ server: { host: 'localhost', port: '8080' }, tags: ['ab'] }, schema);
		expect(config).toEqual({ server: { host: 'localhost', port: 8_080 }, tags: ['ab'] });
		expectTypeOf(config).toEqualTypeOf<{ server: { host: string; port: number }; tags: string[] }>();
	});

	it('lists every failed refinement with its path', () => {
		const error = validationError(() =>
			loadConfig({ server: { host: 'localhost', port: 1.5 }, tags: ['ab', 'c'] }, schema),
		);
		expect(issuePaths(error)).toEqual([
			['server', 'port'],
			['tags', 1],
		]);
	});

	it('validates the environment', async () => {
		const cwd = await makeProject({ 'package.json': '{}', '.env': 'PORT=3000' });
		const env = loadEnv(type({ PORT: 'string.integer.parse' }), { cwd, env: {} });
		expect(env).toEqual({ PORT: 3_000 });
		expectTypeOf(env).toEqualTypeOf<{ PORT: number }>();
	});
});
