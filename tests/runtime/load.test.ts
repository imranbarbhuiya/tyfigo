import { writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { configSource, getConfigSource, load } from '../../src/runtime/index.ts';
import { makeProject } from '../helpers.ts';

import type { ConfigModuleError } from '../../src/runtime/index.ts';

const runtime = fileURLToPath(new URL('../../src/runtime/index.ts', import.meta.url));

const evaluate = async (directory: string, code: string): Promise<unknown> => {
	const file = join(directory, 'module.ts');
	await writeFile(file, code);
	const module = (await import(pathToFileURL(file).href)) as { default: unknown };
	return module.default;
};

const evaluateError = async (directory: string, code: string) => {
	try {
		await evaluate(directory, code);
	} catch (error) {
		return error as ConfigModuleError;
	}
	throw new Error('Expected the module to throw');
};

const evaluateUnder = async (code: string, environment: string) => {
	vi.stubEnv('NODE_ENV', environment);
	vi.spyOn(process, 'cwd').mockReturnValue(await makeProject({}));
	return (await evaluate(await makeProject({}), code)) as Record<string, unknown>;
};

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe('load (server)', () => {
	it('generates a module that resolves layers, .env and placeholders when it runs', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'.env': 'DB_HOST=from-env-file\nPORT=1000',
			'.env.production': 'PORT=2000',
			'config/app.config.yaml': 'port: ${PORT:-3000}\ndb:\n  host: ${DB_HOST}\n  pool: 5\nname: app\n',
			'config/app.production.config.yaml': 'db:\n  pool: 20\n',
			'app.local.config.yaml': 'name: local\n',
		});
		vi.stubEnv('DB_HOST', 'real');
		const file = join(root, 'config/app.config.yaml');
		const result = load(file, { target: 'server', environment: 'production', runtime });
		expect(result.problems).toEqual([]);
		expect(result.code).toBe(
			`import { resolveConfigModule } from ${JSON.stringify(runtime)};\n\nexport default resolveConfigModule(${JSON.stringify(file)}, { environment: "production" });\n`,
		);

		const config = (await evaluate(root, result.code)) as Record<string, unknown>;
		expect(config).toEqual({ port: 2_000, db: { host: 'real', pool: 20 }, name: 'local' });
		expect(Object.isFrozen(config)).toBe(true);
		expect(Object.isFrozen(config.db)).toBe(true);
		expect(Object.keys(config)).toEqual(['port', 'db', 'name']);

		const source = getConfigSource(config);
		expect(source).toBe((config as { [configSource]: unknown })[configSource]);
		expect(source?.file).toBe(file);
		expect(source?.environment).toBe('production');
		expect(source?.layers).toEqual([
			file,
			join(root, 'config/app.production.config.yaml'),
			join(root, 'app.local.config.yaml'),
		]);
		expect(source?.envFiles).toEqual([join(root, '.env'), join(root, '.env.production')]);
		expect(source?.position(['db', 'pool'])).toEqual({
			file: join(root, 'config/app.production.config.yaml'),
			line: 2,
			column: 9,
		});
		expect(source?.position(['db', 'missing'])).toEqual({ file, line: 3, column: 3 });
		expect(source?.position(['name'])).toEqual({ file: join(root, 'app.local.config.yaml'), line: 1, column: 7 });
	});

	it('uses NODE_ENV when no environment is given', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'app.config.toml': 'level = "info"\n',
			'app.staging.config.toml': 'level = "debug"\n',
		});
		vi.stubEnv('NODE_ENV', 'staging');
		const result = load(join(root, 'app.config.toml'), { target: 'server', runtime });
		expect(result.code).not.toContain('environment');
		expect(await evaluate(root, result.code)).toEqual({ level: 'debug' });
	});

	it('throws one error listing every problem with its position', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'app.config.yaml': 'db:\n  host: ${DB_HOST}\n  user: ${DB_USER:?set DB_USER}\n',
			'app.local.config.yaml': 'db:\n  hots: x\n',
		});
		const result = load(join(root, 'app.config.yaml'), { target: 'server', runtime });
		const error = await evaluateError(root, result.code);
		expect(error._tag).toBe('ConfigModuleError');
		expect(error.problems.map((problem) => problem.code)).toEqual([
			'missing-variable',
			'missing-variable',
			'unknown-key',
		]);
		expect(error.message).toBe(
			[
				`Invalid config ${join(root, 'app.config.yaml')}`,
				`${join(root, 'app.config.yaml')}:2:9 - Environment variable 'DB_HOST' is not set (missing-variable)`,
				`${join(root, 'app.config.yaml')}:3:9 - set DB_USER (missing-variable)`,
				`${join(root, 'app.local.config.yaml')}:2:3 - 'db.hots' is not in app.config.yaml; environment and local files can only override existing keys (unknown-key)`,
			].join('\n'),
		);
	});

	it('converts whole-value placeholders to their default or base type when it runs', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'app.config.toml': 'port = "${PORT:-3000}"\nraw = "${PORT}"\ntimeout = 30\n',
			'app.production.config.toml': 'timeout = "${TIMEOUT}"\n',
		});
		const result = load(join(root, 'app.config.toml'), { target: 'server', environment: 'production', runtime });
		vi.stubEnv('PORT', '8080');
		vi.stubEnv('TIMEOUT', '60');
		expect(await evaluate(root, result.code)).toEqual({ port: 8_080, raw: '8080', timeout: 60 });

		vi.stubEnv('TIMEOUT', 'abc');
		const error = await evaluateError(await makeProject({}), result.code);
		expect(error.message).toBe(
			[
				`Invalid config ${join(root, 'app.config.toml')}`,
				`${join(root, 'app.production.config.toml')}:1:12 - Expected number at 'timeout', but environment variable 'TIMEOUT' is "abc" (placeholder-type)`,
			].join('\n'),
		);
	});

	it('watches every layer and .env file that could apply, existing or not', async () => {
		const root = await makeProject({ 'package.json': '{}', 'config/app.config.jsonc': '{}' });
		const result = load(join(root, 'config/app.config.jsonc'), {
			target: 'server',
			environment: 'test',
			runtime,
		});
		const config = join(root, 'config');
		expect(result.watchFiles).toEqual([
			join(config, 'app.config.jsonc'),
			join(config, 'app.test.config.jsonc'),
			join(config, 'app.local.config.jsonc'),
			join(root, 'app.local.config.jsonc'),
			join(config, 'app.test.local.config.jsonc'),
			join(root, 'app.test.local.config.jsonc'),
			join(config, '.env'),
			join(root, '.env'),
			join(config, '.env.local'),
			join(root, '.env.local'),
			join(config, '.env.test'),
			join(root, '.env.test'),
			join(config, '.env.test.local'),
			join(root, '.env.test.local'),
		]);
	});

	it('watches the layers of a .config file in the .config directories and .env files above them', async () => {
		const root = await makeProject({ 'package.json': '{}', 'api/.config/app.toml': '' });
		const result = load(join(root, 'api/.config/app.toml'), { target: 'server', environment: 'test', runtime });
		const config = join(root, 'api/.config');
		const api = join(root, 'api');
		expect(result.watchFiles).toEqual([
			join(config, 'app.toml'),
			join(config, 'app.test.toml'),
			join(config, 'app.local.toml'),
			join(root, '.config/app.local.toml'),
			join(config, 'app.test.local.toml'),
			join(root, '.config/app.test.local.toml'),
			join(api, '.env'),
			join(root, '.env'),
			join(api, '.env.local'),
			join(root, '.env.local'),
			join(api, '.env.test'),
			join(root, '.env.test'),
			join(api, '.env.test.local'),
			join(root, '.env.test.local'),
		]);
	});

	it('reports a missing or unsupported file', async () => {
		const root = await makeProject({ 'package.json': '{}' });
		expect(load(join(root, 'app.config.yaml'), { target: 'server' }).problems).toEqual([
			expect.objectContaining({ code: 'file-not-found' }),
		]);
		expect(load(join(root, 'app.yaml'), { target: 'server' }).problems).toEqual([
			expect.objectContaining({ code: 'unsupported-file' }),
		]);
	});
});

