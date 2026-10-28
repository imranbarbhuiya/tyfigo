import { join } from 'node:path';
import process from 'node:process';

import { Data, Effect, Schema, SchemaIssue } from 'effect';

import { processEnv, readEnv } from './core/env.ts';
import { formatPath } from './core/positions.ts';
import { getConfigSource } from './runtime/resolve.ts';

import type { ResolveOptions } from './core/resolve.ts';
import type { ConfigSource } from './runtime/resolve.ts';
import type { StandardSchemaV1 } from '@standard-schema/spec';

/**
 * A Standard Schema (Zod, Valibot, ArkType, …) or an Effect Schema without decoding services.
 */
export type ConfigSchema = StandardSchemaV1 | Schema.ConstraintDecoder<unknown>;

export type SchemaInput<S> = S extends StandardSchemaV1
	? StandardSchemaV1.InferInput<S>
	: S extends Schema.Top
		? S['Encoded']
		: never;

export type SchemaOutput<S> = S extends StandardSchemaV1
	? StandardSchemaV1.InferOutput<S>
	: S extends Schema.Top
		? S['Type']
		: never;

/**
 * A schema input with literals widened and everything readonly, so a schema-less config import is assignable to it.
 */
export type LooseInput<T> = T extends string
	? string
	: T extends number
		? number
		: T extends boolean
			? boolean
			: T extends readonly (infer U)[]
				? readonly LooseInput<U>[]
				: T extends object
					? { readonly [K in keyof T]: LooseInput<T[K]> }
					: T;

export interface ConfigIssue {
	readonly path: readonly PropertyKey[];
	readonly message: string;
	/**
	 * `file:line:column` when the value came from a config import, or the file alone when the key has no position.
	 */
	readonly location?: string | undefined;
}

const formatIssue = (issue: ConfigIssue): string => {
	const path = formatPath(issue.path.map((segment) => (typeof segment === 'symbol' ? String(segment) : segment)));
	const text = path ? `${path}: ${issue.message}` : issue.message;
	return issue.location ? `${issue.location} - ${text}` : text;
};

/**
 * Thrown with every issue at once when a config or the environment does not match its schema.
 */
export class ConfigValidationError extends Data.TaggedError('ConfigValidationError')<{
	readonly subject: string;
	readonly issues: readonly ConfigIssue[];
}> {
	override get message(): string {
		return [`Invalid ${this.subject}:`, ...this.issues.map((issue) => `  ${formatIssue(issue)}`)].join('\n');
	}
}

export type { ConfigSource } from './runtime/resolve.ts';

export const configSource = (config: unknown): ConfigSource | undefined => {
	const source = getConfigSource(config);
	return typeof source?.file === 'string' && typeof source.position === 'function' ? source : undefined;
};

const locateIssue = (source: ConfigSource, path: readonly PropertyKey[]): string => {
	const end = path.findIndex((segment) => typeof segment === 'symbol');
	const keys = (end === -1 ? path : path.slice(0, end)) as readonly (string | number)[];
	const position = source.position(keys);
	return position ? `${position.file}:${position.line}:${position.column}` : source.file;
};

export const toStandardSchema = (schema: ConfigSchema): StandardSchemaV1 =>
	Schema.isSchema(schema)
		? Schema.toStandardSchemaV1(schema as Schema.ConstraintDecoder<unknown>, { parseOptions: { errors: 'all' } })
		: (schema as StandardSchemaV1);

export interface ValidateOptions {
	readonly subject: string;
	readonly source?: ConfigSource | undefined;
	/**
	 * Allow a schema that validates asynchronously. Without it, an async schema is a defect.
	 */
	readonly async: boolean;
	/**
	 * Decode an Effect Schema with Effect itself instead of its Standard Schema adapter, so its decoding services are kept.
	 */
	readonly native?: boolean | undefined;
	/**
	 * Issues found before validation, such as unreadable `.env` files. They fail validation even when the schema passes.
	 */
	readonly issues?: readonly ConfigIssue[] | undefined;
}

const standardFormatter = SchemaIssue.makeFormatterStandardSchemaV1();

const decodeNative = (schema: Schema.Top, value: unknown): Effect.Effect<StandardSchemaV1.Result<unknown>> =>
	(Schema.decodeUnknownEffect(schema)(value, { errors: 'all' }) as Effect.Effect<unknown, Schema.SchemaError>).pipe(
		Effect.map((output): StandardSchemaV1.Result<unknown> => ({ value: output })),
		Effect.catch((error) => Effect.succeed(standardFormatter(error.issue))),
	);

export const validate = Effect.fn('validate')(function* <S extends ConfigSchema>(
	schema: S,
	value: unknown,
	options: ValidateOptions,
) {
	let result: StandardSchemaV1.Result<unknown>;
	if (options.native && Schema.isSchema(schema)) {
		result = yield* decodeNative(schema, value);
	} else {
		const pending = toStandardSchema(schema)['~standard'].validate(value);
		if ('then' in pending) {
			if (!options.async) {
				void pending.catch(() => undefined);
				return yield* Effect.die(
					new TypeError(
						`The schema for the ${options.subject} validates asynchronously; use loadConfigAsync or loadEnvAsync`,
					),
				);
			}
			result = yield* Effect.promise(async () => pending);
		} else {
			result = pending;
		}
	}

	const issues = [
		...(options.issues ?? []),
		...(result.issues ?? []).map((issue): ConfigIssue => {
			const path = Array.from(issue.path ?? [], (segment) =>
				typeof segment === 'object' ? segment.key : segment,
			);
			return {
				path,
				message: issue.message,
				location: options.source && locateIssue(options.source, path),
			};
		}),
	];
	if (issues.length > 0) return yield* new ConfigValidationError({ subject: options.subject, issues });
	return (result as StandardSchemaV1.SuccessResult<SchemaOutput<S>>).value;
});

export const decodeConfig = <S extends ConfigSchema>(
	config: unknown,
	schema: S,
	options: { readonly async: boolean; readonly native?: boolean | undefined },
) => {
	const source = configSource(config);
	return validate(schema, config, {
		subject: source ? `config ${source.file}` : 'config',
		source,
		async: options.async,
		native: options.native,
	});
};

export interface LoadEnvOptions extends ResolveOptions {
	/**
	 * Where to start looking for `.env` files, which are searched there and then in the nearest directory with a
	 * `package.json`. Defaults to `process.cwd()`.
	 */
	readonly cwd?: string | undefined;
}

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
