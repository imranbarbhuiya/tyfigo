import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/index.ts', 'src/effect.ts', 'src/runtime/index.ts', 'src/mapper.ts', 'src/register.ts', 'src/bun.ts'],
	format: 'esm',
	dts: true,
	sourcemap: true,
	target: 'es2024',
	tsconfig: 'tsconfig.json',
	deps: {
		neverBundle: true,
	},
});
