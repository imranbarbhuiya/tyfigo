import { Context, Layer } from 'effect';

import { ConfigValidationError, decodeConfig } from '../schema.ts';

import type { ConfigSchema, LooseInput, SchemaInput, SchemaOutput } from '../schema.ts';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Effect, Schema } from 'effect';

/**
 * A Standard Schema or any Effect Schema, including one that needs services to decode.
 */
export type EffectConfigSchema = StandardSchemaV1 | Schema.Top;

/**
 * The services an Effect Schema needs to decode, or `never` for a Standard Schema.
 */
export type SchemaServices<S> = S extends StandardSchemaV1
	? never
	: S extends Schema.Top
		? S['DecodingServices']
		: never;

/**
 * The error of every tyfigo Effect: a config or the environment does not match its schema, or a config file could not
 * be resolved. It is the same class the Promise API throws, tagged `ConfigValidationError`.
 */
export const ConfigError = ConfigValidationError;
export type ConfigError = ConfigValidationError;

/**
 * Validates a config import (or any value) with a Standard Schema or an Effect Schema. Effect Schemas are decoded by
 * Effect itself, so schemas that need services or decode asynchronously work, and so do async Standard Schemas.
 */
export const loadConfig = <S extends EffectConfigSchema>(
	config: LooseInput<SchemaInput<S>>,
	schema: S,
): Effect.Effect<SchemaOutput<S>, ConfigError, SchemaServices<S>> =>
	decodeConfig(config, schema as ConfigSchema, { async: true, native: true }) as Effect.Effect<
		SchemaOutput<S>,
		ConfigError,
		SchemaServices<S>
	>;

/**
 * A layer that provides `service` with the validated config.
 */
export const layerConfig = <I, S extends EffectConfigSchema>(
	service: Context.Key<I, SchemaOutput<S>>,
	config: LooseInput<SchemaInput<S>>,
	schema: S,
): Layer.Layer<I, ConfigError, SchemaServices<S>> => Layer.effect(service, loadConfig(config, schema));

/**
 * Defines a service class for a validated config, with a `layer` that provides it.
 *
 * @example
 * ```ts
 * class AppConfig extends ConfigService<AppConfig>()('app/AppConfig', config, schema) {}
 *
 * const program = Effect.gen(function* () {
 * 	const { port } = yield* AppConfig;
 * }).pipe(Effect.provide(AppConfig.layer));
 * ```
 */
export const ConfigService =
	<Self>() =>
	<const Identifier extends string, S extends EffectConfigSchema>(
		id: Identifier,
		config: LooseInput<SchemaInput<S>>,
		schema: S,
	) => {
		const service = Context.Service<Self, SchemaOutput<S>>()(id);
		return Object.assign(service, {
			layer: Layer.effect(service, loadConfig(config, schema)),
		});
	};
