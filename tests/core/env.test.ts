import { join } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { processEnv, readEnv } from '../../src/core/env.ts';
import { makeProject } from '../helpers.ts';

describe('readEnv', () => {
	it('applies .env files in order and puts the real environment on top', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'.env': 'A=env\nB=env\nC=env\nD=env\nE=env',
			'.env.local': 'B=local\nC=local\nD=local\nE=local',
			'.env.production': 'C=production\nD=production\nE=production',
			'.env.production.local': 'D=production-local\nE=production-local',
			'.env.staging': 'A=staging',
		});
		const result = await Effect.runPromise(
			readEnv(join(root, 'app.config.yaml'), { environment: 'production', env: { E: 'real', F: 'real' } }),
		);
		expect(result.variables).toEqual({
			A: 'env',
			B: 'local',
			C: 'production',
			D: 'production-local',
			E: 'real',
			F: 'real',
		});
		expect(result.files).toEqual(
			['.env', '.env.local', '.env.production', '.env.production.local'].map((name) => join(root, name)),
		);
	});

	it('reads only .env and .env.local without an environment', async () => {
		const root = await makeProject({ 'package.json': '{}', '.env': 'A=1', '.env.production': 'A=2' });
		const result = await Effect.runPromise(readEnv(join(root, 'app.config.yaml'), { env: {} }));
		expect(result.variables).toEqual({ A: '1' });
	});

	it('looks next to the base file first, then at the project root', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'.env': 'A=root\nB=root',
			'.env.local': 'C=root-local',
			'config/.env': 'A=config',
		});
		const result = await Effect.runPromise(readEnv(join(root, 'config/app.config.yaml'), { env: {} }));
		expect(result.variables).toEqual({ A: 'config', C: 'root-local' });
		expect(result.files).toEqual([join(root, 'config/.env'), join(root, '.env.local')]);
	});

	it('does not write process.env', async () => {
		const root = await makeProject({ 'package.json': '{}', '.env': 'TYFIGO_TEST_ONLY=1' });
		await Effect.runPromise(readEnv(join(root, 'app.config.yaml')));
		expect(processEnv().TYFIGO_TEST_ONLY).toBeUndefined();
	});
});
