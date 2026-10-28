import { join } from 'node:path';
import process from 'node:process';

import { Effect } from 'effect';

import { processEnv, readEnv } from './core/env.ts';
import { validate } from './schema.ts';

import type { ConfigSchema, LoadEnvOptions } from './schema.ts';

export const decodeEnv = Effect.fn('decodeEnv')(function* <S extends ConfigSchema>(
	schema: S,
	options: LoadEnvOptions & { readonly async: boolean; readonly native?: boolean | undefined },
) {
	const env = options.env ?? processEnv();
	const environment = options.environment ?? (env.NODE_ENV || undefined);
	const result = yield* readEnv(join(options.cwd ?? process.cwd(), '.env'), { environment, env });
	return yield* validate(schema, result.variables, {
		subject: 'environment variables',
		async: options.async,
		native: options.native,
		issues: result.problems.map((problem) => ({
			path: [],
			message: problem.message,
			location: `${problem.file}:${problem.line}:${problem.column}`,
		})),
	});
});
