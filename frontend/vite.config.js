import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // Packaged Electron loads dist/index.html via file://, not http:// — the
  // default absolute asset paths ("/assets/...") resolve against the
  // filesystem root under file:// and 404 silently, producing a blank
  // window. Relative paths fix that; harmless for the Vite dev server too.
  base: './',
  server: {
    host: true,
    watch: {
      ignored: ['**/release/**'],
    },
  },
})
