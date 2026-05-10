import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.graffiti.news",
  appName: "Graffiti",
  webDir: "out",
  server: {
    url: "https://graffiti.news",
    cleartext: false,
  },
};

export default config;
