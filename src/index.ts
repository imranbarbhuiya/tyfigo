import { Effect } from 'effect';

import { decodeConfig, decodeEnv } from './schema.ts';

import type { ConfigSchema, LoadEnvOptions, LooseInput, SchemaInput, SchemaOutput } from './schema.ts';

export type {
	LocatedSpan,
	Path,
	Problem,
	ProblemCode,
	ResolvedConfig,
	ResolvedLayer,
	ResolveOptions,
	Span,
} from './core/index.ts';
export { ConfigValidationError } from './schema.ts';
export type {
	ConfigIssue,
	ConfigSchema,
	ConfigSource,
	LoadEnvOptions,
	LooseInput,
	SchemaInput,
	SchemaOutput,
} from './schema.ts';

/**
 * Validates a config import (or any value) with a Standard Schema or an Effect Schema and returns the schema's output.
 *
 * @throws {@link ConfigValidationError} listing every issue, with `file:line:column` when `config` is a config import.
 * @throws TypeError when the schema validates asynchronously; use {@link loadConfigAsync} for those.
 */
export const loadConfig = <S extends ConfigSchema>(config: LooseInput<SchemaInput<S>>, schema: S): SchemaOutput<S> =>
	Effect.runSync(decodeConfig(config, schema, { async: false }));

/**
 * {@link loadConfig} for schemas that may validate asynchronously.
 */
export const loadConfigAsync = async <S extends ConfigSchema>(
	config: LooseInput<SchemaInput<S>>,
	schema: S,
): Promise<SchemaOutput<S>> => Effect.runPromise(decodeConfig(config, schema, { async: true }));

/**
 * Validates `.env`, `.env.local`, `.env.<environment>` and `.env.<environment>.local` with the real environment on top.
 * Never writes `process.env`.
 *
 * @throws {@link ConfigValidationError} listing every issue and every `.env` file that could not be read.
 * @throws TypeError when the schema validates asynchronously; use {@link loadEnvAsync} for those.
 */
export const loadEnv = <S extends ConfigSchema>(schema: S, options: LoadEnvOptions = {}): SchemaOutput<S> =>
	Effect.runSync(decodeEnv(schema, { ...options, async: false }));

/**
 * {@link loadEnv} for schemas that may validate asynchronously.
 */
export const loadEnvAsync = async <S extends ConfigSchema>(
	schema: S,
	options: LoadEnvOptions = {},
): Promise<SchemaOutput<S>> => Effect.runPromise(decodeEnv(schema, { ...options, async: true }));
