import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dtlnightly.app',
  appName: 'DTL',
  webDir: 'out',
  server: {
    url: 'https://dtlnightly.ca',
    cleartext: true
  }
};

export default config;
