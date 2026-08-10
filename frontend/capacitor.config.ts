import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'online.jobalert.khetsmart',
  appName: 'KhetSmart',
  webDir: 'dist',
  server: {
    url: 'https://khetsmart32sev.ashanul.dev',
    cleartext: true
  }
};

export default config;

