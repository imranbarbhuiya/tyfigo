import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { badValue, fixture, merged, run } from './spawn.ts';

import { makeProject } from '../helpers.ts';

const preload = fileURLToPath(new URL('../../src/bun.ts', import.meta.url));

beforeEach(() => {
	vi.stubEnv('NODE_ENV', 'production');
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('bun --preload tyfigo/bun', () => {
	it('imports the merged config with the environment file and .env', async () => {
		const root = await makeProject(fixture);
		const result = run('bun', ['--preload', preload, 'main.ts'], root);
		expect(result.stderr).toBe('');
		expect(JSON.parse(result.stdout)).toEqual(merged);
	});

	it('leaves plain .yaml and .toml imports to Bun', async () => {
		const root = await makeProject({
			...fixture,
			'data.toml': 'value = "${NOT_A_PLACEHOLDER}"\n',
			'plain.ts': [
				"import data from './data.yaml';",
				"import toml from './data.toml';",
				'console.log(JSON.stringify({ data, toml }));',
				'',
			].join('\n'),
		});
		const result = run('bun', ['--preload', preload, 'plain.ts'], root);
		expect(result.stderr).toBe('');
		expect(JSON.parse(result.stdout)).toEqual({ data: { plain: true }, toml: { value: '${NOT_A_PLACEHOLDER}' } });
	});

	it('fails with the file, line and column of a bad value', async () => {
		const root = await makeProject(fixture);
		const result = run('bun', ['--preload', preload, 'bad.ts'], root);
		expect(result.status).toBe(1);
		expect(result.stderr).toMatch(badValue);
	});

	it('runs from a bunfig.toml preload and under bun test', async () => {
		const root = await makeProject({
			...fixture,
			'bunfig.toml': `preload = [${JSON.stringify(preload)}]\n\n[test]\npreload = [${JSON.stringify(preload)}]\n`,
			'config.test.ts': [
				"import { expect, test } from 'bun:test';",
				"import config from './config/app.config.yaml';",
				"test('config', () => expect(config.db.pool).toBe(20));",
				'',
			].join('\n'),
		});
		const main = run('bun', ['main.ts'], root);
		expect(main.stderr).toBe('');
		expect(JSON.parse(main.stdout)).toEqual(merged);

		const test = run('bun', ['test', './config.test.ts'], root);
		expect(test.stderr).toContain('1 pass');
		expect(test.status).toBe(0);
	});

	it('works as a Bun.build plugin', async () => {
		const root = await makeProject({
			...fixture,
			'config/web.config.yaml': 'title: Shop\n',
			'config/web.production.config.yaml': 'title: Shop (prod)\n',
			'web.ts': "import config from './config/web.config.yaml';\nconsole.log(config.title);\n",
			'build.ts': [
				`import { tyfigo } from ${JSON.stringify(preload)};`,
				'const entry = process.argv[2];',
				"const result = await Bun.build({ entrypoints: [entry], target: 'browser', plugins: [tyfigo()] });",
				'console.log(await result.outputs[0].text());',
				'',
			].join('\n'),
		});
		const web = run('bun', ['build.ts', './web.ts'], root);
		expect(web.status).toBe(0);
		expect(web.stdout).toContain('title: "Shop (prod)"');

		const server = run('bun', ['build.ts', './main.ts'], root);
		expect(server.status).toBe(1);
		expect(server.stderr).toContain(
			"config/app.config.yaml:1:7 - 'port' uses an environment placeholder, which browser builds cannot read (browser-placeholder)",
		);
	});

	it('inlines the config files in a server Bun.build', async () => {
		const root = await makeProject({
			...fixture,
			'build.ts': [
				`import { tyfigo } from ${JSON.stringify(preload)};`,
				"await Bun.build({ entrypoints: ['./main.ts'], target: 'bun', outdir: 'out', plugins: [tyfigo()] });",
				'',
			].join('\n'),
		});
		expect(run('bun', ['build.ts'], root).status).toBe(0);
		const bundle = await readFile(join(root, 'out/main.js'), 'utf8');
		expect(bundle).not.toContain(join(root, 'config'));
		await rm(join(root, 'config'), { recursive: true });
		const result = run('bun', ['out/main.js'], root);
		expect(result.stderr).toBe('');
		expect(JSON.parse(result.stdout)).toEqual(merged);
	});
});
