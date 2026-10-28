import type { Path } from '../core/positions.ts';

/**
 * The key of the non-enumerable {@link ConfigSource} on a config object exported by a generated server module.
 */
export const configSource = Symbol.for('tyfigo.source');

export interface SourcePosition {
	readonly file: string;
	readonly line: number;
	readonly column: number;
}

export interface ConfigSource {
	/**
	 * The base config file, as an absolute path.
	 */
	readonly file: string;
	readonly environment: string | undefined;
	/**
	 * The layer files that were merged, in the order they apply.
	 */
	readonly layers: readonly string[];
	/**
	 * The `.env` files that were read, in the order they apply.
	 */
	readonly envFiles: readonly string[];
	/**
	 * Where the value at `path` was set. A path the config does not have resolves to its nearest ancestor that it does have.
	 */
	readonly position: (path: Path) => SourcePosition | undefined;
}

export const getConfigSource = (value: unknown): ConfigSource | undefined =>
	typeof value === 'object' && value !== null
		? (value as { readonly [configSource]?: ConfigSource })[configSource]
		: undefined;