describe('load (browser)', () => {
	it('inlines the base and environment files only', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'.env': 'NAME=from-env',
			'app.config.yaml': 'name: app\nlimits:\n  max: 5\n  ratio: .inf\ntags: [a]\nempty: {}\n"__proto__": 1\n',
			'app.production.config.yaml': 'limits:\n  max: 10\n',
			'app.local.config.yaml': 'name: local\n',
		});
		const result = load(join(root, 'app.config.yaml'), { target: 'browser', environment: 'production' });
		expect(result.problems).toEqual([]);
		expect(result.watchFiles).toEqual([join(root, 'app.config.yaml'), join(root, 'app.production.config.yaml')]);
		expect(result.code).toBe(
			[
				'export default Object.freeze({',
				'\t"name": "app",',
				'\t"limits": Object.freeze({',
				'\t\t"max": 10,',
				'\t\t"ratio": Infinity,',
				'\t}),',
				'\t"tags": Object.freeze([',
				'\t\t"a",',
				'\t]),',
				'\t"empty": Object.freeze({}),',
				'\t["__proto__"]: 1,',
				'});',
				'',
			].join('\n'),
		);

		const config = (await evaluate(root, result.code)) as Record<string, unknown>;
		expect(Object.getPrototypeOf(config)).toBe(Object.prototype);
		expect(Object.hasOwn(config, '__proto__')).toBe(true);
		expect(Object.isFrozen(config.limits)).toBe(true);
		expect(getConfigSource(config)).toBeUndefined();
	});

	it('reports every placeholder, even one with a default or one an environment file overrides', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'.env': 'API=https://example.com',
			'app.config.yaml': 'api: ${API}\nport: ${PORT:-3000}\nprice: $${literal}\n',
			'app.production.config.yaml': 'api: https://prod.example.com\nport: 80\n',
		});
		const result = load(join(root, 'app.config.yaml'), { target: 'browser', environment: 'production' });
		expect(result.problems.map((problem) => [problem.code, problem.line, problem.column, problem.message])).toEqual(
			[
				[
					'browser-placeholder',
					1,
					6,
					"'api' uses an environment placeholder, which browser builds cannot read",
				],
				[
					'browser-placeholder',
					2,
					7,
					"'port' uses an environment placeholder, which browser builds cannot read",
				],
			],
		);
		expect(result.code).toMatch(/^throw new Error\(/u);
		expect(result.code).toContain('export default undefined;');
	});

	it('reports a missing file', () => {
		const result = load('/nowhere/app.config.toml', { target: 'browser' });
		expect(result.problems).toEqual([expect.objectContaining({ code: 'file-not-found' })]);
	});
});

