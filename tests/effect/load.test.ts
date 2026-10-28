import { inspect } from 'node:util';

import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Layer, Redacted, Schema, SchemaGetter } from 'effect';
import { expectTypeOf } from 'vitest';
import { z } from 'zod';

import {
	ConfigError,
	ConfigService,
	ConfigValidationError,
	layerConfig,
	layerEnv,
	loadConfig,
	loadEnv,
} from '../../src/effect.ts';
import * as promise from '../../src/index.ts';
import { resolveConfigModule } from '../../src/runtime/resolve.ts';
import { makeProject } from '../helpers.ts';

const schema = Schema.Struct({
	server: Schema.Struct({
		host: Schema.String,
		port: Schema.FiniteFromString.check(Schema.isInt(), Schema.isGreaterThan(0)),
	}),
});

class Prefix extends Context.Service<Prefix, string>()('test/Prefix') {}

describe('loadConfig', () => {
	it.effect('returns the decoded output', () =>
		Effect.gen(function* () {
			const config = yield* loadConfig({ server: { host: 'localhost', port: '8080' } }, schema);
			expect(config).toEqual({ server: { host: 'localhost', port: 8_080 } });
			expectTypeOf(config).toEqualTypeOf<{ readonly server: { readonly host: string; readonly port: number } }>();
		}),
	);

	it.effect('fails with a ConfigError listing every issue, like the Promise API', () =>
		Effect.gen(function* () {
			const input = { server: { host: 1, port: '0' } } as never;
			const error = yield* Effect.flip(loadConfig(input, schema));
			expect(error).toBeInstanceOf(ConfigError);
			expect(error._tag).toBe('ConfigValidationError');
			expect(error.issues.map((issue) => issue.path)).toEqual([
				['server', 'host'],
				['server', 'port'],
			]);
			expect(() => promise.loadConfig(input, schema)).toThrow(error.message);
		}),
	);

	it.effect('adds file:line:column from a config import', () =>
		Effect.gen(function* () {
			const cwd = yield* Effect.promise(async () =>
				makeProject({ 'package.json': '{}', 'app.config.yaml': 'server:\n  host: localhost\n  port: "0"\n' }),
			);
			const file = `${cwd}/app.config.yaml`;
			const config = resolveConfigModule(file) as never;
			const error = yield* Effect.flip(loadConfig(config, schema));
			expect(error.subject).toBe(`config ${file}`);
			expect(error.issues.map((issue) => issue.location)).toEqual([`${file}:3:9`]);
		}),
	);

	it.effect('decodes Effect Schemas that need services', () =>
		Effect.gen(function* () {
			const prefixed = Schema.String.pipe(
				Schema.decodeTo(Schema.String, {
					decode: SchemaGetter.transformEffect((value: string) =>
						Effect.map(Prefix, (prefix) => `${prefix}${value}`),
					),
					encode: SchemaGetter.passthrough(),
				}),
			);
			const name = yield* loadConfig('app', prefixed).pipe(Effect.provideService(Prefix, 'my-'));
			expectTypeOf<Effect.Services<ReturnType<typeof loadConfig<typeof prefixed>>>>().toEqualTypeOf<Prefix>();
			expect(name).toBe('my-app');
		}),
	);

	it.effect('validates async Standard Schemas', () =>
		Effect.gen(function* () {
			const config = yield* loadConfig(
				{ port: 80 },
				z.object({ port: z.number().refine(async (port) => port > 0) }),
			);
			expect(config).toEqual({ port: 80 });
		}),
	);
});

describe('loadEnv', () => {
	it.effect('reads .env files and the given environment', () =>
		Effect.gen(function* () {
			const cwd = yield* Effect.promise(async () =>
				makeProject({ 'package.json': '{}', '.env': 'PORT=3000\nHOST=a' }),
			);
			const env = yield* loadEnv(Schema.Struct({ PORT: Schema.FiniteFromString, HOST: Schema.String }), {
				cwd,
				env: { HOST: 'b' },
			});
			expect(env).toEqual({ PORT: 3_000, HOST: 'b' });
		}),
	);

	it.effect('keeps secrets out of errors', () =>
		Effect.gen(function* () {
			const secret = 'hunter2-secret-value';
			const secrets = Schema.Struct({
				API_KEY: Schema.RedactedFromValue(Schema.String),
				DB_PASSWORD: Schema.RedactedFromValue(Schema.String.check(Schema.isMinLength(64))),
				PORT: Schema.FiniteFromString,
			});
			const failing = loadEnv(secrets, { cwd: '/', env: { API_KEY: secret, DB_PASSWORD: secret, PORT: 'x' } });
			const exit = yield* Effect.exit(failing);
			const error = yield* Effect.flip(failing);
			expect(error.issues.map((issue) => issue.path)).toEqual([['DB_PASSWORD'], ['PORT']]);
			for (const text of [error.message, String(error), inspect(error), JSON.stringify(error), inspect(exit)]) {
				expect(text).not.toContain(secret);
			}

			const env = yield* loadEnv(secrets, {
				cwd: '/',
				env: { API_KEY: secret, DB_PASSWORD: secret.repeat(4), PORT: '1' },
			});
			expect(Redacted.value(env.API_KEY)).toBe(secret);
			expect(inspect(env)).not.toContain(secret);
			expectTypeOf(env.API_KEY).toEqualTypeOf<Redacted.Redacted<string>>();
		}),
	);
});

class AppConfig extends ConfigService<AppConfig>()('test/AppConfig', { server: { host: 'a', port: '1' } }, schema) {}
class Env extends Context.Service<Env, { readonly PORT: number }>()('test/Env') {}

describe('layers', () => {
	it.effect('provides a config service', () =>
		Effect.gen(function* () {
			const config = yield* AppConfig;
			expect(config.server.port).toBe(1);
			expectTypeOf(config.server.port).toEqualTypeOf<number>();
		}).pipe(Effect.provide(AppConfig.layer)),
	);

	it.effect('provides any service with layerConfig and layerEnv', () =>
		Effect.gen(function* () {
			class Server extends Context.Service<Server, typeof schema.Type>()('test/Server') {}
			const layer = Layer.mergeAll(
				layerConfig(Server, { server: { host: 'a', port: '2' } }, schema),
				layerEnv(Env, Schema.Struct({ PORT: Schema.FiniteFromString }), { cwd: '/', env: { PORT: '3' } }),
			);
			const [server, env] = yield* Effect.all([Server, Env]).pipe(Effect.provide(layer));
			expect([server.server.port, env.PORT]).toEqual([2, 3]);
		}),
	);

	it.effect('fails the layer with a ConfigError', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				Effect.asVoid(Env).pipe(
					Effect.provide(
						layerEnv(Env, Schema.Struct({ PORT: Schema.FiniteFromString }), { cwd: '/', env: {} }),
					),
				),
			);
			expect(error).toBeInstanceOf(ConfigValidationError);
		}),
	);
});
