import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';

import { baseOptions } from '@/lib/layout.shared';
import { githubUrl, site } from '@/lib/shared';

export const Route = createFileRoute('/')({
	component: Home,
});

const layers = [
	{
		file: 'app.config.yaml',
		note: 'base',
		lines: ['server:', '  host: localhost', '  port: ${PORT:-3000}', 'features: [search]'],
	},
	{
		file: 'app.production.config.yaml',
		note: 'NODE_ENV=production',
		lines: ['server:', '  host: 0.0.0.0', 'features: [search, billing]'],
	},
	{ file: '.env', note: 'values only', lines: ['PORT=8080'] },
];

const targets = [
	['Node', 'runtimes/node'],
	['Bun', 'runtimes/bun'],
	['nub', 'runtimes/nub'],
	['Vite', 'bundlers/vite'],
	['Next.js', 'bundlers/next'],
	['esbuild', 'bundlers/esbuild'],
	['Rollup', 'bundlers/rollup'],
	['webpack', 'bundlers/webpack'],
	['Jest', 'runtimes/jest'],
] as const;

function Home() {
	return (
		<HomeLayout {...baseOptions()}>
			<main className="tf-home">
				<section className="tf-hero">
					<div className="tf-hero-copy">
						<h1>Config files that tsc understands.</h1>
						<p>
							Import <code>app.config.yaml</code> and get the merged, environment-specific object with a type inferred
							from the file itself. Environment files are checked against the base, and mistakes point at the line in
							the YAML.
						</p>
						<div className="tf-actions">
							<Link className="tf-button tf-button-primary" to="/docs/$" params={{ _splat: 'getting-started' }}>
								Get started
							</Link>
							<Link className="tf-button" to="/docs/$" params={{ _splat: '' }}>
								Read the introduction
							</Link>
						</div>
						<pre className="tf-install">
							<code>npm i tyfigo</code>
						</pre>
					</div>

					<figure className="tf-stack" aria-label="Three layers merged into one typed config">
						<ol className="tf-sheets">
							{layers.map((layer) => (
								<li key={layer.file} className="tf-sheet">
									<header>
										<span className="tf-sheet-file">{layer.file}</span>
										<span className="tf-sheet-note">{layer.note}</span>
									</header>
									<pre>
										<code>
											{layer.lines
												.join('\n')
												.split(/(\$\{[^}]+\})/u)
												.map((part, index) =>
													index % 2 === 1 ? (
														<mark key={part} className="tf-placeholder">
															{part}
														</mark>
													) : (
														part
													),
												)}
										</code>
									</pre>
								</li>
							))}
						</ol>
						<figcaption className="tf-result">
							<pre>
								<code>
									<span className="tf-c">{"import config from './app.config.yaml';\n\n"}</span>
									{'config.server.port  '}
									<span className="tf-c">{'// 8080, typed number\n'}</span>
									{'config.server.host  '}
									<span className="tf-c">{"// '0.0.0.0', typed string\n"}</span>
									{'config.features     '}
									<span className="tf-c">{'// readonly string[]'}</span>
								</code>
							</pre>
						</figcaption>
					</figure>
				</section>

				<section className="tf-split">
					<div>
						<h2>Checked when you type-check</h2>
						<p>
							A TypeScript 7.1 content mapper turns each config file into a type. Unknown keys, wrong types in an
							environment file and syntax errors are reported by <code>tsc</code> at their line in the config file.
						</p>
					</div>
					<div>
						<h2>Validated when it loads</h2>
						<p>
							Placeholders such as <code>{'${DATABASE_URL}'}</code> resolve from <code>.env</code> files and the real
							environment. Add a Zod, Valibot, ArkType or Effect schema with <code>loadConfig</code> for refinements,
							with every problem listed by file and line.
						</p>
					</div>
				</section>

				<section className="tf-targets">
					<h2>Runs where your code runs</h2>
					<ul>
						{targets.map(([name, path]) => (
							<li key={path}>
								<Link to="/docs/$" params={{ _splat: path }}>
									{name}
								</Link>
							</li>
						))}
					</ul>
				</section>

				<footer className="tf-footer">
					{site.name} is MIT licensed. The source and examples are on <a href={githubUrl}>GitHub</a>.
				</footer>
			</main>
		</HomeLayout>
	);
}