describe('load (bundled server)', () => {
	it('inlines the layer files and reads .env files from the working directory when it runs', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'.env': 'DB_HOST=build-machine',
			'config/app.config.yaml': 'port: ${PORT:-3000}\ndb:\n  host: ${DB_HOST}\n  pool: 5\nname: app\n',
			'config/app.production.config.yaml': 'db:\n  pool: 20\n',
			'config/app.staging.config.yaml': 'db:\n  pool: 1\n',
			'app.local.config.yaml': 'name: local\n',
		});
		const result = load(join(root, 'config/app.config.yaml'), {
			target: 'server',
			bundle: true,
			environment: 'production',
			runtime,
		});
		expect(result.problems).toEqual([]);
		expect(result.code).not.toContain(root);
		expect(result.code).not.toContain('staging');
		expect(result.watchFiles).toContain(join(root, '.env.production'));

		const deploy = await makeProject({ '.env': 'DB_HOST=deployed', '.env.production': 'PORT=8080' });
		vi.spyOn(process, 'cwd').mockReturnValue(deploy);
		const config = (await evaluate(root, result.code)) as Record<string, unknown>;
		expect(config).toEqual({ port: 8_080, db: { host: 'deployed', pool: 20 }, name: 'local' });
		expect(Object.isFrozen(config.db)).toBe(true);

		const source = getConfigSource(config);
		expect(source?.file).toBe('config/app.config.yaml');
		expect(source?.environment).toBe('production');
		expect(source?.layers).toEqual([
			'config/app.config.yaml',
			'config/app.production.config.yaml',
			'app.local.config.yaml',
		]);
		expect(source?.envFiles).toEqual([join(deploy, '.env'), join(deploy, '.env.production')]);
		expect(source?.position(['db', 'pool'])).toEqual({
			file: 'config/app.production.config.yaml',
			line: 2,
			column: 9,
		});
	});

	it('leaves environment values to run time', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'app.config.yaml': 'port: ${PORT:-3000}\ntimeout: 30\n',
			'app.production.config.yaml': 'timeout: ${TIMEOUT}\n',
		});
		vi.stubEnv('PORT', 'build-machine');
		const result = load(join(root, 'app.config.yaml'), {
			target: 'server',
			bundle: true,
			environment: 'production',
			runtime,
		});
		expect(result.problems).toEqual([]);

		vi.stubEnv('PORT', '8080');
		vi.stubEnv('TIMEOUT', '60');
		vi.spyOn(process, 'cwd').mockReturnValue(await makeProject({}));
		expect(await evaluate(root, result.code)).toEqual({ port: 8_080, timeout: 60 });
	});

	it('reports file problems when it builds and missing variables when it runs', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'app.config.toml': 'url = "${DATABASE_URL}"\nname = "${NAME:?set NAME}"\n',
			'app.local.config.toml': 'url = 1\n',
		});
		const invalid = load(join(root, 'app.config.toml'), { target: 'server', bundle: true, runtime });
		expect(invalid.problems.map((problem) => problem.code)).toEqual(['type-mismatch']);
		expect(invalid.code).toMatch(/^throw new Error\(/u);

		await writeFile(join(root, 'app.local.config.toml'), 'url = "local"\n');
		const result = load(join(root, 'app.config.toml'), { target: 'server', bundle: true, runtime });
		expect(result.problems).toEqual([]);

		vi.spyOn(process, 'cwd').mockReturnValue(await makeProject({}));
		const error = await evaluateError(root, result.code);
		expect(error.message).toBe(
			[
				'Invalid config app.config.toml',
				"app.config.toml:1:8 - Environment variable 'DATABASE_URL' is not set (missing-variable)",
				'app.config.toml:2:9 - set NAME (missing-variable)',
			].join('\n'),
		);
	});

	const deployFiles = {
		'package.json': '{}',
		'config/app.config.yaml': 'tier: base\ndb:\n  pool: 5\n',
		'config/app.production.config.yaml': 'tier: production\n',
		'config/app.staging.config.yaml': 'tier: staging\n',
		'app.production.local.config.yaml': 'db:\n  pool: 50\n',
		'app.local.config.yaml': 'db:\n  pool: 10\n',
	};

	it('inlines every environment and picks one by NODE_ENV when it runs', async () => {
		const root = await makeProject(deployFiles);
		vi.stubEnv('NODE_ENV', 'staging');
		const result = load(join(root, 'config/app.config.yaml'), { target: 'server', bundle: true, runtime });
		expect(result.problems).toEqual([]);
		const bundle = {
			file: 'config/app.config.yaml',
			layers: [
				{ file: 'config/app.config.yaml', kind: 'base', text: deployFiles['config/app.config.yaml'] },
				{
					file: 'config/app.production.config.yaml',
					kind: 'environment',
					environment: 'production',
					text: deployFiles['config/app.production.config.yaml'],
				},
				{
					file: 'config/app.staging.config.yaml',
					kind: 'environment',
					environment: 'staging',
					text: deployFiles['config/app.staging.config.yaml'],
				},
				{ file: 'app.local.config.yaml', kind: 'local', text: deployFiles['app.local.config.yaml'] },
				{
					file: 'app.production.local.config.yaml',
					kind: 'environment-local',
					environment: 'production',
					text: deployFiles['app.production.local.config.yaml'],
				},
			],
		};
		expect(result.code).toBe(
			`import { resolveBundledConfigModule } from ${JSON.stringify(runtime)};\n\nexport default resolveBundledConfigModule(${JSON.stringify(bundle)});\n`,
		);

		const production = await evaluateUnder(result.code, 'production');
		expect(production).toEqual({ tier: 'production', db: { pool: 50 } });
		expect(getConfigSource(production)?.layers).toEqual([
			'config/app.config.yaml',
			'config/app.production.config.yaml',
			'app.local.config.yaml',
			'app.production.local.config.yaml',
		]);
		expect(await evaluateUnder(result.code, 'staging')).toEqual({ tier: 'staging', db: { pool: 10 } });
		expect(await evaluateUnder(result.code, 'development')).toEqual({ tier: 'base', db: { pool: 10 } });
		expect(await evaluateUnder(result.code, '')).toEqual({ tier: 'base', db: { pool: 10 } });
	});

	it('uses only the base file when no environment file matches at run time', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'app.config.yaml': 'tier: base\n',
			'app.production.config.yaml': 'tier: production\n',
		});
		const result = load(join(root, 'app.config.yaml'), { target: 'server', bundle: true, runtime });
		const config = await evaluateUnder(result.code, 'preview');
		expect(config).toEqual({ tier: 'base' });
		expect(getConfigSource(config)?.layers).toEqual(['app.config.yaml']);
	});

	it('keeps the environment it was built for', async () => {
		const root = await makeProject(deployFiles);
		const result = load(join(root, 'config/app.config.yaml'), {
			target: 'server',
			bundle: true,
			environment: 'staging',
			runtime,
		});
		expect(result.code).not.toContain('production');
		const config = await evaluateUnder(result.code, 'production');
		expect(config).toEqual({ tier: 'staging', db: { pool: 10 } });
		expect(getConfigSource(config)?.environment).toBe('staging');
	});

	it('watches the layer and .env files of every environment it found and of NODE_ENV', async () => {
		const root = await makeProject(deployFiles);
		vi.stubEnv('NODE_ENV', 'development');
		const result = load(join(root, 'config/app.config.yaml'), { target: 'server', bundle: true, runtime });
		expect(result.watchFiles).toEqual(
			expect.arrayContaining([
				join(root, 'config/app.production.config.yaml'),
				join(root, 'config/app.staging.config.yaml'),
				join(root, 'app.production.local.config.yaml'),
				join(root, 'app.staging.local.config.yaml'),
				join(root, '.env.staging'),
				join(root, 'config/app.development.config.yaml'),
			]),
		);
	});

	it('reports problems in every environment file when it builds', async () => {
		const root = await makeProject({
			...deployFiles,
			'config/app.staging.config.yaml': 'tier: 1\n',
			'app.preview.local.config.yaml': 'db:\n  size: 1\n',
		});
		vi.stubEnv('NODE_ENV', 'production');
		const result = load(join(root, 'config/app.config.yaml'), { target: 'server', bundle: true, runtime });
		expect(result.problems.map((problem) => [relative(root, problem.file), problem.code])).toEqual([
			[join('app.preview.local.config.yaml'), 'unknown-key'],
			[join('config', 'app.staging.config.yaml'), 'type-mismatch'],
		]);
	});
});
