import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Vite no lee PORT por su cuenta: si el 5173 está ocupado busca el siguiente
    // y se queda con él, sin avisarle a quien lo lanzó. Leerlo aquí permite
    // levantar dos servidores del proyecto a la vez sin que choquen.
    port: Number(process.env.PORT) || 5173,
  },
})
