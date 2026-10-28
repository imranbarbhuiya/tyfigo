import common from '@imranbarbhuiya/oxc-config/common';
import effect from '@imranbarbhuiya/oxc-config/effect';
import module from '@imranbarbhuiya/oxc-config/module';
import node from '@imranbarbhuiya/oxc-config/node';
import tsdoc from '@imranbarbhuiya/oxc-config/tsdoc';
import typescript from '@imranbarbhuiya/oxc-config/typescript';
import { defineConfig } from 'oxlint';

export default defineConfig({
	extends: [common, node, typescript, module, tsdoc, effect],
	ignorePatterns: ['.github/**', 'dist/**', 'coverage/**', 'examples/**'],
	options: {
		typeAware: true,
	},
	rules: {
		'mahir-effect/no-run-outside-edge': [
			2,
			{ allow: ['src/index.ts', 'src/core/sync.ts', 'src/runtime/load.ts', '**/*.test.ts', '**/scripts/**'] },
		],
	},
	overrides: [
		{
			files: ['src/core/env.ts'],
			rules: { 'node-js/no-process-env': 0 },
		},
		{
			files: ['src/core/**', 'src/runtime/**', 'src/plugins/**', 'src/index.ts'],
			rules: { 'node/no-sync': 0 },
		},
		{
			files: ['tests/**'],
			rules: { 'no-template-curly-in-string': 0, 'node/no-sync': 0 },
		},
	],
});
