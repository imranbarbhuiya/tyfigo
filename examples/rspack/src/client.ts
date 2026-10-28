import config from '../config/app.config.yaml';

document.title = config.title;
if (config.analytics.enabled && Math.random() < config.analytics.sampleRate) {
	document.body.dataset.analytics = 'on';
}
document.body.append(Object.assign(document.createElement('a'), { href: config.links.docs, textContent: 'Docs' }));
