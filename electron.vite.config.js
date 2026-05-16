import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.js'),
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.js'),
          'webview-preload': resolve('src/preload/webview-preload.js'),
        },
      },
    },
  },
  renderer: {},
})
