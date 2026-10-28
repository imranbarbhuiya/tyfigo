import config from '../config/app.config.yaml';

import type { ReactNode } from 'react';

export const metadata = { title: config.site.name };

export default function RootLayout({ children }: { readonly children: ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
