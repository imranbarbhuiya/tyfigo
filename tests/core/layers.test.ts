import { join } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { discoverLayers } from '../../src/core/layers.ts';
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

	it('returns nothing for a file it does not claim', async () => {
		expect(await Effect.runPromise(discoverLayers('/tmp/app.yaml'))).toEqual([]);
	});
});
