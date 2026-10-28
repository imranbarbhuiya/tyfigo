/** @type {import('jest').Config} */
export default {
	testEnvironment: 'node',
	moduleFileExtensions: ['ts', 'js', 'json', 'yaml', 'yml', 'toml', 'jsonc', 'json5'],
	transform: {
		'\\.config\\.(yaml|yml|toml|jsonc|json5)$': 'tyfigo/jest',
		'\\.ts$': '@swc/jest',
	},
};
