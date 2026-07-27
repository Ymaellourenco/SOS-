import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pt.sosmais.app',
  appName: 'SOS Mais',
  webDir: 'dist',
  // A app é servida internamente por HTTPS ("https://localhost"), mas o servidor de
  // desenvolvimento (o teu computador, via 10.0.2.2 ou o IP da rede local) é só HTTP —
  // sem isto, o Android bloqueia esses pedidos por "Mixed Content" (segurança contra
  // HTTP dentro de páginas HTTPS). IMPORTANTE: desliga isto (ou remove esta linha)
  // antes de publicares a app a sério — só deve estar ligado durante o desenvolvimento,
  // enquanto o servidor de testes não tiver HTTPS próprio.
  android: {
    allowMixedContent: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0A0A0B',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    }
  }
};

export default config;
