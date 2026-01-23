// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', 'nuxt-echarts'],
  css: ['~/assets/css/main.css'],
  ssr: false,
  devServer: { host: process.env.TAURI_DEV_HOST || 'localhost' },
  vite: {
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_'],
    server: {
      strictPort: true,
    },
  },
  echarts: {
    renderer: ['svg'],
    charts: ['PieChart'],
    components: ['TooltipComponent', 'LegendComponent']
  },
  ui: {
    fonts: false
  }
})
