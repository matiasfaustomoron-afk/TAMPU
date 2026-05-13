import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config para Tampu.
 *
 * Cambios mayo 2026 (post-rebrand):
 *  - appId: com.travelos.app → com.tampu.app  (los IDs de App Store son finales una vez
 *    enviada la primera build; si ya hay app pública con el viejo ID, mantener — Apple
 *    no permite cambios. Si NO hay submission previa, este es el momento de cambiar.)
 *  - appName: "Travel OS" → "Tampu"
 *  - backgroundColor: #0a0a0f (negro azulado) → #f5efe0 (lana de llama — modo light default)
 *  - StatusBar: dark → light (porque arrancamos en light mode)
 *  - SplashScreen.spinnerColor: #10b981 (emerald genérico) → #c75b2f (terracota Tampu)
 *  - Iconos de notificación: heredan terracota
 *
 * IMPORTANTE — Info.plist:
 * Las usage descriptions van bajo `ios.infoPlist` cuando ejecutás `npx cap sync ios`.
 * Si el archivo `ios/App/App/Info.plist` ya existe (cap add ios fue corrido), Capacitor
 * NO sobrescribe los keys manuales — hay que editarlos en Xcode o ahí directo.
 * Los textos abajo son las versiones canónicas, justificadas para App Review.
 */
const config: CapacitorConfig = {
  appId: "com.tampu.app",
  appName: "Tampu",
  webDir: "out",
  ios: {
    contentInset: "always",
    backgroundColor: "#f5efe0ff", // lana de llama (light default)
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#f5efe0", // mismo que ios.backgroundColor
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      iosSpinnerStyle: "small",
      spinnerColor: "#c75b2f", // terracota Quebradeña
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "LIGHT", // texto oscuro sobre fondo claro (modo light default de Tampu)
      backgroundColor: "#f5efe0",
      overlaysWebView: false,
    },
    LocalNotifications: {
      smallIcon: "ic_stat_icon",
      iconColor: "#c75b2f", // terracota
      sound: "beep.wav",
    },
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
