import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { fumadocsMdx } from 'fumadocs-mdx/vite';
import { nitro } from 'nitro/vite';
import tyfigo from 'tyfigo/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tyfigo(),
		fumadocsMdx(),
		tailwindcss(),
		tanstackStart({
			prerender: { enabled: true, crawlLinks: true },
			pages: [{ path: '/docs' }, { path: '/api/search' }, { path: '/llms.txt' }, { path: '/llms-full.txt' }],
		}),
		react(),
		nitro({ preset: 'vercel' }),
	],
	resolve: {
		tsconfigPaths: true,
	},
});
