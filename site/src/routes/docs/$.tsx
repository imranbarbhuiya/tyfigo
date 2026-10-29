import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions';
import { useFumadocsLoader } from 'fumadocs-core/source/client';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
	MarkdownCopyButton,
	ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import { Suspense, use } from 'react';

import { useMDXComponents } from '@/components/mdx';
import { baseOptions } from '@/lib/layout.shared';
import { getPageImageUrl, getPageMarkdownUrl, githubUrl, ogMeta, site } from '@/lib/shared';
import { docs, source } from '@/lib/source';

const loadPage = createServerFn({ method: 'GET' })
	.validator((slugs: string[]) => slugs)
	.middleware([staticFunctionMiddleware])
	.handler(async ({ data: slugs }) => {
		const page = source.getPage(slugs);
		if (!page) throw notFound();

		return {
			path: page.path,
			title: page.data.title,
			description: page.data.description,
			markdownUrl: getPageMarkdownUrl(page).url,
			imageUrl: getPageImageUrl(page.slugs),
			pageTree: await source.serializePageTree(source.getPageTree()),
		};
	});

export const Route = createFileRoute('/docs/$')({
	component: Page,
	loader: async ({ params }) => {
		const data = await loadPage({ data: params._splat?.split('/').filter(Boolean) ?? [] });
		await docs.getPage(data.path)?.preload();
		return data;
	},
	head: ({ loaderData }) => ({
		meta: loaderData
			? [
					{ title: `${loaderData.title} | ${site.name}` },
					...(loaderData.description ? [{ name: 'description', content: loaderData.description }] : []),
					...ogMeta({
						title: `${loaderData.title} | ${site.name}`,
						description: loaderData.description,
						image: loaderData.imageUrl,
					}),
				]
			: [],
	}),
});

function Content({ path, markdownUrl }: { path: string; markdownUrl: string }) {
	const page = docs.getPage(path);
	if (!page) throw new Error(`unknown page: ${path}`);

	const { toc } = use(page.load());
	const MDX = page.body;

	return (
		<DocsPage toc={toc}>
			<DocsTitle>{page.title}</DocsTitle>
			<DocsDescription>{page.description}</DocsDescription>
			<div className="-mt-4 flex flex-row items-center gap-2 border-b pb-6">
				<MarkdownCopyButton markdownUrl={markdownUrl} />
				<ViewOptionsPopover
					markdownUrl={markdownUrl}
					githubUrl={`${githubUrl}/blob/${site.github.branch}/site/content/docs/${path}`}
				/>
			</div>
			<DocsBody>
				<MDX components={useMDXComponents()} />
			</DocsBody>
		</DocsPage>
	);
}

function Page() {
	const { path, pageTree, markdownUrl } = useFumadocsLoader(Route.useLoaderData());

	return (
		<DocsLayout {...baseOptions()} tree={pageTree}>
			<Link to={markdownUrl} hidden />
			<Suspense>
				<Content path={path} markdownUrl={markdownUrl} />
			</Suspense>
		</DocsLayout>
	);
}
