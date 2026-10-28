import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';

assert.doesNotMatch(readFileSync('dist/main.cjs', 'utf8'), /example-only-not-a-secret/);

const output = execFileSync(process.execPath, ['dist/main.cjs'], {
	env: { PATH: process.env.PATH, NODE_ENV: 'production' },
	encoding: 'utf8',
});
assert.deepEqual(JSON.parse(output), {
	name: 'tyfigo-webpack-example',
	port: 8080,
	cors: ['https://example.com'],
	mail: { from: 'noreply@example.com', sandbox: false, hasApiKey: true },
});
console.log('webpack example: bundled config ok');
