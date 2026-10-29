import { createFileRoute } from '@tanstack/react-router';

import { renderOgImage } from '@/lib/og';
import { decodeImageUrl } from '@/lib/shared';
import { source } from '@/lib/source';

export const Route = createFileRoute('/og/docs/{$}.png')({
	server: {
		handlers: {
			GET: ({ params }) => {
				const page = source.getPage(decodeImageUrl(params._splat?.split('/') ?? []));
				if (!page) return new Response('Not found', { status: 404 });
				return renderOgImage({ title: page.data.title, description: page.data.description });
			},
		},
	},
});
