import { siBun, siEsbuild, siJest, siNextdotjs, siNodedotjs, siRollupdotjs, siVite, siWebpack } from 'simple-icons';

const nub = {
	viewBox: '5 7 23 17',
	path: 'M10.977 11.698V20.641L13.050 21.337V21.9H6.106V21.337L8.223 20.611V12.038Q7.956 11.728 7.490 11.468Q7.024 11.209 6.106 10.898V10.469L10.074 8.899H10.429ZM14.708 21.337 16.796 20.641V13.638Q16.796 12.882 16.485 12.342Q16.174 11.802 15.567 11.520Q14.960 11.239 14.071 11.239Q12.976 11.239 12.058 11.616Q11.140 11.994 10.740 12.542L10.162 12.024Q10.992 11.120 11.717 10.521Q12.443 9.921 13.109 9.566Q13.775 9.210 14.471 9.055Q15.167 8.899 15.922 8.899Q17.773 8.899 18.661 10.062Q19.550 11.224 19.550 13.712V20.611L21.697 21.337V21.9H14.708Z',
	dot: { cx: 25.295, cy: 20.175, r: 2.3 },
};

export const targets = [
	{ name: 'Node', path: 'runtimes/node', icon: siNodedotjs },
	{ name: 'Bun', path: 'runtimes/bun', icon: siBun },
	{ name: 'nub', path: 'runtimes/nub', icon: nub },
	{ name: 'Vite', path: 'bundlers/vite', icon: siVite },
	{ name: 'Next.js', path: 'bundlers/next', icon: siNextdotjs },
	{ name: 'esbuild', path: 'bundlers/esbuild', icon: siEsbuild },
	{ name: 'Rollup', path: 'bundlers/rollup', icon: siRollupdotjs },
	{ name: 'webpack', path: 'bundlers/webpack', icon: siWebpack },
	{ name: 'Jest', path: 'runtimes/jest', icon: siJest },
];

interface Icon {
	path: string;
	viewBox?: string;
	dot?: { cx: number; cy: number; r: number };
}

export function Logo({ icon }: { icon: Icon }) {
	return (
		<svg aria-hidden viewBox={icon.viewBox ?? '0 0 24 24'} fill="currentColor">
			<path d={icon.path} />
			{icon.dot ? <circle {...icon.dot} /> : null}
		</svg>
	);
}
