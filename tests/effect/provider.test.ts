import { join } from 'node:path';

import { describe, expect, it } from '@effect/vitest';
import { Config, ConfigProvider, Effect, Layer, Redacted, Schema } from 'effect';

import {
	ConfigValidationError,
	configProvider,
	configProviderFromFile,
	layerConfigProvider,
	layerConfigProviderFromFile,
} from '../../src/effect.ts';
import { resolveConfigModule } from '../../src/runtime/resolve.ts';
import { makeProject } from '../helpers.ts';

const project = Effect.promise(async () =>
	makeProject({
		'package.json': '{}',
		'app.config.yaml': 'server:\n  host: localhost\n  port: 8080\ntags: [a, b]\napiKey: ${API_KEY}\nempty: ""\n',
		'app.production.config.yaml': 'server:\n  port: 443\n',
		'.env': 'API_KEY=secret',
	}),
);

const env = ConfigProvider.layer(ConfigProvider.fromEnv({ env: { HOST: 'env-host', port: '1' } }));

describe('configProvider', () => {
	it.effect('maps nested keys and array items to path segments', () =>
		Effect.gen(function* () {
			const cwd = yield* project;
			const provider = configProvider(resolveConfigModule(join(cwd, 'app.config.yaml')));
			const port = yield* Config.Number('port').pipe(Config.nested('server')).parse(provider);
			const tags = yield* Config.schema(Schema.Array(Schema.String), 'tags').parse(provider);
			const tag = yield* provider.load(['tags', 1]);
			const server = yield* Config.schema(
				Schema.Struct({ host: Schema.String, port: Schema.Int, tags: Schema.Array(Schema.String) }),
			).parse(
				ConfigProvider.orElse(
					ConfigProvider.nested(provider, 'server'),
					ConfigProvider.fromUnknown({ tags: [] }),
				),
			);
			const apiKey = yield* Config.Redacted('apiKey').parse(provider);
			const empty = yield* Config.String('empty').parse(provider);
			expect({ port, tags, tag, server, apiKey: Redacted.value(apiKey), empty }).toEqual({
				port: 8_080,
				tags: ['a', 'b'],
				tag: { _tag: 'Value', value: 'b' },
				server: { host: 'localhost', port: 8_080, tags: [] },
				apiKey: 'secret',
				empty: '',
			});
		}),
	);
});

describe('layerConfigProvider', () => {
	it.effect('reads the config first and falls back to the environment', () =>
		Effect.gen(function* () {
			const cwd = yield* project;
			const config = resolveConfigModule(join(cwd, 'app.config.yaml'));
			const read = Effect.all([
				Config.String('HOST'),
				Config.Number('port'),
				Config.Number('port').pipe(Config.nested('server')),
			]);
			const primary = yield* read.pipe(
				Effect.provide(layerConfigProvider({ ...(config as object), port: 2 }).pipe(Layer.provide(env))),
			);
			expect(primary).toEqual(['env-host', 2, 8_080]);
			const fallback = yield* read.pipe(
				Effect.provide(
					layerConfigProvider({ port: 2, server: { port: 3 } }, { asPrimary: false }).pipe(
						Layer.provide(env),
					),
				),
			);
			expect(fallback).toEqual(['env-host', 1, 3]);
		}),
	);

	it.effect('resolves a config file with its layers', () =>
		Effect.gen(function* () {
			const cwd = yield* project;
			const port = yield* Config.Number('port').pipe(
				Config.nested('server'),
				Effect.provide(
					layerConfigProviderFromFile(join(cwd, 'app.config.yaml'), {
						environment: 'production',
						env: {},
					}).pipe(Layer.provide(env)),
				),
			);
			expect(port).toBe(443);
		}),
	);

	it.effect('fails with a ConfigError listing every problem', () =>
		Effect.gen(function* () {
			const cwd = yield* Effect.promise(async () =>
				makeProject({ 'package.json': '{}', 'app.config.yaml': 'a: ${MISSING}\nb: ${ALSO_MISSING}\n' }),
			);
			const file = join(cwd, 'app.config.yaml');
			const error = yield* Effect.flip(configProviderFromFile(file, { env: {} }));
			expect(error).toBeInstanceOf(ConfigValidationError);
			expect(error.subject).toBe(`config ${file}`);
			expect(error.issues.map((issue) => issue.location)).toEqual([`${file}:1:4`, `${file}:2:4`]);
		}),
	);
});
