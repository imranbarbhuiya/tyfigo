import { Buffer } from 'node:buffer';

import type { Readable, Writable } from 'node:stream';

export type RequestId = number | string | null;

export interface RpcMessage {
	readonly jsonrpc: '2.0';
	readonly id?: RequestId;
	readonly method?: string;
	readonly params?: unknown;
}

export class RpcError extends Error {
	readonly code: number;

	constructor(code: number, message: string) {
		super(message);
		this.code = code;
	}
}

export const RpcErrorCode = {
	ParseError: -32_700,
	InvalidRequest: -32_600,
	MethodNotFound: -32_601,
	InvalidParams: -32_602,
	InternalError: -32_603,
} as const;

/**
 * Handles one request or notification and returns its result.
 */
export type RpcHandler = (method: string, params: unknown) => unknown;

const separator = Buffer.from('\r\n\r\n');

export const encodeMessage = (message: unknown): Buffer => {
	const body = Buffer.from(JSON.stringify(message), 'utf8');
	return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body]);
};

/**
 * Splits a stream of `Content-Length` framed chunks into message bodies.
 */
export class MessageReader {
	#buffer: Buffer = Buffer.alloc(0);

	push(chunk: Buffer): string[] {
		this.#buffer = Buffer.concat([this.#buffer, chunk]);
		const bodies: string[] = [];
		for (;;) {
			const end = this.#buffer.indexOf(separator);
			if (end === -1) return bodies;
			const header = this.#buffer.subarray(0, end).toString('ascii');
			const match = /^content-length:\s*(\d+)\s*$/imu.exec(header);
			if (!match) throw new RpcError(RpcErrorCode.ParseError, `Missing Content-Length in header: ${header}`);
			const start = end + separator.length;
			const length = Number(match[1]);
			if (this.#buffer.length < start + length) return bodies;
			bodies.push(this.#buffer.subarray(start, start + length).toString('utf8'));
			this.#buffer = this.#buffer.subarray(start + length);
		}
	}
}

const isMessage = (value: unknown): value is RpcMessage =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The response to one message body, or `undefined` for a notification.
 */
export const dispatch = (body: string, handle: RpcHandler): object | undefined => {
	let message: unknown;
	try {
		message = JSON.parse(body);
	} catch (error) {
		return { jsonrpc: '2.0', id: null, error: { code: RpcErrorCode.ParseError, message: String(error) } };
	}

	if (!isMessage(message) || typeof message.method !== 'string') {
		const id = isMessage(message) ? (message.id ?? null) : null;
		return { jsonrpc: '2.0', id, error: { code: RpcErrorCode.InvalidRequest, message: 'Invalid request' } };
	}

	const isNotification = !('id' in message);
	try {
		const result = handle(message.method, message.params);
		return isNotification ? undefined : { jsonrpc: '2.0', id: message.id ?? null, result: result ?? null };
	} catch (error) {
		if (isNotification) return undefined;
		const code = error instanceof RpcError ? error.code : RpcErrorCode.InternalError;
		const text = error instanceof Error ? error.message : String(error);
		return { jsonrpc: '2.0', id: message.id ?? null, error: { code, message: text } };
	}
};

/**
 * Answers JSON-RPC 2.0 messages from `input` on `output` until `input` ends.
 */
export const serve = (handle: RpcHandler, input: Readable, output: Writable): Promise<void> =>
	new Promise((resolve, reject) => {
		const reader = new MessageReader();
		input.on('data', (chunk: Buffer) => {
			let bodies: string[];
			try {
				bodies = reader.push(chunk);
			} catch (error) {
				reject(error instanceof Error ? error : new Error(String(error)));
				return;
			}
			for (const body of bodies) {
				const response = dispatch(body, handle);
				if (response) output.write(encodeMessage(response));
			}
		});
		input.once('end', () => resolve());
		input.once('error', reject);
	});
