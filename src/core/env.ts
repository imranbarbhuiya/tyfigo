import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { parseEnv } from 'node:util';

import { Effect, Result } from 'effect';

import { findFile, searchDirectories } from './files.ts';
import { fileProblem } from './problems.ts';

import type { Problem } from './problems.ts';

export type EnvVariables = Readonly<Record<string, string | undefined>>;

export interface EnvResult {
	/**
	 * The `.env` values with the real environment on top.
	 */
	readonly variables: EnvVariables;
	/**
	 * The `.env` files that were read, in the order they apply.
	 */
	readonly files: readonly string[];
	readonly problems: readonly Problem[];
}

/**
 * A copy of the real environment. This is the only place tyfigo reads `process.env`.
 */
export const processEnv = (): EnvVariables => ({ ...process.env });

export const envFileNames = (environment?: string): readonly string[] =>
	environment ? ['.env', '.env.local', `.env.${environment}`, `.env.${environment}.local`] : ['.env', '.env.local'];

/**
 * Reads `.env`, `.env.local`, `.env.<environment>` and `.env.<environment>.local` (each later one wins) and puts `env` on top.
 * Each file is searched next to `baseFile` first, then in the nearest directory with a `package.json`. Never writes `process.env`.
 */
export const readEnv = Effect.fn('readEnv')(function* (
	baseFile: string,
	options: { readonly environment?: string | undefined; readonly env?: EnvVariables | undefined } = {},
) {
	const directories = yield* searchDirectories(resolve(baseFile));
	const variables: Record<string, string | undefined> = {};
	const files: string[] = [];
	const problems: Problem[] = [];
	for (const name of envFileNames(options.environment)) {
		const file = yield* findFile(directories, name);
		if (!file) continue;
		const parsed = yield* Effect.result(
			Effect.try({
				try: () => parseEnv(readFileSync(file, 'utf8')),
				catch: (error) => fileProblem(file, 'read-error', `Cannot read ${file}: ${(error as Error).message}`),
			}),
		);
		if (Result.isFailure(parsed)) {
			problems.push(parsed.failure);
			continue;
		}

		files.push(file);
		Object.assign(variables, parsed.success);
	}

	for (const [key, value] of Object.entries(options.env ?? processEnv())) {
		if (value !== undefined) variables[key] = value;
	}
	return { variables, files, problems } satisfies EnvResult;
});
