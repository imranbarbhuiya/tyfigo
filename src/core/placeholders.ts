import { formatPath, pathKey } from './positions.ts';
import { problemAt } from './problems.ts';

import type { EnvVariables } from './env.ts';
import type { Format } from './formats/index.ts';
import type { Path, PositionMap, SourceIndex } from './positions.ts';
import type { Problem, ProblemCode } from './problems.ts';

export interface PlaceholderInput {
	readonly value: unknown;
	readonly positions: PositionMap;
	readonly source: SourceIndex;
	readonly file: string;
	readonly format: Format;
	readonly variables: EnvVariables;
}

export interface PlaceholderResult {
	readonly value: unknown;
	readonly problems: readonly Problem[];
}

const placeholderPattern = /\$\$\{|\$\{([A-Za-z_]\w*)(?:(:-|:\?)([^}]*))?\}|\$\{[^}]*\}?/gu;

const wholeValuePattern = /^\$\{[A-Za-z_]\w*(?:(?::-|:\?)[^}]*)?\}$/u;

export const hasPlaceholder = (text: string): boolean => text.includes('${');

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Replaces `${VAR}`, `${VAR:-default}` and `${VAR:?message}` in every string value. A string that is exactly one placeholder is
 * read with the format's scalar rules, so `"${PORT}"` with `PORT=8080` becomes `8080`. A placeholder inside a longer string stays
 * a string. `$${` is a literal `${`. Keys are never resolved.
 */
export const resolvePlaceholders = (input: PlaceholderInput): PlaceholderResult => {
	const problems: Problem[] = [];

	const report = (path: Path, raw: string, occurrence: number, code: ProblemCode, message: string) => {
		const span = input.positions.get(pathKey(path));
		if (!span) {
			problems.push(problemAt(input.source, input.file, 0, 0, code, message));
			return;
		}

		const from = input.source.charIndex(span.valueStart);
		const slice = input.source.text.slice(from, input.source.charIndex(span.valueStart + span.valueLength));
		let index = -1;
		for (let seen = 0; seen <= occurrence; seen++) {
			index = slice.indexOf(raw, index + 1);
			if (index === -1) break;
		}

		if (index === -1) {
			problems.push(problemAt(input.source, input.file, span.valueStart, span.valueLength, code, message));
		} else {
			const start = input.source.byteOffset(from + index);
			problems.push(
				problemAt(
					input.source,
					input.file,
					start,
					input.source.byteOffset(from + index + raw.length) - start,
					code,
					message,
				),
			);
		}
	};

	const resolveString = (text: string, path: Path): unknown => {
		const occurrences = new Map<string, number>();
		const resolved = text.replaceAll(
			placeholderPattern,
			(raw, name: string | undefined, operator: string | undefined, argument: string | undefined) => {
				if (raw === '$${') return '${';
				const occurrence = occurrences.get(raw) ?? 0;
				occurrences.set(raw, occurrence + 1);
				if (name === undefined) {
					report(
						path,
						raw,
						occurrence,
						'invalid-placeholder',
						`Invalid placeholder '${raw}' at '${formatPath(path)}'`,
					);
					return raw;
				}

				const variable = input.variables[name];
				const isEmpty = variable === undefined || variable === '';
				if (operator === ':-') return isEmpty ? (argument ?? '') : variable;
				if (operator === ':?' && isEmpty) {
					report(
						path,
						raw,
						occurrence,
						'missing-variable',
						argument || `Environment variable '${name}' is required`,
					);
					return raw;
				}

				if (variable === undefined) {
					report(path, raw, occurrence, 'missing-variable', `Environment variable '${name}' is not set`);
					return raw;
				}

				return variable;
			},
		);
		return wholeValuePattern.test(text) && resolved !== '' ? input.format.parseScalar(resolved) : resolved;
	};

	const visit = (value: unknown, path: Path): unknown => {
		if (typeof value === 'string') return hasPlaceholder(value) ? resolveString(value, path) : value;
		if (Array.isArray(value)) return value.map((item, index) => visit(item, [...path, index]));
		if (isPlainObject(value)) {
			return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, [...path, key])]));
		}
		return value;
	};

	return { value: visit(input.value, []), problems };
};
