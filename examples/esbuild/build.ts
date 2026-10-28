import { build } from 'esbuild';
import tyfigo from 'tyfigo/esbuild';

await build({
	entryPoints: ['src/main.ts'],
	outfile: 'dist/main.js',
	bundle: true,
	platform: 'node',
	format: 'esm',
	packages: 'external',
	plugins: [tyfigo({ environment: 'production' })],
});
