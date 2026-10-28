import { Buffer } from 'node:buffer';
import { basename, dirname, relative, resolve } from 'node:path';

import { configSuffixes, parseConfigFileName } from '../core/formats/index.ts';
import { isPlainObject, resolvePlaceholders } from '../core/placeholders.ts';
import { pathKey, SourceIndex } from '../core/positions.ts';
import { fileProblem } from '../core/problems.ts';

import type { Format } from '../core/formats/index.ts';
import type { LayerKind } from '../core/layers.ts';
import type { Path, PositionMap } from '../core/positions.ts';
import type { Problem, ProblemCode } from '../core/problems.ts';

export const SpanMapKind = { Verbatim: 0, Atom: 1, Alias: 2 } as const;
export type SpanMapKind = (typeof SpanMapKind)[keyof typeof SpanMapKind];

/**
 * `[virtualStart, virtualLength, originalStart, originalLength, kind]` in UTF-8 bytes.
 */
export type SpanMapping = readonly [
	virtualStart: number,
	virtualLength: number,
	originalStart: number,
	originalLength: number,
	kind: SpanMapKind,
];

/**
 * A problem in the original file. `start` and `length` are UTF-8 byte offsets.
 */
export interface MapperDiagnostic {
	readonly messageText: string;
	readonly start: number;
	readonly length: number;
	readonly code: number;
}

export interface GeneratedModule {
	readonly text: string;
	readonly extension: '.ts';
	readonly mappings: readonly SpanMapping[];
	readonly diagnostics: readonly MapperDiagnostic[];
}

export interface GenerateOptions {
	/**
	 * The base config file this file layers on. Defaults to the name implied by `path` (`app.config.yaml` for
	 * `app.production.config.yaml`). When it is `path` itself, `path` is generated as the base file.
	 */
	readonly base?: string | undefined;
}

export const diagnosticCodes: Readonly<Record<ProblemCode, number>> = {
	'parse-error': 1_001,
	'duplicate-key': 1_002,
	'file-not-found': 1_003,
	'read-error': 1_004,
	'unsupported-file': 1_005,
	'missing-variable': 1_006,
	'invalid-placeholder': 1_007,
	'unknown-key': 1_008,
	'type-mismatch': 1_009,
	'browser-placeholder': 1_010,
};

export interface ConfigFileRole {
	readonly kind: LayerKind;
	/**
	 * The base file's name, `app.config.yaml` for `app.production.local.config.yaml`.
	 */
	readonly base: string;
	readonly environment: string | undefined;
	readonly format: Format;
}

/**
 * Reads a config file's layer from its name: the first dot-separated part of the stem names the base file, a trailing `local`
 * marks a local file and anything in between is the environment.
 */
export const configFileRole = (fileName: string): ConfigFileRole | undefined => {
	const name = parseConfigFileName(fileName);
	if (!name) return undefined;
	const [stem = '', ...rest] = name.stem.split('.');
	const base = `${stem}${name.suffix}`;
	const isLocal = rest.at(-1) === 'local';
	const environment = (isLocal ? rest.slice(0, -1) : rest).join('.') || undefined;
	const kind: LayerKind = isLocal
		? environment
			? 'environment-local'
			: 'local'
		: environment
			? 'environment'
			: 'base';
	return { kind, base, environment, format: name.format };
};

const wholePlaceholder = /^\$\{[A-Za-z_]\w*(?:(:-|:\?)([^}]*))?\}$/u;

const identifier = /^[A-Za-z_$][\w$]*$/u;

