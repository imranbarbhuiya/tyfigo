import config from '../config/app.config.yaml';

export const total = (net: number): string => {
	const gross = config.tax.inclusive ? net : net * (1 + config.tax.rate);
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: config.currency }).format(gross);
};
