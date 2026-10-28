import { createHash } from 'node:crypto';

import { loadConfigImport } from './shared.ts';

import { formatProblems, resolveConfigSync } from '../core/index.ts';
import { valueLiteral } from '../runtime/load.ts';

import type { TyfigoPluginOptions } from './shared.ts';
import type { SyncTransformer, TransformOptions } from '@jest/transform';

export type TyfigoJestOptions = Omit<TyfigoPluginOptions, 'target'>;

const generate = (file: string, options: TransformOptions<TyfigoJestOptions | undefined>) => {
	const config = options.transformerConfig ?? {};
	if (options.supportsStaticESM) {
		return loadConfigImport(file, {
			target: 'server',
			environment: config.environment,
			runtime: config.runtime,
		}).code;
	}

	const result = resolveConfigSync(file, { environment: config.environment });
	if (result.problems.length > 0) {
		throw new Error(`Invalid config ${result.file}\n${formatProblems(result.problems)}`);
	}
	return `module.exports = { __esModule: true, default: ${valueLiteral(result.value)} };\n`;
};

/**
 * A Jest transformer for config imports. Native ESM tests (`NODE_OPTIONS=--experimental-vm-modules`) get the server module,
 * which resolves the config when it is imported. CommonJS tests get the config resolved when Jest transforms the file.
 */
const transformer: SyncTransformer<TyfigoJestOptions | undefined> = {
	canInstrument: false,
	getCacheKey: (_source, file, options) =>
		createHash('sha256')
			.update(file)
			.update(String(options.supportsStaticESM))
			.update(generate(file, options))
			.digest('hex'),
	process: (_source, file, options) => ({ code: generate(file, options) }),
};

export default transformer;
