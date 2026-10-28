import { describe, expect, test } from '@jest/globals';

import { total } from './pricing.ts';

import config from '../config/app.config.yaml';

describe('config in Jest', () => {
	test('merges the test environment file and .env', () => {
		expect(config).toEqual({
			currency: 'USD',
			tax: { rate: 0.1, inclusive: false },
			payments: { provider: 'fake', apiKey: 'example-only-not-a-secret', timeoutMs: 250 },
		});
		expect(Object.isFrozen(config)).toBe(true);
	});

	test('code under test reads the same config', () => {
		expect(total(100)).toBe('$110.00');
	});
});
