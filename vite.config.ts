import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Identifica el despliegue. En Vercel es el SHA del commit; en cualquier otro
// build, la hora. Se incrusta en el JS (`__APP_VERSION__`) y se publica en
// `/version.json`: si los dos difieren, el navegador tiene una versión vieja.
const appVersion = process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now())

function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ id: appVersion }),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), versionFile()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  server: {
    // Vite no lee PORT por su cuenta: si el 5173 está ocupado busca el siguiente
    // y se queda con él, sin avisarle a quien lo lanzó. Leerlo aquí permite
    // levantar dos servidores del proyecto a la vez sin que choquen.
    port: Number(process.env.PORT) || 5173,
  },
})
