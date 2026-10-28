import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

import { configFilePattern } from './shared.ts';
import { loaderOptions, loaderPath, turbopackRules } from './turbopack.ts';

import type { TyfigoPluginOptions } from './shared.ts';
import type { NextConfig } from 'next';

export interface WithTyfigoOptions extends Omit<TyfigoPluginOptions, 'target'> {
	/**
	 * `next build` type-checks without `--runExternalCode`, so TypeScript cannot type config imports. When this is on, Next's
	 * own check is turned off and `tsc --noEmit --runExternalCode` runs after the production compile instead. Defaults to on
	 * unless `typescript.ignoreBuildErrors` is set.
	 */
	readonly typeCheck?: boolean | undefined;
}

const tscPath = (projectDir: string) => {
	const require = createRequire(join(projectDir, 'package.json'));
	const manifest = require.resolve('typescript/package.json');
	const { bin } = require(manifest) as { readonly bin: Readonly<Record<string, string>> };
	return resolve(dirname(manifest), bin.tsc ?? 'bin/tsc');
};

/**
 * Runs `tsc --noEmit --runExternalCode` for the project's tsconfig, and rejects when it reports errors. Resolves without
 * checking when the tsconfig does not exist.
 */
export const typeCheck = async (projectDir: string, tsconfigPath = 'tsconfig.json'): Promise<void> => {
	const project = resolve(projectDir, tsconfigPath);
	if (!existsSync(project)) return;
	const tsc = spawn(process.execPath, [tscPath(projectDir), '--noEmit', '--runExternalCode', '--project', project], {
		cwd: projectDir,
		stdio: 'inherit',
	});
	const [code] = (await once(tsc, 'exit')) as [number | null];
	if (code !== 0) throw new Error(`Type check failed: tsc --noEmit --runExternalCode --project ${project}`);
};

/**
 * Adds tyfigo to a Next.js config: a webpack rule and Turbopack rules for config imports, with the browser rule for client and
 * Edge code, and a type check that can read config imports.
 */
export const withTyfigo = (nextConfig: NextConfig = {}, options: WithTyfigoOptions = {}): NextConfig => {
	const { typeCheck: check = !nextConfig.typescript?.ignoreBuildErrors, ...loader } = options;
	const rule = (target: 'server' | 'browser') => ({
		test: configFilePattern,
		type: 'javascript/auto',
		use: [{ loader: loaderPath, options: loaderOptions(loader, target) }],
	});
	const config: NextConfig = {
		...nextConfig,
		experimental: { useTypeScriptCli: true, ...nextConfig.experimental },
		turbopack: {
			...nextConfig.turbopack,
			rules: { ...turbopackRules(loader), ...nextConfig.turbopack?.rules },
		},
		webpack: (webpackConfig: { module: { rules: unknown[] } }, context) => {
			if (!context.isServer || context.nextRuntime === 'edge') {
				webpackConfig.module.rules.push(rule('browser'), {
					test: /\.[cm]?[jt]sx?$/u,
					exclude: /[\\/]node_modules[\\/]/u,
					enforce: 'pre',
					use: [{ loader: loaderPath }],
				});
			} else {
				webpackConfig.module.rules.push(
					{ ...rule('browser'), issuerLayer: 'ssr' },
					{ ...rule('server'), issuerLayer: { not: 'ssr' } },
				);
			}
			return nextConfig.webpack ? nextConfig.webpack(webpackConfig, context) : webpackConfig;
		},
	};
	if (!check) return config;

	return {
		...config,
		typescript: { ...nextConfig.typescript, ignoreBuildErrors: true },
		compiler: {
			...nextConfig.compiler,
			runAfterProductionCompile: async (metadata) => {
				await nextConfig.compiler?.runAfterProductionCompile?.(metadata);
				await typeCheck(metadata.projectDir, nextConfig.typescript?.tsconfigPath);
			},
		},
	};
};
