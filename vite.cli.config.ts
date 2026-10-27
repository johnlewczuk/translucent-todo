import { defineConfig } from 'vite'

// Bundles the `todo` CLI (cli/todo.ts + the src/lib modules it shares with
// the overlay) into one executable Node script. Shipped in the .deb as
// /usr/bin/todo via tauri.conf.json's bundle.linux.deb.files.
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'cli/todo.ts',
    outDir: 'dist-cli',
    target: 'node20',
    rollupOptions: {
      output: {
        entryFileNames: 'todo.mjs',
        banner: '#!/usr/bin/env node',
      },
    },
  },
})
