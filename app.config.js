import 'dotenv/config';

export default {
  expo: {
    name: "FotoBarco",
    slug: "FotoBarco",
    version: "1.0.0",
    orientation: "portrait",

    // Scheme do deeplink de retorno do InfiniteTap. Precisa ser IDENTICO ao
    // secret APP_DEEPLINK_SCHEME das Edge Functions: e por
    // "fotobarco://payment/result" que o app InfinitePay devolve o resultado da
    // cobranca. Mudou aqui, mude la tambem -- senao o retorno se perde e o
    // pedido fica pendente mesmo com o cliente tendo pago.
    scheme: "fotobarco",

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
      adminEmail: process.env.ADMIN_EMAIL,
    }
  }
};