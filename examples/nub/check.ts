import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const output = execFileSync('nub', ['src/main.ts'], {
	env: { PATH: process.env.PATH, NODE_ENV: 'production' },
	encoding: 'utf8',
});

assert.deepEqual(JSON.parse(output), {
	greeting: 'Hello from production',
	port: 8080,
	bucketUrl: 's3://example-bucket?region=eu-west-1',
});
console.log('nub example: merged config ok');
