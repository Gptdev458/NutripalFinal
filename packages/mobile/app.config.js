export default ({ config }) => {
  // config contains the base app.json config if you had one initially
  // or default values provided by Expo.

  console.log("app.config.js: Reading environment variables...");
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  console.log("app.config.js: SUPABASE_URL found:", Boolean(supabaseUrl));
  console.log("app.config.js: SUPABASE_ANON_KEY found:", Boolean(supabaseAnonKey));

  // Explicitly remove the project ID from the incoming config if it exists
  // This forces EAS to see the project as unlinked
  if (config?.expo?.extra?.eas?.projectId) {
    console.log("app.config.js: Deleting existing EAS projectId from config object.");
    delete config.expo.extra.eas.projectId;
  }

  return {
    ...config, // Spread the existing base config
    expo: {
      ...config?.expo, // Spread the existing expo config
      name: "NutriPalApp",
      slug: "NutriPalApp",
      owner: "space-inch",
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
        // We won't spread config.expo.extra here to avoid potential stale data,
        // but we will construct the eas object manually.
        eas: {
          // Prioritize environment variable, then use the newly linked static ID.
          projectId: process.env.EAS_PROJECT_ID || "e2224b27-6cfa-4fd4-a7f0-b4b7d9740ef0"
        },
        // Use process.env here for Supabase keys
        supabaseUrl: supabaseUrl,
        supabaseAnonKey: supabaseAnonKey
      },
    },
  };
}; 