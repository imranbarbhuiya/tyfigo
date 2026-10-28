import { fileURLToPath } from 'node:url';

import tyfigo from 'tyfigo/webpack';

import type { Configuration } from 'webpack';

export default {
	mode: 'production',
	target: 'node24',
	entry: './src/main.ts',
	output: {
		path: fileURLToPath(new URL('dist', import.meta.url)),
		filename: 'main.cjs',
	},
	resolve: { extensions: ['.ts', '.js'] },
	module: {
		rules: [{ test: /\.ts$/, exclude: /node_modules/, loader: 'swc-loader' }],
	},
	externals: { 'tyfigo/runtime': 'import tyfigo/runtime' },
	plugins: [tyfigo()],
} satisfies Configuration;
