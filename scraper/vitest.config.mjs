import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['tests/**/*.test.ts','src/**/*.test.js'],exclude:['**/node_modules/**','**/dist/**']}});
