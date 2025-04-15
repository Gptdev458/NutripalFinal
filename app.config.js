export default ({ config }) => {
  // config contains the base app.json config if you had one initially
  // or default values provided by Expo.

  console.log("app.config.js: Reading environment variables...");
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  console.log("app.config.js: SUPABASE_URL found:", Boolean(supabaseUrl));
  console.log("app.config.js: SUPABASE_ANON_KEY found:", Boolean(supabaseAnonKey));

  // Try to get EAS Project ID from env, fallback to existing or hardcoded
  const easProjectId = process.env.EAS_PROJECT_ID || config?.expo?.extra?.eas?.projectId || "60aff455-12b7-4de3-8582-1119fa72ef92";

  return {
    ...config, // Spread the existing base config
    expo: {
      ...config?.expo, // Spread the existing expo config
      name: "NutriPalApp",
      slug: "NutriPalApp",
      version: "1.0.0",
      orientation: "portrait",
      icon: "./assets/icon.png",
      userInterfaceStyle: "light",
      newArchEnabled: true,
      splash: {
        image: "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff"
      },
      ios: {
        ...(config?.expo?.ios), // Spread existing ios config
        supportsTablet: true
      },
      android: {
        ...(config?.expo?.android), // Spread existing android config
        adaptiveIcon: {
          foregroundImage: "./assets/adaptive-icon.png",
          backgroundColor: "#ffffff"
        },
        package: "com.ianku.NutriPalApp"
      },
      web: {
        ...(config?.expo?.web), // Spread existing web config
        favicon: "./assets/favicon.png"
      },
      extra: {
        ...config?.expo?.extra, // Spread existing extra config
        eas: {
          ...(config?.expo?.extra?.eas), // Spread existing eas config
          projectId: easProjectId
        },
        // Use process.env here
        supabaseUrl: supabaseUrl,
        supabaseAnonKey: supabaseAnonKey
      },
    },
  };
}; 