'use client';

import config from '../config/public.config.yaml';

export function Banner() {
	return (
		<p id="client" data-theme={config.theme}>
			{config.banner}
		</p>
	);
}
