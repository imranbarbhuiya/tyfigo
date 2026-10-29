import { join } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { discoverEnvironments, discoverLayers } from '../../src/core/layers.ts';
import { makeProject } from '../helpers.ts';

describe('discoverLayers', () => {
	it('lists the layers that exist in order', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'app.config.yaml': 'a: 1',
			'app.production.config.yaml': 'a: 2',
			'app.local.config.yaml': 'a: 3',
			'app.production.local.config.yaml': 'a: 4',
			'app.staging.config.yaml': 'a: 5',
		});
		const layers = await Effect.runPromise(discoverLayers(join(root, 'app.config.yaml'), 'production'));
		expect(layers).toEqual([
			{ file: join(root, 'app.config.yaml'), kind: 'base' },
			{ file: join(root, 'app.production.config.yaml'), kind: 'environment' },
			{ file: join(root, 'app.local.config.yaml'), kind: 'local' },
			{ file: join(root, 'app.production.local.config.yaml'), kind: 'environment-local' },
		]);
	});

	it('skips missing files and environment layers without an environment', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'app.config.toml': 'a = 1',
			'app.production.config.toml': 'a = 2',
			'app.local.config.toml': 'a = 3',
		});
		const base = join(root, 'app.config.toml');
		expect(await Effect.runPromise(discoverLayers(base))).toEqual([
			{ file: base, kind: 'base' },
			{ file: join(root, 'app.local.config.toml'), kind: 'local' },
		]);
		expect(await Effect.runPromise(discoverLayers(base, 'test'))).toEqual([
			{ file: base, kind: 'base' },
			{ file: join(root, 'app.local.config.toml'), kind: 'local' },
		]);
	});

	it('finds local files at the project root when they are not next to the base file', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'app.local.config.yaml': 'a: 3',
			'app.production.local.config.yaml': 'a: 4',
			'config/app.config.yaml': 'a: 1',
			'config/app.production.local.config.yaml': 'a: 5',
		});
		const layers = await Effect.runPromise(discoverLayers(join(root, 'config/app.config.yaml'), 'production'));
		expect(layers.map((layer) => layer.file)).toEqual([
			join(root, 'config/app.config.yaml'),
			join(root, 'app.local.config.yaml'),
			join(root, 'config/app.production.local.config.yaml'),
		]);
	});

	it('lists the layers of a file in a .config directory, with local files in the project root .config directory', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'.config/app.local.yaml': 'a: 3',
			'app.local.yaml': 'a: 0',
			'api/.config/app.yaml': 'a: 1',
			'api/.config/app.production.yaml': 'a: 2',
			'api/.config/app.production.local.yaml': 'a: 4',
			'api/.config/app.staging.yaml': 'a: 5',
		});
		const base = join(root, 'api/.config/app.yaml');
		expect(await Effect.runPromise(discoverLayers(base, 'production'))).toEqual([
			{ file: base, kind: 'base' },
			{ file: join(root, 'api/.config/app.production.yaml'), kind: 'environment' },
			{ file: join(root, '.config/app.local.yaml'), kind: 'local' },
			{ file: join(root, 'api/.config/app.production.local.yaml'), kind: 'environment-local' },
		]);
		expect(await Effect.runPromise(discoverEnvironments(base))).toEqual(['production', 'staging']);
	});

	it('returns nothing for a file it does not claim', async () => {
		expect(await Effect.runPromise(discoverLayers('/tmp/app.yaml'))).toEqual([]);
	});
});

describe('discoverEnvironments', () => {
	it('lists environments with a file next to the base file or a local file in the project root', async () => {
		const root = await makeProject({
			'package.json': '{}',
			'config/app.config.yaml': 'a: 1',
			'config/app.staging.config.yaml': 'a: 2',
			'config/app.production.config.yaml': 'a: 3',
			'config/app.local.config.yaml': 'a: 4',
			'config/app.test.config.toml': 'a = 5',
			'config/cache.qa.config.yaml': 'a: 6',
			'config/app.a.b.config.yaml': 'a: 7',
			'app.preview.local.config.yaml': 'a: 8',
			'app.dev.config.yaml': 'a: 9',
		});
		expect(await Effect.runPromise(discoverEnvironments(join(root, 'config/app.config.yaml')))).toEqual([
			'preview',
			'production',
			'staging',
		]);
	});
});
