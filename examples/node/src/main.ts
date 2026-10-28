import { loadConfig, loadEnv } from 'tyfigo';
import { z } from 'zod';

import config from '../config/app.config.yaml';

const Config = z.object({
	name: z.string(),
	server: z.object({ host: z.string(), port: z.number().int().positive() }),
	database: z.object({
		url: z.url({ protocol: /^postgres$/ }),
		pool: z.object({ min: z.number().int(), max: z.number().int() }),
	}),
	features: z.array(z.string()),
});

const Env = z.object({ NODE_ENV: z.enum(['development', 'production', 'test']).default('development') });

const settings = loadConfig(config, Config);
const env = loadEnv(Env);

console.log(JSON.stringify({ environment: env.NODE_ENV, config: settings }));
