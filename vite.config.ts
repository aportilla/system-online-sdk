import { defineConfig } from 'vite'

// The dev server for the reference page (index.html, demo/main.ts), which the
// verify scripts drive. The package itself is built by tsc
// (tsconfig.build.json): plain modules, src/ mirrored into dist/.
export default defineConfig({
  // Off vintage-frames' 5173, so `npm test` never takes the kit's dev server for this one.
  server: { port: 5174, strictPort: true },
  // One copy of the kit for the page and the SDK's sources, bundled when the
  // server starts: found mid-test, a new dependency would reload the page.
  optimizeDeps: { include: ['vintage-frames'] },
})
