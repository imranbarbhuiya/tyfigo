import { Effect } from 'effect';

import { decodeEnv } from './env.ts';

import type { ConfigSchema, LoadEnvOptions, SchemaOutput } from './schema.ts';

export * from './index.browser.ts';

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
