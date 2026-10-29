import { join } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { yaml } from '../../src/core/formats/index.ts';
import { locate, mergeLayer } from '../../src/core/merge.ts';
import { pathKey, SourceIndex } from '../../src/core/positions.ts';
import { formatProblems } from '../../src/core/problems.ts';
import { resolveConfig } from '../../src/core/resolve.ts';
import { resolveConfigSync } from '../../src/core/sync.ts';
import { makeProject } from '../helpers.ts';

const merge = (baseText: string, layerText: string) => {
	const base = yaml.parse(baseText, 'app.config.yaml');
	const layer = yaml.parse(layerText, 'app.production.config.yaml');
	return mergeLayer(
		{ value: base.value, positions: locate('/x/app.config.yaml', base.positions) },
		{
			file: 'app.production.config.yaml',
			value: layer.value,
			positions: layer.positions,
			source: new SourceIndex(layerText),
		},
	);
};

describe('mergeLayer', () => {
	it('merges objects and replaces arrays and primitives', () => {
		const result = merge('db:\n  host: a\n  port: 1\ntags: [a, b, c]\n', 'db:\n  port: 2\ntags: [d]\n');
		expect(result.problems).toEqual([]);
		expect(result.value).toEqual({ db: { host: 'a', port: 2 }, tags: ['d'] });
		expect(result.positions.get(pathKey(['db', 'port']))?.file).toBe('app.production.config.yaml');
		expect(result.positions.get(pathKey(['db', 'host']))?.file).toBe('/x/app.config.yaml');
		expect(result.positions.get(pathKey(['tags', 0]))?.file).toBe('app.production.config.yaml');
		expect(result.positions.has(pathKey(['tags', 2]))).toBe(false);
	});

	it('reports a key the base does not have, on the key', () => {
		const result = merge('db:\n  host: a\n', 'db:\n  hots: b\n');
		expect(result.value).toEqual({ db: { host: 'a' } });
		expect(result.problems).toEqual([
			expect.objectContaining({
				file: 'app.production.config.yaml',
				code: 'unknown-key',
				line: 2,
				column: 3,
				length: 4,
				message:
					"'db.hots' is not in app.config.yaml; environment and local files can only override existing keys",
			}),
		]);
	});

	it('reports a different type, on the value', () => {
		const result = merge('port: 1\ndb:\n  host: a\nlist: [1]\n', 'port: "1"\ndb: [x]\nlist: {a: 1}\n');
		expect(result.value).toEqual({ port: 1, db: { host: 'a' }, list: [1] });
		expect(result.problems.map((problem) => [problem.code, problem.line, problem.column, problem.message])).toEqual(
			[
				['type-mismatch', 1, 7, "Expected number at 'port' as in app.config.yaml, got string"],
				['type-mismatch', 2, 5, "Expected object at 'db' as in app.config.yaml, got array"],
				['type-mismatch', 3, 7, "Expected array at 'list' as in app.config.yaml, got object"],
			],
		);
	});
});

