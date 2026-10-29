import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatProblems, parseConfigPath } from './core/index.ts';
import { load } from './runtime/index.ts';

// The runtime next to this module, so it resolves from config files outside the dependency tree: `.ts` in this repo, `.mjs` once built.
const runtime = new URL(`runtime/index${extname(import.meta.url)}`, import.meta.url).href;

registerHooks({
	load(url, context, nextLoad) {
		if (!url.startsWith('file:')) return nextLoad(url, context);
		const file = fileURLToPath(url);
		if (!parseConfigPath(file)) return nextLoad(url, context);

		const result = load(file, { target: 'server', runtime });
		if (result.problems.length > 0) throw new Error(`Invalid config ${file}\n${formatProblems(result.problems)}`);
		return { format: 'module', source: result.code, shortCircuit: true };
	},
});
