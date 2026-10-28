import { Layer } from 'effect';

import { decodeEnv } from '../env.ts';

import type { ConfigSchema, LoadEnvOptions, SchemaOutput } from '../schema.ts';
import type { ConfigError, EffectConfigSchema, SchemaServices } from './load.ts';
import type { Context, Effect } from 'effect';

/**
 * Validates `.env`, `.env.local`, `.env.<environment>` and `.env.<environment>.local` with the real environment on top.
 * Never writes `process.env`.
 */
export const loadEnv = <S extends EffectConfigSchema>(
	schema: S,
	options: LoadEnvOptions = {},
): Effect.Effect<SchemaOutput<S>, ConfigError, SchemaServices<S>> =>
	decodeEnv(schema as ConfigSchema, { ...options, async: true, native: true }) as Effect.Effect<
		SchemaOutput<S>,
		ConfigError,
		SchemaServices<S>
	>;

/**
 * A layer that provides `service` with the validated environment variables.
 */
export const layerEnv = <I, S extends EffectConfigSchema>(
	service: Context.Key<I, SchemaOutput<S>>,
	schema: S,
	options: LoadEnvOptions = {},
): Layer.Layer<I, ConfigError, SchemaServices<S>> => Layer.effect(service, loadEnv(schema, options));
