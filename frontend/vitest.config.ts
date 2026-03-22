import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    test: {
        // jsdom simulates a browser environment so React components can render
        environment: 'jsdom',
        // Run setup file before each test file (imports @testing-library/jest-dom matchers)
        setupFiles: ['./vitest.setup.ts'],
        // Include both plain TS tests and React component tests
        include: ['tests/**/*.test.ts', '__tests__/**/*.test.{ts,tsx}'],
        globals: true,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        },
    },
})
