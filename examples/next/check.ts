import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const html = readFileSync('.next/server/app/index.html', 'utf8').replaceAll('&quot;', '"');
assert.ok(
	html.includes(
		JSON.stringify({
			supportEmail: 'support@example.com',
			cmsHost: 'cms.example.com',
			revalidateSeconds: 3600,
			hasToken: true,
		}),
	),
	'server component renders the merged server config',
);
assert.match(html, /<p id="client" data-theme="dark">Welcome<\/p>/);
assert.match(html, /<title>tyfigo \+ Next\.js<\/title>/);

const client = readdirSync('.next/static', { recursive: true, withFileTypes: true })
	.filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
	.map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
	.join('\n');
assert.match(client, /Welcome/);
assert.doesNotMatch(client, /Development build/);
assert.doesNotMatch(client, /example-only-not-a-secret/);
console.log('next example: server and client config ok');
