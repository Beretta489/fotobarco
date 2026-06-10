import 'dotenv/config';

export default {
  expo: {
    name: "FotoBarco",
    slug: "FotoBarco",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: { supportsTablet: true },
    android: {
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png"
      }
    },
    web: { favicon: "./assets/favicon.png" },
    extra: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      adminPassword: process.env.ADMIN_PASSWORD,
      efiClientId: process.env.EFI_CLIENT_ID,
      efiClientSecret: process.env.EFI_CLIENT_SECRET,
      efiPixKey: process.env.EFI_PIX_KEY,
      efiSandbox: process.env.EFI_SANDBOX,
      infinitiPayApiKey: process.env.INFINITIPAY_API_KEY,
      zapiInstanceId: process.env.ZAPI_INSTANCE_ID,
      zapiToken: process.env.ZAPI_TOKEN,
      zapiClientToken: process.env.ZAPI_CLIENT_TOKEN,
    }
  }
};