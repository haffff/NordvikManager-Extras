import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app adds a card's scripts as classic <script> tags, not modules, so the build
// must be one self-contained file: an IIFE, no code splitting, no module preload.
// CSS goes to its own file (cssCodeSplit: false), so the app can add it before the
// game's theme instead of the script injecting it after.
// The pdf.js worker is inlined (?worker&inline) as an IIFE too: the card's frame has a
// null origin, where a module worker from a blob: URL doesn't start.
export default defineConfig({
  plugins: [react()],
  worker: { format: 'iife' },
  build: {
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
