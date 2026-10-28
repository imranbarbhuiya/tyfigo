import { spawnSync } from 'node:child_process';

export interface SpawnResult {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

/**
 * Runs a real `node` or `bun` binary from `PATH` in `cwd`.
 */
export const run = (command: 'node' | 'bun', args: readonly string[], cwd: string): SpawnResult => {
	const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 30_000 });
	if (result.error) throw result.error;
	return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

export const fixture = {
	'package.json': '{ "type": "module" }',
	'.env': 'DB_HOST=db.internal\nPORT=8080\n',
	'.env.production': 'PORT=9090\n',
	'config/app.config.yaml': 'port: ${PORT:-3000}\nname: app\ndb:\n  host: ${DB_HOST}\n  pool: 5\n',
	'config/app.production.config.yaml': 'db:\n  pool: 20\n',
	'config/cache.config.toml': 'ttl = 60\n',
	'data.yaml': 'plain: true\n',
	'main.ts': [
		"import config from './config/app.config.yaml';",
		"import cache from './config/cache.config.toml';",
		'console.log(JSON.stringify({ config, cache, frozen: Object.isFrozen(config.db) }));',
		'',
	].join('\n'),
	'plain.ts': "import data from './data.yaml';\nconsole.log(JSON.stringify(data));\n",
	'bad.ts': "import config from './config/bad.config.yaml';\nconsole.log(config);\n",
	'config/bad.config.yaml': 'port: 3000\n',
	'config/bad.production.config.yaml': 'port: not-a-number\n',
};

export const merged = {
	config: { port: 9_090, name: 'app', db: { host: 'db.internal', pool: 20 } },
	cache: { ttl: 60 },
	frozen: true,
};

export const badValue =
	/config\/bad\.production\.config\.yaml:1:7 - Expected number at 'port' as in bad\.config\.yaml, got string \(type-mismatch\)/;