const isStringLiteral = (text: string, value: string) =>
	text === JSON.stringify(value) || (text === `'${value}'` && !/['\\\n\r\u2028\u2029]/u.test(value));

const numberLiteral = (value: number) =>
	Number.isNaN(value) ? 'NaN' : Number.isFinite(value) ? String(value) : value > 0 ? 'Infinity' : '-Infinity';

class Writer {
	text = '';
	bytes = 0;
	readonly mappings: SpanMapping[] = [];

	write(text: string): this {
		this.text += text;
		this.bytes += Buffer.byteLength(text);
		return this;
	}

	map(text: string, start: number, length: number, kind: SpanMapKind): this {
		this.mappings.push([this.bytes, Buffer.byteLength(text), start, length, kind]);
		return this.write(text);
	}

	append(other: Writer): this {
		for (const [start, ...rest] of other.mappings) this.mappings.push([start + this.bytes, ...rest]);
		return this.write(other.text);
	}
}

class Generator {
	readonly source: SourceIndex;
	readonly positions: PositionMap;
	readonly format: Format;

	constructor(text: string, positions: PositionMap, format: Format) {
		this.source = new SourceIndex(text);
		this.positions = positions;
		this.format = format;
	}

	#slice(start: number, length: number) {
		return this.source.text.slice(this.source.charIndex(start), this.source.charIndex(start + length));
	}

	#original(path: Path, part: 'key' | 'value') {
		const span = this.positions.get(pathKey(path));
		if (!span) return undefined;
		return part === 'key'
			? this.#slice(span.keyStart, span.keyLength)
			: this.#slice(span.valueStart, span.valueLength);
	}

	/**
	 * Writes a property name, reusing the original spelling when it is valid TypeScript for the same key.
	 */
	key(writer: Writer, key: string, path: Path) {
		const original = this.#original(path, 'key');
		const text =
			original !== undefined && isStringLiteral(original, key)
				? original
				: identifier.test(key)
					? key
					: JSON.stringify(key);
		return this.mapped(writer, text, path, 'key');
	}

	string(value: string, path: Path) {
		const original = this.#original(path, 'value');
		return original !== undefined && isStringLiteral(original, value) ? original : JSON.stringify(value);
	}

	/**
	 * Writes `text` mapped to the key or value of `path`: Verbatim when it is the original text, `fallback` otherwise.
	 */
	mapped(writer: Writer, text: string, path: Path, part: 'key' | 'value', fallback: SpanMapKind = SpanMapKind.Alias) {
		const span = this.positions.get(pathKey(path));
		if (!span) return writer.write(text);
		const [start, length] = part === 'key' ? [span.keyStart, span.keyLength] : [span.valueStart, span.valueLength];
		return writer.map(text, start, length, this.#slice(start, length) === text ? SpanMapKind.Verbatim : fallback);
	}

	placeholderType(text: string) {
		const match = wholePlaceholder.exec(text);
		if (match?.[1] !== ':-') return 'string';
		const value = this.format.parseScalar(match[2] ?? '');
		return value === null ? 'null' : typeof value;
	}

	type(value: unknown, path: Path, indent: string): Writer {
		const writer = new Writer();
		if (Array.isArray(value)) return this.#arrayType(value, path, indent);
		if (isPlainObject(value)) {
			const entries = Object.entries(value);
			if (entries.length === 0) return this.mapped(writer, '{}', path, 'value', SpanMapKind.Atom);
			this.mapped(writer, '{', path, 'value', SpanMapKind.Atom).write('\n');
			for (const [key, item] of entries) {
				const childPath = [...path, key];
				writer.write(`${indent}\treadonly `);
				this.key(writer, key, childPath);
				writer
					.write(': ')
					.append(this.type(item, childPath, `${indent}\t`))
					.write(';\n');
			}
			return writer.write(`${indent}}`);
		}

		const text =
			value === null
				? 'null'
				: typeof value === 'string'
					? this.placeholderType(value)
					: typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
						? typeof value
						: 'unknown';
		return this.mapped(writer, text, path, 'value');
	}

	#arrayType(items: readonly unknown[], path: Path, indent: string) {
		const members = new Map<string, Writer>();
		for (const [index, item] of items.entries()) {
			const member = this.type(item, [...path, index], indent);
			if (!members.has(member.text)) members.set(member.text, member);
		}

		const writer = this.mapped(new Writer(), 'readonly', path, 'value', SpanMapKind.Atom).write(' ');
		if (members.size === 0) return writer.write('unknown[]');
		const [first] = members.values();
		const wrap = members.size > 1 || first?.text.startsWith('readonly');
		if (wrap) writer.write('(');
		for (const [index, member] of [...members.values()].entries()) {
			if (index > 0) writer.write(' | ');
			writer.append(member);
		}
		return writer.write(wrap ? ')[]' : '[]');
	}

	/**
	 * An expression for `value`. Objects that are not inside an array become `{}` when `shallow` is set, because their keys are
	 * checked by statements of their own.
	 */
	value(value: unknown, path: Path, shallow: boolean): Writer {
		const writer = new Writer();
		if (Array.isArray(value)) {
			writer.write('[');
			for (const [index, item] of value.entries()) {
				if (index > 0) writer.write(', ');
				writer.append(this.value(item, [...path, index], false));
			}
			return writer.write(']');
		}

		if (isPlainObject(value)) {
			if (shallow) return this.mapped(writer, '{}', path, 'value', SpanMapKind.Atom);
			const entries = Object.entries(value);
			if (entries.length === 0) return this.mapped(writer, '{}', path, 'value', SpanMapKind.Atom);
			writer.write('{ ');
			for (const [index, [key, item]] of entries.entries()) {
				const childPath = [...path, key];
				if (index > 0) writer.write(', ');
				this.key(writer, key, childPath);
				writer.write(': ').append(this.value(item, childPath, false));
			}
			return writer.write(' }');
		}

		if (typeof value === 'string' && wholePlaceholder.test(value)) {
			return this.mapped(writer, '(undefined as never)', path, 'value');
		}

		const text =
			value === null || typeof value === 'boolean'
				? String(value)
				: typeof value === 'string'
					? this.string(value, path)
					: typeof value === 'number'
						? numberLiteral(value)
						: typeof value === 'bigint'
							? `${value}n`
							: '(undefined as never)';
		return this.mapped(writer, text, path, 'value');
	}
}

