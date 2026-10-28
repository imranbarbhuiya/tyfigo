import { githubUrl, site } from './shared';

import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
	return {
		nav: {
			title: (
				<span className="tf-wordmark">
					<span aria-hidden className="tf-wordmark-mark" />
					{site.name}
				</span>
			),
		},
		githubUrl,
		links: [{ text: 'Docs', url: '/docs', active: 'nested-url' }],
	};
}
