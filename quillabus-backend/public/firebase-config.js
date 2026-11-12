/*
 * Configuración opcional de Firebase Cloud Messaging (notificaciones push).
 * 1) Crea un proyecto en https://console.firebase.google.com
 * 2) Agrega una app web y copia aquí los valores de "Configuración del proyecto".
 * 3) En Cloud Messaging > Web Push, genera una clave VAPID y pégala en vapidKey.
 * 4) Pon las credenciales de servicio en el backend (GOOGLE_APPLICATION_CREDENTIALS_JSON).
 * Si dejas los valores vacíos, la app funciona normalmente y el botón push queda deshabilitado.
 */
self.QUILLABUS_FIREBASE = {
  config: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },
  vapidKey: ""
};
