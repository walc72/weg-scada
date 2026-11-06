// ESLint: reglas de JS/TS recomendadas y las de hooks de React (orden de hooks y dependencias de efectos).
// Corre en el CI con `npx eslint src`: los errores cortan, las advertencias solo se muestran.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // El proyecto usa `any` a propósito en los límites con la API y React Flow
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // `s.has(k) ? s.delete(k) : s.add(k)` para alternar valores en un Set
      '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true }],
      // shadcn: `interface InputProps extends ...` sin miembros propios
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
    },
  },
)
