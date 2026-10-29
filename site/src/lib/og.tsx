import { ImageResponse } from 'takumi-js/response';

import { site } from './shared';

const colors = {
	background: '#0f1715',
	foreground: '#e3eae6',
	muted: '#9aaaa3',
	border: '#26332f',
	grid: '#18221f',
	primary: '#5dd3be',
	mark: '#0b6b5e',
};

export function renderOgImage({ title, description }: { title: string; description?: string }) {
	return new ImageResponse(
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				width: '100%',
				height: '100%',
				padding: '72px 80px',
				backgroundColor: colors.background,
				backgroundImage: `linear-gradient(${colors.grid} 1px, transparent 1px), linear-gradient(90deg, ${colors.grid} 1px, transparent 1px)`,
				backgroundSize: '48px 48px',
				color: colors.foreground,
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
				<svg width="56" height="56" viewBox="0 0 32 32">
					<rect x="3" y="3" width="19" height="19" rx="3" fill="none" stroke={colors.foreground} strokeWidth="3" />
					<rect x="11" y="11" width="18" height="18" rx="3" fill={colors.mark} />
				</svg>
				<span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-0.02em' }}>{site.name}</span>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', gap: 24 }}>
				<span style={{ fontSize: 80, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.05 }}>{title}</span>
				{description ? (
					<span style={{ fontSize: 34, lineHeight: 1.35, color: colors.muted, maxWidth: 960 }}>{description}</span>
				) : null}
			</div>
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					marginTop: 56,
					paddingTop: 28,
					borderTop: `2px solid ${colors.border}`,
					fontSize: 26,
					color: colors.muted,
				}}
			>
				<span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
					<span style={{ color: colors.primary }}>app.config.yaml</span>
					<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth="2">
						<path d="M5 12h14M13 6l6 6-6 6" />
					</svg>
					<span>typed, validated config</span>
				</span>
				<span>{new URL(site.url).host}</span>
			</div>
		</div>,
		{ width: 1200, height: 630, format: 'png', headers: { 'Cache-Control': 'public, max-age=86400' } },
	);
}
