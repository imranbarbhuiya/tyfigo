import type { SourceIndex } from './positions.ts';

export type ProblemCode =
	| 'parse-error'
	| 'duplicate-key'
	| 'file-not-found'
	| 'read-error'
	| 'unsupported-file'
	| 'missing-variable'
	| 'invalid-placeholder'
	| 'browser-placeholder'
	| 'unknown-key'
	| 'type-mismatch';

/**
 * Something wrong with a config file. `start` and `length` are UTF-8 byte offsets, `line` and `column` are 1-based and
 * `column` counts UTF-16 code units.
 */
export interface Problem {
	readonly file: string;
	readonly start: number;
	readonly length: number;
	readonly line: number;
	readonly column: number;
	readonly message: string;
	readonly code: ProblemCode;
}

export const problemAt = (
	source: SourceIndex,
	file: string,
	start: number,
	length: number,
	code: ProblemCode,
	message: string,
): Problem => ({ file, start, length, ...source.lineColumn(start), message, code });

export const fileProblem = (file: string, code: ProblemCode, message: string): Problem => ({
	file,
	start: 0,
	length: 0,
	line: 1,
	column: 1,
	message,
	code,
});

export const formatProblem = (problem: Problem): string =>
	`${problem.file}:${problem.line}:${problem.column} - ${problem.message} (${problem.code})`;

export const formatProblems = (problems: readonly Problem[]): string => problems.map(formatProblem).join('\n');
