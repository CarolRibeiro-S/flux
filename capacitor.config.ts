import type { CapacitorConfig } from '@capacitor/cli';

// Este app não empacota assets web locais: ele só abre, dentro de uma
// WebView nativa, o site de produção já hospedado na Vercel. Por isso
// "webDir" aponta pra pasta pública do Next.js (não é usada pra servir
// nada, mas o Capacitor exige que o caminho exista) e "server.url" é
// quem de fato define o que o app carrega.
const config: CapacitorConfig = {
  appId: 'br.com.carolribeiros.flux',
  appName: 'Flux',
  webDir: 'public',
  server: {
    url: 'https://flux-seven-nu.vercel.app',
    cleartext: false,
  },
};

export default config;
