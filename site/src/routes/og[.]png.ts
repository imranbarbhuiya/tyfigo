import { createFileRoute } from '@tanstack/react-router';

import { renderOgImage } from '@/lib/og';
import { site } from '@/lib/shared';

export const Route = createFileRoute('/og.png')({
	server: {
		handlers: {
			GET: () => renderOgImage({ title: 'Config files that tsc understands.', description: site.tagline }),
		},
	},
});
