import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';

const client = readFileSync('dist/client/client.js', 'utf8');
assert.match(client, /https:\/\/example\.com\/docs/);
assert.match(client, /\.25/);
assert.doesNotMatch(client, /localhost:3000/);
assert.doesNotMatch(client, /redis:/);

const output = execFileSync(process.execPath, ['dist/server/server.cjs'], {
	env: { PATH: process.env.PATH, NODE_ENV: 'production' },
	encoding: 'utf8',
});
assert.deepEqual(JSON.parse(output), { port: 8080, cache: { url: 'redis://localhost:6379', maxEntries: 10000 } });
console.log('rspack example: client and server config ok');
