import { fileURLToPath } from 'node:url';

import { defineConfig } from '@rspack/cli';
import tyfigo from 'tyfigo/rspack';

import type { Configuration } from '@rspack/core';

const shared = {
	mode: 'production',
	resolve: { extensions: ['.ts', '.js'] },
	module: {
		rules: [
			{
				test: /\.ts$/,
				loader: 'builtin:swc-loader',
				options: { jsc: { parser: { syntax: 'typescript' } } },
				type: 'javascript/auto',
			},
		],
	},
	plugins: [tyfigo()],
} satisfies Configuration;

export default defineConfig([
	{
		...shared,
		name: 'client',
		target: 'web',
		entry: './src/client.ts',
		output: { path: fileURLToPath(new URL('dist/client', import.meta.url)), filename: 'client.js' },
	},
	{
		...shared,
		name: 'server',
		target: 'node24',
		entry: './src/server.ts',
		output: { path: fileURLToPath(new URL('dist/server', import.meta.url)), filename: 'server.cjs' },
		externals: { 'tyfigo/runtime': 'import tyfigo/runtime' },
	},
]);
