import tsparser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
	{
		ignores: [
			'dist/**',
			'node_modules/**',
			'main.js',
			'main.css',
			'styles.css',
			'styles.css.backup',
			'**/*.backup.ts',
			'src/vendor/**',
			'Obsidian/**',
			'StorytellerSuite/**',
			'screenshots/**',
		],
	},
	...obsidianmd.configs.recommended,
	{
		files: ['src/**/*.ts', '*.ts'],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				project: './tsconfig.json',
				tsconfigRootDir: import.meta.dirname,
				sourceType: 'module',
			},
		},
	},
]);
