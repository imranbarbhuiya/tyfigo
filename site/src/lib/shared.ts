import { createGetUrl } from 'fumadocs-core/source';

import site from '../../site.config.yaml';

export { site };

export const docsRoute = '/docs';

export const githubUrl = `https://github.com/${site.github.user}/${site.github.repo}`;

const getDocsUrl = createGetUrl(docsRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
	const segments = [...page.slugs];
	if (segments.length === 0) segments.push('index.md');
	else segments[segments.length - 1] += '.md';
	return { segments, url: getDocsUrl(segments, page.locale) };
}

export function decodeMarkdownUrl(segments: string[]) {
	if (segments.length === 0) return [];
	const out = [...segments];
	out[out.length - 1] = out.at(-1)!.replace(/\.md$/, '');
	if (out.length === 1 && out[0] === 'index') out.pop();
	return out;
}
