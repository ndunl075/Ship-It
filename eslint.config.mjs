import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
export default ts.config({ ignores: ['.worktrees/**', '.pnpm-store/**', '**/dist/**', '**/node_modules/**', '**/.wrangler/**', '**/coverage/**'] }, js.configs.recommended, ...ts.configs.recommended, { languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.worker } }, rules: { '@typescript-eslint/no-explicit-any': 'error' } });
