import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';

assert.doesNotMatch(readFileSync('dist/main.js', 'utf8'), /amqp:/);

const output = execFileSync(process.execPath, ['dist/main.js'], {
	env: { PATH: process.env.PATH, NODE_ENV: 'production' },
	encoding: 'utf8',
});
assert.deepEqual(JSON.parse(output), {
	service: 'tyfigo-esbuild-example',
	port: 8080,
	concurrency: 16,
	maxDelayMs: 5000,
	queueHost: 'localhost:5672',
});
console.log('esbuild example: bundled config ok');
