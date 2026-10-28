import { generateTypes } from './generate.ts';
import { RpcError, RpcErrorCode } from './rpc.ts';

import type { RpcHandler } from './rpc.ts';

export const diagnosticSource = 'tyfigo';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A content mapper for TypeScript's `contentMappers`. It keeps no state per project: a transform reads only the text it is sent,
 * and an environment file reaches its base file through the `import type` in its generated module, so TypeScript tracks that
 * dependency itself.
 */
export const createServer = (): RpcHandler => (method, params) => {
	switch (method) {
		case 'initialize':
			// The protocol spells the encoding `utf-8`.
			// oxlint-disable-next-line unicorn/text-encoding-identifier-case
			return { positionEncoding: 'utf-8', diagnosticSource };
		case 'openProject':
			return {};
		case 'transform':
			if (!isRecord(params) || typeof params.fileName !== 'string' || typeof params.content !== 'string') {
				throw new RpcError(RpcErrorCode.InvalidParams, 'transform expects a fileName and content');
			}
			return generateTypes(params.fileName, params.content);
		case 'closeProject':
			return null;
		default:
			throw new RpcError(RpcErrorCode.MethodNotFound, `Unknown method ${method}`);
	}
};
