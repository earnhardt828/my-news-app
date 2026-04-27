import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.mirur.news",
  appName: "Reflekt",
  webDir: "out",
  server: {
    url: "https://my-news-app-omega-orpin.vercel.app",
    cleartext: false,
  },
};

export default config;
