import config from '../config/app.config.yaml';

const bucketUrl = `s3://${config.storage.bucket}?region=${config.storage.region}`;

console.log(JSON.stringify({ greeting: config.greeting, port: config.port, bucketUrl }));
