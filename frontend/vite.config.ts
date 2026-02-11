import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        proxy: {
            '/api': 'http://localhost:5000',
            '/upload': 'http://localhost:5000',
            '/uploads': 'http://localhost:5000',
            '/extract': 'http://localhost:5000',
            '/export': 'http://localhost:5000',
            '/rules': 'http://localhost:5000',
        }
    }
})
