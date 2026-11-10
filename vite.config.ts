/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { aiCache } from './vite-plugins/ai-cache.ts'
import { sopSamples } from './vite-plugins/sop-samples.ts'

// The public repository, for the 源代码 link the AGPL asks for (SuperDoc is
// AGPL-3.0): Vercel tells the build which GitHub repository it built from.
// Empty in local builds, and the link is not shown.
const { VERCEL_GIT_REPO_OWNER: owner, VERCEL_GIT_REPO_SLUG: slug } = process.env
const sourceUrl = owner && slug ? `https://github.com/${owner}/${slug}` : ''

// https://vite.dev/config/
export default defineConfig({
  define: { __SOURCE_URL__: JSON.stringify(sourceUrl) },
  plugins: [react(), tailwindcss(), sopSamples(import.meta.dirname), aiCache(import.meta.dirname)],
  resolve: {
    alias: { '@': `${import.meta.dirname}/src` },
  },
  // 审阅 opens the sample .docx itself (inlined, see src/features/change/review/docx.ts).
  assetsInclude: ['**/*.docx'],
  server: {
    fs: {
      // Vite defaults + answers/ (evaluation-only; the app must never serve it)
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/answers/**'],
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'vite-plugins/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
