<div align="center">

# tyfigo

**Typed, validated application config for TypeScript.**

[![GitHub](https://img.shields.io/github/license/imranbarbhuiya/tyfigo)](https://github.com/imranbarbhuiya/tyfigo/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/v/tyfigo?color=crimson&logo=npm&style=flat-square)](https://www.npmjs.com/package/tyfigo)

</div>

`import config from './app.config.yaml'` gives you the config for the current environment: the base file merged with
`app.<env>.config.yaml` and your local overrides, `${PLACEHOLDERS}` filled in from `.env` files and the real environment, and
the result deep-frozen. The type comes from the file through a TypeScript 7.1 content mapper that runs inside `tsc` and the
editor, so there is no codegen step, and a wrong key or value in any layer is reported at its line in the config file. Add a
Standard Schema (Zod, Valibot, ArkType, …) or an Effect Schema when you need ranges, URLs, enums or required variables.

Read the documentation at [tyfigo.vercel.app](https://tyfigo.vercel.app).

## Install

tyfigo needs TypeScript 7.1, the first release with content mappers, and Node 24 or later (or Bun).

```bash
npm i tyfigo
npm i -D typescript@7.1.0-beta
```

## Register the content mapper

```jsonc
// tsconfig.json
{
	"compilerOptions": {
		"module": "nodenext",
		"strict": true,
		"noEmit": true,
		"allowImportingTsExtensions": true,
	},
	"contentMappers": [
		{
			"package": "tyfigo",
			"extensions": [
				".config.yaml",
				".config.yml",
				".config.toml",
				".config.jsonc",
				".config.json5",
				".config.ini",
				".config.properties",
				".config.xml",
			],
		},
	],
	"include": ["src", "config"],
}
```

`tsc` runs content mappers only with `--runExternalCode`:

```json
{
	"scripts": {
		"typecheck": "tsc --noEmit --runExternalCode"
	}
}
```

Including `config` makes tsc check environment and local files even when no code imports them directly.

## Example

```yaml
# config/app.config.yaml
server:
    host: localhost
    port: ${PORT:-3000}
database:
    url: ${DATABASE_URL}
    pool:
        max: 5
features: [search]
```

```yaml
# config/app.production.config.yaml
server:
    port: 8080
    hostname: 0.0.0.0
database:
    pool:
        max: twenty
features: [search, 42]
```

```ts
// src/main.ts
import config from '../config/app.config.yaml';

const port: string = config.server.port;
```

The type of `config` comes from the base file, widened so other environments can change values:

```ts
// const config: {
//   readonly server: { readonly host: string; readonly port: number };
//   readonly database: { readonly url: string; readonly pool: { readonly max: number } };
//   readonly features: readonly string[];
// }
```

and `tsc --noEmit --runExternalCode` reports each mistake at its line in the YAML or the code:

```txt
config/app.production.config.yaml(3,3): error TS2353: Object literal may only specify known properties, and 'hostname' does not exist in type '{ readonly host?: string | undefined; readonly port?: number | undefined; }'.
config/app.production.config.yaml(6,5): error TS2322: Type 'string' is not assignable to type 'number'.
config/app.production.config.yaml(7,20): error TS2322: Type 'number' is not assignable to type 'string'.
src/main.ts(3,7): error TS2322: Type 'number' is not assignable to type 'string'.
```

Layers are read in this order, each one winning over the last: `app.config.yaml`, `app.<env>.config.yaml`,
`app.local.config.yaml`, `app.<env>.local.config.yaml`. The environment is `NODE_ENV` unless you pass `environment`.
Placeholders (`${VAR}`, `${VAR:-default}`, `${VAR:?message}`) read `.env`, `.env.local`, `.env.<env>` and `.env.<env>.local`,
with real environment variables on top. tyfigo never writes `process.env`.

## Schemas

`loadConfig` validates a config import and `loadEnv` validates environment variables, with any Standard Schema or an Effect
Schema. Errors list every issue with the `file:line:column` the value came from.

```ts
import { loadConfig, loadEnv } from 'tyfigo';
import { z } from 'zod';

import config from '../config/app.config.yaml';

const Config = z.object({
	server: z.object({ host: z.string(), port: z.number().int().positive() }),
	database: z.object({ url: z.url({ protocol: /^postgres$/ }) }),
});

const settings = loadConfig(config, Config);
const env = loadEnv(z.object({ NODE_ENV: z.enum(['development', 'production', 'test']).default('development') }));
```

`loadConfigAsync` and `loadEnvAsync` take async schemas.

## Effect

`tyfigo/effect` has the same loaders returning Effects that fail with a typed `ConfigError`, plus `ConfigService`, layers and a
`ConfigProvider` that reads a config file. See [Effect](https://tyfigo.vercel.app/docs/effect).

## Runtimes and bundlers

| Target                       | Setup                                                                                                | Example                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Node 24+                     | `node --import tyfigo/register src/main.ts`                                                          | [node](https://github.com/imranbarbhuiya/tyfigo/tree/main/examples/node)       |
| Bun                          | `preload = ["tyfigo/bun"]` in `bunfig.toml`; `plugins: [tyfigo()]` from `tyfigo/bun` in `Bun.build`  | [bun](https://github.com/imranbarbhuiya/tyfigo/tree/main/examples/bun)         |
| nub                          | `"preload": ["tyfigo/register"]` in `nub.jsonc`                                                      | [nub](https://github.com/imranbarbhuiya/tyfigo/tree/main/examples/nub)         |
| Vite and Vitest              | `plugins: [tyfigo()]` from `tyfigo/vite`                                                             | [vite](https://github.com/imranbarbhuiya/tyfigo/tree/main/examples/vite)       |
| Next.js (webpack, Turbopack) | `export default withTyfigo({})` from `tyfigo/next`                                                   | [next](https://github.com/imranbarbhuiya/tyfigo/tree/main/examples/next)       |
| esbuild and tsup             | `plugins: [tyfigo()]` (tsup: `esbuildPlugins`) from `tyfigo/esbuild`                                 | [esbuild](https://github.com/imranbarbhuiya/tyfigo/tree/main/examples/esbuild) |
| Rollup                       | `plugins: [tyfigo({ target: 'server' })]` from `tyfigo/rollup` (defaults to browser)                 |                                                                                |
| Rolldown and tsdown          | `plugins: [tyfigo()]` from `tyfigo/rolldown`                                                         |                                                                                |
| webpack                      | `plugins: [tyfigo()]` from `tyfigo/webpack`                                                          | [webpack](https://github.com/imranbarbhuiya/tyfigo/tree/main/examples/webpack) |
| Rspack and Rsbuild           | `plugins: [tyfigo()]` from `tyfigo/rspack` or `tyfigo/rsbuild`                                       | [rspack](https://github.com/imranbarbhuiya/tyfigo/tree/main/examples/rspack)   |
| Jest                         | `'tyfigo/jest'` as the `transform` for config files, with their extensions in `moduleFileExtensions` | [jest](https://github.com/imranbarbhuiya/tyfigo/tree/main/examples/jest)       |

Browser builds get the base and environment files inlined, and a `${VAR}` placeholder in a client bundle fails the build.
Server bundles inline the layer files and read `.env` files and environment variables when they start. See
[Browser builds](https://tyfigo.vercel.app/docs/browser-builds).

## Formats

| Suffix                        | Format        |
| ----------------------------- | ------------- |
| `.config.yaml`, `.config.yml` | YAML          |
| `.config.toml`                | TOML          |
| `.config.jsonc`               | JSONC         |
| `.config.json5`               | JSON5         |
| `.config.ini`                 | INI           |
| `.config.properties`          | `.properties` |
| `.config.xml`                 | XML           |

## tyfigo and Motherload

[Motherload](https://motherload.dev) also imports data files through TypeScript 7.1 content mappers, but it is a general data
loader: import any `.yaml`, `.toml`, `.csv`, `.md` or other data file and get its contents, typed as `as const` would type them. tyfigo only claims `*.config.*` files and is for the settings your app reads at start-up: widened
types, layered environment files checked against the base, placeholders and schema validation. They can share a project,
since TypeScript gives each extension one owner and the longest suffix wins, so tyfigo can own `.config.yaml` while
Motherload owns `.yaml`. See [tyfigo and Motherload](https://tyfigo.vercel.app/docs#tyfigo-and-motherload).

## Buy me some doughnuts

If you want to support me by donating, you can do so by using any of the following methods. Thank you very much in advance!

<a href="https://github.com/sponsors/imranbarbhuiya" target="_blank"><img src="https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86" alt="Buy Me A Coffee" height="41" width="174"></a>
<a href="https://www.buymeacoffee.com/parbez" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174"></a>
<a href='https://ko-fi.com/Y8Y1CBIJH' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://cdn.ko-fi.com/cdn/kofi4.png?v=3' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>

## Contributors ✨

Thanks goes to these wonderful people:

<a href="https://github.com/imranbarbhuiya/tyfigo/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=imranbarbhuiya/tyfigo" />
</a>
