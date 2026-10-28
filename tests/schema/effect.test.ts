import { Schema } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { issuePaths, validationError } from './helpers.ts';

import { loadConfig, loadEnv } from '../../src/index.ts';
import { makeProject } from '../helpers.ts';

const schema = Schema.Struct({
	server: Schema.Struct({
		host: Schema.String,
		port: Schema.FiniteFromString.check(Schema.isInt(), Schema.isGreaterThan(0)),
	}),
	tags: Schema.Array(Schema.String.check(Schema.isMinLength(2))),
});

describe('effect schema', () => {
	it('is not a Standard Schema by itself', () => {
		expect('~standard' in schema).toBe(false);
	});

	it('returns the decoded output', () => {
		const config = loadConfig({ server: { host: 'localhost', port: '8080' }, tags: ['ab'] }, schema);
		expect(config).toEqual({ server: { host: 'localhost', port: 8_080 }, tags: ['ab'] });
		expectTypeOf(config).toEqualTypeOf<{
			readonly server: { readonly host: string; readonly port: number };
			readonly tags: readonly string[];
		}>();
	});

	it('lists every failed refinement with its path', () => {
		const error = validationError(() =>
			loadConfig({ server: { host: 'localhost', port: '0' }, tags: ['ab', 'c'] }, schema),
		);
		expect(issuePaths(error)).toEqual([
			['server', 'port'],
			['tags', 1],
		]);
	});

	it('validates the environment', async () => {
		const cwd = await makeProject({ 'package.json': '{}', '.env': 'PORT=3000' });
		const env = loadEnv(Schema.Struct({ PORT: Schema.FiniteFromString }), { cwd, env: {} });
		expect(env).toEqual({ PORT: 3_000 });
		expectTypeOf(env).toEqualTypeOf<{ readonly PORT: number }>();
	});
});
