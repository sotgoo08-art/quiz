export default {
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: { '/api': 'http://localhost:3001' }
  },
  build: { target: 'esnext' }
};