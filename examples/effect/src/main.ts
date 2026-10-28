import { Config, Console, Effect, Layer, Redacted, Schema } from 'effect';
import { ConfigService, layerConfigProvider } from 'tyfigo/effect';

import config from '../config/app.config.yaml';

const AppConfigSchema = Schema.Struct({
	name: Schema.String,
	logLevel: Schema.Literals(['debug', 'info', 'warn', 'error']),
	http: Schema.Struct({ port: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65_535 })) }),
	database: Schema.Struct({ url: Schema.String, password: Schema.RedactedFromValue(Schema.String) }),
});

class AppConfig extends ConfigService<AppConfig>()('example/AppConfig', config, AppConfigSchema) {}

const workers = Config.Int('workers').pipe(Config.nested('jobs'));
const queues = Config.schema(Schema.Array(Schema.String), 'queues').pipe(Config.nested('jobs'));

const program = Effect.gen(function* () {
	const app = yield* AppConfig;
	yield* Console.log(
		JSON.stringify({
			name: app.name,
			logLevel: app.logLevel,
			port: app.http.port,
			database: { url: app.database.url, passwordLength: Redacted.value(app.database.password).length },
			jobs: { workers: yield* workers, queues: yield* queues },
		}),
	);
});

program.pipe(Effect.provide(Layer.mergeAll(AppConfig.layer, layerConfigProvider(config))), Effect.runPromise);