describe('resolveConfig', () => {
	it('layers files, reads .env and resolves placeholders', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'.env': 'DB_HOST=from-env-file\nPORT=1000',
			'.env.production': 'PORT=2000',
			'app.config.yaml': 'port: ${PORT:-3000}\ndb:\n  host: ${DB_HOST}\n  pool: 5\nname: app\n',
			'app.production.config.yaml': 'db:\n  pool: 20\n',
			'app.local.config.yaml': 'name: local\n',
			'app.production.local.config.yaml': 'db:\n  host: ${DB_HOST}-local\n',
		});
		const result = await Effect.runPromise(
			resolveConfig(join(root, 'app.config.yaml'), { env: { NODE_ENV: 'production', DB_HOST: 'real' } }),
		);
		expect(result.problems).toEqual([]);
		expect(result.environment).toBe('production');
		expect(result.value).toEqual({ port: 2_000, db: { host: 'real-local', pool: 20 }, name: 'local' });
		expect(result.layers.map((layer) => layer.kind)).toEqual(['base', 'environment', 'local', 'environment-local']);
		expect(result.envFiles).toEqual([join(root, '.env'), join(root, '.env.production')]);
		expect(result.positions.get(pathKey(['db', 'pool']))?.file).toBe(join(root, 'app.production.config.yaml'));
		expect(result.positions.get(pathKey(['port']))?.file).toBe(join(root, 'app.config.yaml'));
	});

	it('merges the layers of a .config directory and reads .env files from the directory containing it', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'.env': 'DB_HOST=root-host\nPORT=1000',
			'api/.env.production': 'PORT=2000',
			'api/.config/.env.production': 'PORT=9999',
			'api/.config/app.yaml': 'port: ${PORT:-3000}\ndb:\n  host: ${DB_HOST}\n  pool: 5\nname: app\n',
			'api/.config/app.production.yaml': 'db:\n  pool: 20\n',
			'.config/app.local.yaml': 'name: local\n',
		});
		const result = resolveConfigSync(join(root, 'api/.config/app.yaml'), { env: { NODE_ENV: 'production' } });
		expect(result.problems).toEqual([]);
		expect(result.value).toEqual({ port: 2_000, db: { host: 'root-host', pool: 20 }, name: 'local' });
		expect(result.layers.map((layer) => layer.file)).toEqual([
			join(root, 'api/.config/app.yaml'),
			join(root, 'api/.config/app.production.yaml'),
			join(root, '.config/app.local.yaml'),
		]);
		expect(result.envFiles).toEqual([join(root, '.env'), join(root, 'api/.env.production')]);
	});

	it('lets the environment option win over NODE_ENV', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'app.config.toml': 'level = "info"\n',
			'app.test.config.toml': 'level = "debug"\n',
		});
		const result = resolveConfigSync(join(root, 'app.config.toml'), {
			env: { NODE_ENV: 'production' },
			environment: 'test',
		});
		expect(result.value).toEqual({ level: 'debug' });
	});

	it('collects every problem from every layer', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'app.config.jsonc': '{ "port": 1, "url": "${URL:?URL must be set}" }',
			'app.production.config.jsonc': '{ "port": "x", "extra": true }',
		});
		const file = join(root, 'app.config.jsonc');
		const result = resolveConfigSync(file, { env: {}, environment: 'production' });
		expect(result.value).toEqual({ port: 1, url: '${URL:?URL must be set}' });
		expect(formatProblems(result.problems)).toBe(
			[
				`${file}:1:22 - URL must be set (missing-variable)`,
				`${join(root, 'app.production.config.jsonc')}:1:11 - Expected number at 'port' as in app.config.jsonc, got string (type-mismatch)`,
				`${join(root, 'app.production.config.jsonc')}:1:16 - 'extra' is not in app.config.jsonc; environment and local files can only override existing keys (unknown-key)`,
			].join('\n'),
		);
	});

	it.each([
		['yaml', 'port: ${PORT:-3000}\nraw: ${PORT}\ntimeout: 30\n', 'timeout: ${TIMEOUT}\n', 10],
		['toml', 'port = "${PORT:-3000}"\nraw = "${PORT}"\ntimeout = 30\n', 'timeout = "${TIMEOUT}"\n', 12],
		['ini', 'port = ${PORT:-3000}\nraw = ${PORT}\ntimeout = 30\n', 'timeout = ${TIMEOUT}\n', 11],
	])(
		'types whole-value placeholders in %s by their default or the base key',
		async (extension, base, layer, column) => {
			const root = await makeProject({
				'package.json': '{}',
				[`app.config.${extension}`]: base,
				[`app.production.config.${extension}`]: layer,
			});
			const file = join(root, `app.config.${extension}`);
			const resolveWith = (env: Record<string, string>) =>
				resolveConfigSync(file, { env, environment: 'production' });

			const result = resolveWith({ PORT: '8080', TIMEOUT: '60' });
			expect(result.problems).toEqual([]);
			expect(result.value).toEqual({ port: 8_080, raw: '8080', timeout: 60 });

			expect(formatProblems(resolveWith({ PORT: 'abc', TIMEOUT: 'abc' }).problems)).toBe(
				[
					`${file}:1:${column - 3} - Expected number at 'port', but environment variable 'PORT' is "abc" (placeholder-type)`,
					`${join(root, `app.production.config.${extension}`)}:1:${column} - Expected number at 'timeout', but environment variable 'TIMEOUT' is "abc" (placeholder-type)`,
				].join('\n'),
			);
			expect(resolveWith({ PORT: '1' }).problems.map((problem) => problem.code)).toEqual(['missing-variable']);
		},
	);

	it('reports a missing base file', async () => {
		const root = await makeProject({ 'package.json': '{}' });
		const result = resolveConfigSync(join(root, 'app.config.json5'), { env: {} });
		expect(result.value).toBeUndefined();
		expect(result.problems).toEqual([expect.objectContaining({ code: 'file-not-found', line: 1, column: 1 })]);
	});

	it('reports a file it does not claim', () => {
		expect(resolveConfigSync('/tmp/app.json', { env: {} }).problems).toEqual([
			expect.objectContaining({ code: 'unsupported-file' }),
		]);
	});

	it('leaves the value undefined when the base file does not parse', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'app.config.toml': 'a = \n',
			'app.local.config.toml': 'a = 1\n',
		});
		const result = resolveConfigSync(join(root, 'app.config.toml'), { env: {} });
		expect(result.value).toBeUndefined();
		expect(result.problems).toEqual([expect.objectContaining({ code: 'parse-error' })]);
		expect(result.layers).toHaveLength(2);
	});
});
