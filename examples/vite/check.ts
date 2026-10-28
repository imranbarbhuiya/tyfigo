import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import process from 'node:process';

const assets = readdirSync('dist/assets').filter((file) => file.endsWith('.js'));
const client = assets.map((file) => readFileSync(`dist/assets/${file}`, 'utf8')).join('\n');
assert.match(client, /https:\/\/example\.com\/api/);
assert.match(client, /dark/);
assert.doesNotMatch(client, /localhost:5173/);
assert.doesNotMatch(client, /example-only-not-a-secret/);

const output = execFileSync(process.execPath, ['dist/server/server.js'], {
	env: { PATH: process.env.PATH, NODE_ENV: 'production' },
	encoding: 'utf8',
});
assert.deepEqual(JSON.parse(output), { port: 8080, compression: true, hasSecret: true });
console.log('vite example: client and SSR config ok');
