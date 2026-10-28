import { Banner } from './banner.tsx';

import config from '../config/app.config.yaml';

export default function Page() {
	const cms = new URL(config.cms.url);
	return (
		<main>
			<Banner />
			<p id="server">
				{JSON.stringify({
					supportEmail: config.site.supportEmail,
					cmsHost: cms.host,
					revalidateSeconds: config.cms.revalidateSeconds,
					hasToken: config.cms.token.length > 0,
				})}
			</p>
		</main>
	);
}
