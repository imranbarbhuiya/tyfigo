import { chmod } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { validationError } from './helpers.ts';

import { ConfigValidationError, loadConfig, loadConfigAsync, loadEnv, loadEnvAsync } from '../../src/index.ts';
import { resolveConfigModule } from '../../src/runtime/resolve.ts';
import { makeProject } from '../helpers.ts';

const file = '/project/app.config.yaml';

const withSource = <T extends object>(value: T, positions: Record<string, readonly [number, number]>): T =>
	Object.defineProperty(value, Symbol.for('tyfigo.source'), {
		value: {
			file,
			environment: undefined,
			layers: [file],
			envFiles: [],
			position: (path: readonly (string | number)[]) => {
				for (let depth = path.length; depth >= 0; depth--) {
					const position = positions[JSON.stringify(path.slice(0, depth))];
					if (position) return { file, line: position[0], column: position[1] };
				}
				return undefined;
			},
		},
	});

const schema = z.object({ server: z.object({ port: z.number().min(1), host: z.string() }) });

describe('loadConfig', () => {
	it('accepts a readonly, widened config import', () => {
		const imported: { readonly mode: string; readonly hosts: readonly string[] } = { mode: 'dev', hosts: [] };
		const config = loadConfig(imported, z.object({ mode: z.enum(['dev', 'prod']), hosts: z.array(z.string()) }));
		expectTypeOf(config).toEqualTypeOf<{ mode: 'dev' | 'prod'; hosts: string[] }>();
	});

	it('rejects a config whose types cannot match the schema', () => {
		// @ts-expect-error port must be a number
		expect(() => loadConfig({ server: { port: '80', host: 'a' } }, schema)).toThrow(ConfigValidationError);
	});

	it('adds file:line:column from a config import', () => {
		const config = withSource(
			{ server: { port: 0 } },
			{ '[]': [1, 1], '["server"]': [1, 1], '["server","port"]': [2, 9] },
		);
		const error = validationError(() => loadConfig(config as never, schema));
		expect(error.subject).toBe(`config ${file}`);
		expect(error.issues.map((issue) => issue.location)).toEqual([`${file}:2:9`, `${file}:1:1`]);
		expect(error.message).toBe(
			[
				`Invalid config ${file}:`,
				`  ${file}:2:9 - server.port: Too small: expected number to be >=1`,
				`  ${file}:1:1 - server.host: Invalid input: expected string, received undefined`,
			].join('\n'),
		);
	});

	it('locates issues in a real config import', async () => {
		const root = await makeProject({ 'app.config.yaml': 'server:\n  port: 0\n  host: a\n' });
		const config = resolveConfigModule(join(root, 'app.config.yaml'), { environment: 'test' });
		const error = validationError(() => loadConfig(config as never, schema));
		expect(error.issues[0]?.location).toBe(`${join(root, 'app.config.yaml')}:2:9`);
	});

	it('falls back to the file when no key has a position', () => {
		const config = withSource({ server: { port: 0, host: 'a' } }, {});
		expect(validationError(() => loadConfig(config, schema)).issues[0]?.location).toBe(file);
	});

	it('ignores a malformed source', () => {
		const config = Object.defineProperty({ server: { port: 0, host: 'a' } }, Symbol.for('tyfigo.source'), {
			value: { file: 1 },
		});
		const error = validationError(() => loadConfig(config, schema));
		expect(error.subject).toBe('config');
		expect(error.issues[0]?.location).toBeUndefined();
	});

	it('throws a TypeError for an async schema and validates it with loadConfigAsync', async () => {
		const unique = z.string().refine(async (value) => value !== 'taken');
		expect(() => loadConfig('free', unique)).toThrow(TypeError);
		await expect(loadConfigAsync('free', unique)).resolves.toBe('free');
		await expect(loadConfigAsync('taken', unique)).rejects.toBeInstanceOf(ConfigValidationError);
	});
});

describe('loadEnv', () => {
	it('layers .env files by the environment from NODE_ENV and searches up to the project root', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'.env': 'A=env\nB=env',
			'.env.production': 'B=production',
			'packages/app/.env.local': 'C=local',
		});
		const env = loadEnv(z.object({ A: z.string(), B: z.string(), C: z.string(), NODE_ENV: z.string() }), {
			cwd: join(root, 'packages/app'),
			env: { NODE_ENV: 'production' },
		});
		expect(env).toEqual({ A: 'env', B: 'production', C: 'local', NODE_ENV: 'production' });
	});

	it('lets the real environment win and an option pick the environment', async () => {
		const cwd = await makeProject({ 'package.json': '{}', '.env.test': 'A=test\nB=test' });
		const env = loadEnv(z.object({ A: z.string(), B: z.string() }), {
			cwd,
			environment: 'test',
			env: { B: 'real' },
		});
		expect(env).toEqual({ A: 'test', B: 'real' });
	});

	it('reports an unreadable .env file with the schema issues', async () => {
		const cwd = await makeProject({ 'package.json': '{}', '.env': 'A=1' });
		await chmod(join(cwd, '.env'), 0o000);
		const error = validationError(() => loadEnv(z.object({ A: z.string() }), { cwd, env: {} }));
		expect(error.issues.map((issue) => [issue.path, issue.location])).toEqual([
			[[], `${join(cwd, '.env')}:1:1`],
			[['A'], undefined],
		]);
	});

	it('validates an async schema with loadEnvAsync', async () => {
		const cwd = await makeProject({ 'package.json': '{}', '.env': 'A=1' });
		const env = z.object({ A: z.string().refine(async (value) => value === '1') });
		expect(() => loadEnv(env, { cwd, env: {} })).toThrow(TypeError);
		await expect(loadEnvAsync(env, { cwd, env: {} })).resolves.toEqual({ A: '1' });
	});
});
