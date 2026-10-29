import { createGetUrl } from 'fumadocs-core/source';

import site from '../../site.config.yaml';

export { site };

export const docsRoute = '/docs';

export const githubUrl = `https://github.com/${site.github.user}/${site.github.repo}`;

const getDocsUrl = createGetUrl(docsRoute);

function withExtension(slugs: string[], extension: string) {
	const segments = [...slugs];
	if (segments.length === 0) segments.push(`index${extension}`);
	else segments[segments.length - 1] += extension;
	return segments;
}

function withoutExtension(segments: string[], extension: string) {
	if (segments.length === 0) return [];
	const out = [...segments];
	const last = out.at(-1)!;
	if (last.endsWith(extension)) out[out.length - 1] = last.slice(0, -extension.length);
	if (out.length === 1 && out[0] === 'index') out.pop();
	return out;
}

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
	const segments = withExtension(page.slugs, '.md');
	return { segments, url: getDocsUrl(segments, page.locale) };
}

export function decodeMarkdownUrl(segments: string[]) {
	return withoutExtension(segments, '.md');
}

export function getPageImageUrl(slugs: string[]) {
	return `/og/docs/${withExtension(slugs, '.png').join('/')}`;
}

export function decodeImageUrl(segments: string[]) {
	return withoutExtension(segments, '.png');
}

export function ogMeta({ title, description, image }: { title: string; description?: string; image: string }) {
	const imageUrl = new URL(image, site.url).href;
	return [
		{ property: 'og:title', content: title },
		...(description ? [{ property: 'og:description', content: description }] : []),
		{ property: 'og:type', content: 'website' },
		{ property: 'og:site_name', content: site.name },
		{ property: 'og:image', content: imageUrl },
		{ property: 'og:image:width', content: '1200' },
		{ property: 'og:image:height', content: '630' },
		{ name: 'twitter:card', content: 'summary_large_image' },
		{ name: 'twitter:title', content: title },
		...(description ? [{ name: 'twitter:description', content: description }] : []),
		{ name: 'twitter:image', content: imageUrl },
	];
}
