import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    glsl(),
    dts({ insertTypesEntry: true }),
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'BeamOverlay',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'esm' : 'cjs'}.js`,
    },
    rollupOptions: {
      external: ['three'],
      output: {
        globals: { three: 'THREE' },
      },
    },
  },
})
