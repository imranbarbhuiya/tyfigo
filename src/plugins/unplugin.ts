import { createUnplugin } from 'unplugin';

import {
	configFilePattern,
	findNodeOnlyImports,
	isServerPlatform,
	loadConfigImport,
	tyfigoImportPattern,
} from './shared.ts';

import type { LoadOptions } from '../runtime/load.ts';
import type { TyfigoPluginOptions, WebpackLikeCompiler } from './shared.ts';
import type { UnpluginBuildContext, UnpluginFactory } from 'unplugin';

export type { TyfigoPluginOptions } from './shared.ts';

const webpackMode = (compiler: WebpackLikeCompiler) =>
	compiler.options.mode === 'none' ? undefined : compiler.options.mode;

interface ViteContext {
	readonly environment?: { readonly config: { readonly consumer: string } };
}

export const unpluginFactory: UnpluginFactory<TyfigoPluginOptions | undefined, false> = (options = {}) => {
	let viteCommand: string | undefined;
	let viteMode: string | undefined;
	let rolldownPlatform: string | undefined;

	const detect = (
		context: UnpluginBuildContext,
		loadOptions: { readonly ssr?: boolean } | undefined,
	): Pick<LoadOptions, 'target' | 'bundle' | 'environment'> => {
		const native = context.getNativeBuildContext?.();
		if (native?.framework === 'webpack' || native?.framework === 'rspack') {
			const compiler = native.compiler as WebpackLikeCompiler;
			return {
				target: isServerPlatform(compiler.platform) ? 'server' : 'browser',
				bundle: true,
				environment: webpackMode(compiler),
			};
		}
		if (native?.framework === 'esbuild') {
			return { target: native.build.initialOptions.platform === 'node' ? 'server' : 'browser', bundle: true };
		}
		if (viteCommand) {
			const consumer = (context as ViteContext).environment?.config.consumer;
			return {
				target: (consumer === undefined ? loadOptions?.ssr : consumer === 'server') ? 'server' : 'browser',
				bundle: viteCommand === 'build',
				environment: viteMode,
			};
		}
		return { target: rolldownPlatform === 'node' ? 'server' : 'browser', bundle: true };
	};

	return {
		name: 'tyfigo',
		enforce: 'pre',
		load: {
			filter: { id: configFilePattern },
			handler(id, loadOptions?: { readonly ssr?: boolean }) {
				const detected = detect(this, loadOptions);
				const result = loadConfigImport(id, {
					...detected,
					target: options.target ?? detected.target,
					environment: options.environment ?? detected.environment,
					runtime: options.runtime,
				});
				for (const file of result.watchFiles) this.addWatchFile(file);
				return { code: result.code, moduleType: 'js' };
			},
		},
		transform: {
			filter: {
				id: { include: /\.(?:[cm]?[jt]sx?|vue|svelte|astro)(?:\?|$)/u, exclude: /[\\/]node_modules[\\/]/u },
				code: tyfigoImportPattern,
			},
			handler(code, id, transformOptions?: { readonly ssr?: boolean }) {
				if ((options.target ?? detect(this, transformOptions).target) !== 'browser') return;
				const messages = findNodeOnlyImports(code, id);
				if (messages.length > 0) throw new Error(messages.join('\n'));
			},
		},
		vite: {
			configResolved(config) {
				viteCommand = config.command;
				viteMode = config.mode;
			},
		},
		rolldown: {
			options(input) {
				rolldownPlatform = input.platform;
			},
		},
		esbuild: { loader: 'js' },
	};
};

export const tyfigo = createUnplugin(unpluginFactory);
