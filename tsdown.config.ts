import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: [
		'src/index.ts',
		'src/effect.ts',
		'src/runtime/index.ts',
		'src/mapper.ts',
		'src/register.ts',
		'src/bun.ts',
		'src/plugins/vite.ts',
		'src/plugins/rollup.ts',
		'src/plugins/rolldown.ts',
		'src/plugins/esbuild.ts',
		'src/plugins/webpack.ts',
		'src/plugins/rspack.ts',
		'src/plugins/rsbuild.ts',
		'src/plugins/next.ts',
		'src/plugins/jest.ts',
		'src/plugins/loader.ts',
	],
	format: 'esm',
	dts: true,
	sourcemap: true,
	target: 'es2024',
	tsconfig: 'tsconfig.json',
	deps: {
		neverBundle: true,
	},
});
