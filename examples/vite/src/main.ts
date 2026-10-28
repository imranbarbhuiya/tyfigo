import config from '../config/app.config.jsonc';

const app = document.querySelector<HTMLElement>('#app');
if (app) {
	app.dataset.theme = config.theme;
	app.textContent = `${config.title}: ${config.api.baseUrl} (${config.api.retries} retries)`;
}
