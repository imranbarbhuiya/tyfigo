import { findNodeOnlyImports, isServerPlatform, loadConfigImport } from './shared.ts';

import { configPathPattern } from '../core/index.ts';

import type { TyfigoPluginOptions, WebpackLikePlatform } from './shared.ts';

export interface TyfigoLoaderContext {
	readonly resourcePath: string;
	readonly getOptions: () => TyfigoPluginOptions;
	readonly addDependency: (file: string) => void;
	readonly _compiler?: { readonly platform: WebpackLikePlatform } | undefined;
}

/**
 * A webpack loader for config files, for webpack-compatible loader runners such as Turbopack's. Without a `target` option it
 * detects the target from the compiler's platform when the runner exposes one, and falls back to `browser`. Any other module
 * is returned unchanged, and fails when it imports a tyfigo export that needs Node.js, which is how client code is checked.
 */
export default function tyfigoLoader(this: TyfigoLoaderContext, source: string): string {
	if (!configPathPattern.test(this.resourcePath)) {
		const messages = findNodeOnlyImports(source, this.resourcePath);
		if (messages.length > 0) throw new Error(messages.join('\n'));
		return source;
	}

	const options = this.getOptions();
	const target =
		options.target ?? (this._compiler && isServerPlatform(this._compiler.platform) ? 'server' : 'browser');
	const result = loadConfigImport(this.resourcePath, {
		target,
		bundle: true,
		environment: options.environment,
		runtime: options.runtime,
	});
	for (const file of result.watchFiles) this.addDependency(file);
	return result.code;
}