const toDiagnostic = (problem: Problem): MapperDiagnostic => ({
	messageText: problem.message,
	start: problem.start,
	length: problem.length,
	code: diagnosticCodes[problem.code],
});

const untyped = (diagnostics: readonly MapperDiagnostic[]): GeneratedModule => ({
	text: 'declare const config: any;\nexport default config;\n',
	extension: '.ts',
	mappings: [],
	diagnostics,
});

const baseModule = (generator: Generator, value: unknown) =>
	new Writer()
		.write('declare const config: ')
		.append(generator.type(value, [], ''))
		.write(';\nexport default config;\n');

const importSpecifier = (from: string, to: string) => {
	const specifier = relative(dirname(from), to).replaceAll('\\', '/');
	return specifier.startsWith('.') ? specifier : `./${specifier}`;
};

const layerModule = (generator: Generator, value: unknown, specifier: string) => {
	const statements = new Writer();

	const visit = (object: Record<string, unknown>, path: Path, target: string): boolean => {
		let nested = false;
		for (const [key, item] of Object.entries(object)) {
			const childPath = [...path, key];
			statements.write('({ ');
			generator.key(statements, key, childPath);
			statements.write(': ').append(generator.value(item, childPath, true));
			statements.write(` }) satisfies Override<${target}>;\n`);
			if (isPlainObject(item)) {
				nested = true;
				visit(item, childPath, `At<${target}, ${JSON.stringify(key)}>`);
			}
		}
		return nested;
	};

	let usesAt = false;
	if (isPlainObject(value)) usesAt = visit(value, [], 'Config');
	else {
		statements.write('(').append(generator.value(value, [], false));
		statements.write(') ');
		generator.mapped(statements, 'satisfies', [], 'value', SpanMapKind.Atom).write(' Override<Config>;\n');
	}

	const writer = new Writer()
		.write('import type Base from ')
		.map(JSON.stringify(specifier), 0, 0, SpanMapKind.Atom)
		.write(';\n\ntype Config = typeof Base;\n');
	if (statements.text !== '') {
		writer.write(
			'type Override<T> = T extends readonly unknown[]\n\t? T\n\t: T extends object\n\t\t? [keyof T] extends [never]\n\t\t\t? { readonly [key: string]: never }\n\t\t\t: { readonly [K in keyof T]?: Override<T[K]> }\n\t\t: T;\n',
		);
	}
	if (usesAt) writer.write('type At<T, K> = T extends object ? (K extends keyof T ? T[K] : any) : any;\n');
	if (statements.text !== '') writer.write('\n').append(statements);
	return writer.write('\ndeclare const config: Config;\nexport default config;\n');
};

/**
 * Turns a config file into a TypeScript module for a content mapper. A base file declares its widened, readonly type. An
 * environment or local file checks each of its keys against the base file's type, with every key and value mapped back to the
 * config file, and exports the base file's type.
 */
export const generateTypes = (path: string, text: string, options: GenerateOptions = {}): GeneratedModule => {
	const file = resolve(path);
	const role = configFileRole(basename(file));
	if (!role) {
		const message = `${basename(file)} is not a config file. tyfigo handles files ending in ${configSuffixes.join(', ')}`;
		return untyped([toDiagnostic(fileProblem(file, 'unsupported-file', message))]);
	}

	const parsed = role.format.parse(text, file);
	const diagnostics = parsed.problems.map(toDiagnostic);
	if (parsed.value === undefined || parsed.problems.some((problem) => problem.code === 'parse-error')) {
		return untyped(diagnostics);
	}

	const generator = new Generator(text, parsed.positions, role.format);
	const placeholders = resolvePlaceholders({
		value: parsed.value,
		positions: parsed.positions,
		source: generator.source,
		file,
		format: role.format,
		variables: {},
	});
	for (const problem of placeholders.problems) {
		if (problem.code === 'invalid-placeholder') diagnostics.push(toDiagnostic(problem));
	}

	const base = options.base === undefined ? resolve(dirname(file), role.base) : resolve(options.base);
	const writer =
		base === file
			? baseModule(generator, parsed.value)
			: layerModule(generator, parsed.value, importSpecifier(file, base));
	return { text: writer.text, extension: '.ts', mappings: writer.mappings, diagnostics };
};
