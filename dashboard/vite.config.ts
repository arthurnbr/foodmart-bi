import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // relative base: the built dashboard works from any folder or static host
  base: './',
  optimizeDeps: {
    // both libraries locate their worker next to their own module: keep them out of the pre-bundle
    exclude: ['maplibre-gl', '@duckdb/duckdb-wasm'],
  },
})
