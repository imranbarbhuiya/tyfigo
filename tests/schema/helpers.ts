import { expect } from 'vitest';

import { ConfigValidationError } from '../../src/index.ts';

export const validationError = (run: () => unknown): ConfigValidationError => {
	try {
		run();
	} catch (error) {
		expect(error).toBeInstanceOf(ConfigValidationError);
		return error as ConfigValidationError;
	}
	throw new Error('Expected a ConfigValidationError');
};

export const issuePaths = (error: ConfigValidationError) => error.issues.map((issue) => issue.path);
