import { Buffer } from 'node:buffer';
import process from 'node:process';

const results = {
	// oxlint-disable-next-line unicorn/text-encoding-identifier-case
	initialize: () => ({ positionEncoding: 'utf-8', diagnosticSource: 'other-mapper' }),
	openProject: () => ({}),
	transform: () => ({ text: 'declare const data: { readonly other: true };\nexport default data;\n', extension: '.ts' }),
	closeProject: () => null,
};

let buffer = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
	buffer = Buffer.concat([buffer, chunk]);
	for (;;) {
		const end = buffer.indexOf('\r\n\r\n');
		if (end === -1) return;
		const length = Number(/content-length:\s*(\d+)/iu.exec(buffer.subarray(0, end).toString())?.[1]);
		if (buffer.length < end + 4 + length) return;
		const message = JSON.parse(buffer.subarray(end + 4, end + 4 + length).toString());
		buffer = buffer.subarray(end + 4 + length);
		if (!('id' in message)) continue;
		const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: results[message.method]?.() ?? null }));
		process.stdout.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]));
	}
});
