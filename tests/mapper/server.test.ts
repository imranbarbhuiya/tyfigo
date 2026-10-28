import { Buffer } from 'node:buffer';
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { generateTypes } from '../../src/mapper/generate.ts';
import { encodeMessage, MessageReader, RpcErrorCode, serve } from '../../src/mapper/rpc.ts';
import { createServer } from '../../src/mapper/server.ts';

/**
 * Sends `messages` (framed unless they are already bytes) to a server in chunks of `chunkSize` bytes and returns its responses.
 */
const exchange = async (messages: readonly unknown[], chunkSize = Infinity) => {
	const input = new PassThrough();
	const output = new PassThrough();
	const chunks: Buffer[] = [];
	output.on('data', (chunk: Buffer) => chunks.push(chunk));
	const done = serve(createServer(), input, output);
	const bytes = Buffer.concat(
		messages.map((message) => (Buffer.isBuffer(message) ? message : encodeMessage(message))),
	);
	for (let start = 0; start < bytes.length; start += chunkSize) input.write(bytes.subarray(start, start + chunkSize));
	input.end();
	await done;
	return new MessageReader().push(Buffer.concat(chunks)).map((body) => JSON.parse(body) as unknown);
};

describe('mapper server', () => {
	it('answers the content mapper protocol', async () => {
		const responses = await exchange(
			[
				{ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
				{
					jsonrpc: '2.0',
					id: 2,
					method: 'openProject',
					params: { configFileName: '/p/tsconfig.json', projectHandle: 1 },
				},
				{
					jsonrpc: '2.0',
					id: 3,
					method: 'transform',
					params: { fileName: '/p/app.config.yaml', content: 'näme: ✓\n', projectHandle: 1 },
				},
				{ jsonrpc: '2.0', method: 'closeProject', params: { projectHandle: 1 } },
				{ jsonrpc: '2.0', id: 4, method: 'closeProject', params: { projectHandle: 1 } },
			],
			7,
		);
		expect(responses).toEqual([
			// oxlint-disable-next-line unicorn/text-encoding-identifier-case
			{ jsonrpc: '2.0', id: 1, result: { positionEncoding: 'utf-8', diagnosticSource: 'tyfigo' } },
			{ jsonrpc: '2.0', id: 2, result: {} },
			{
				jsonrpc: '2.0',
				id: 3,
				result: generateTypes('/p/app.config.yaml', 'näme: ✓\n'),
			},
			{ jsonrpc: '2.0', id: 4, result: null },
		]);
	});

	it('reports unknown methods, bad params and bad JSON', async () => {
		const body = Buffer.from('{oops');
		const responses = await exchange([
			{ jsonrpc: '2.0', id: 1, method: 'shutdown' },
			{ jsonrpc: '2.0', id: 2, method: 'transform', params: { fileName: 1 } },
			Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]),
		]);
		expect(responses).toMatchObject([
			{ id: 1, error: { code: RpcErrorCode.MethodNotFound } },
			{ id: 2, error: { code: RpcErrorCode.InvalidParams } },
			{ id: null, error: { code: RpcErrorCode.ParseError } },
		]);
	});
});
