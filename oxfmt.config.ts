import config from '@imranbarbhuiya/oxc-config/oxfmt';
import { defineConfig } from 'oxfmt';

export default defineConfig({
	...config,
	ignorePatterns: [
		...config.ignorePatterns,
		'dist',
		'coverage',
		'CHANGELOG.md',
		'site/.tanstack',
		'site/.vercel',
		'site/src/routeTree.gen.ts',
	],
});
