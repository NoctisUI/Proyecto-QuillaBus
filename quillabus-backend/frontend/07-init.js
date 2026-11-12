let latidoId = null, tickLatido = 0;
function iniciarLatido() {
  if (latidoId) clearInterval(latidoId);
  tickLatido = 0;
  latidoId = setInterval(async () => {
    if (!Estado.sesion) return;
    const rol = Estado.sesion.usuario.rol;
    tickLatido++;
    try {
      if (rol === 'ESTUDIANTE' && Estado.tab === 'mapa' && Estado.rutaSel && Estado.paradaSel) {
        await refrescarBusesYETA();
        if (tickLatido % 6 === 0) await refrescarAlertasSilencioso();
      } else if (rol === 'CONDUCTOR' && Estado.conductor.recorrido) {
        await enviarUbicacion();
      }
    } catch { }
  }, 5000);
}
function detenerLatido() {
  if (latidoId) clearInterval(latidoId);
  latidoId = null;
}
async function refrescarAlertasSilencioso() {
  try {
    const previas = new Map(Estado.alertas.map(a => [a.id, a.estado]));
    const nuevas = await api('/alertas', { silencioso: true });
    if (!Array.isArray(nuevas)) return;
    const enviada = nuevas.find(a => previas.get(a.id) === 'ACTIVA' && a.estado === 'ENVIADA');
    Estado.alertas = nuevas;
    if (enviada) {
      const key = 'qb.aviso.' + enviada.id;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        toast(`🔔 Tu bus está por llegar a ${nombreParada(enviada.parada_id)}`, 'ok', 7000);
      }
      actualizarPanelEta();
    }
  } catch { }
}
async function activarPush() {
  const cfg = (typeof self !== 'undefined' && self.QUILLABUS_FIREBASE) || {};
  if (!cfg.config || !cfg.config.apiKey || !cfg.vapidKey) {
    return toast('Firebase no está configurado. Completa public/firebase-config.js y vuelve a desplegar.', 'err', 6500);
  }
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return toast('Este navegador no soporta notificaciones push', 'err');
  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') return toast('No se concedió permiso para las notificaciones', 'err');
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const [appMod, msgMod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js')
    ]);
    const fbApp = appMod.getApps().length ? appMod.getApps()[0] : appMod.initializeApp(cfg.config);
    const messaging = msgMod.getMessaging(fbApp);
    const token = await msgMod.getToken(messaging, { vapidKey: cfg.vapidKey, serviceWorkerRegistration: reg });
    if (!token) throw new Error('Firebase no devolvió un token');
    await api('/push/token', { method: 'POST', body: { token } });
    msgMod.onMessage(messaging, payload => {
      const n = payload.notification || {};
      toast((n.title ? n.title + ' · ' : '') + (n.body || 'Notificación recibida'), 'ok', 6000);
    });
    toast('Notificaciones push activadas', 'ok');
  } catch (e) {
    console.error(e);
    toast('No se pudieron activar las notificaciones: ' + e.message, 'err', 6500);
  }
}
function iniciar() {
  const tema = localStorage.getItem('qb.tema');
  if (tema) aplicarTema(tema);
  const modal = document.getElementById('modal');
  if (modal) modal.addEventListener('click', ev => { if (ev.target === modal) cerrarModal(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') cerrarModal(); });
  window.addEventListener('online', () => toast('Conexión recuperada. Actualizando datos…', 'ok'));
  window.addEventListener('offline', () => toast('Sin conexión. La app reintentará automáticamente.', 'err', 5000));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !Estado.sesion) return;
    const rol = Estado.sesion.usuario.rol;
    if (rol === 'ESTUDIANTE' && Estado.tab === 'mapa') refrescarBusesYETA();
    if (rol === 'CONDUCTOR') enviarUbicacion();
  });
  const sesion = leerSesion();
  if (sesion) {
    Estado.sesion = sesion;
    iniciarApp();
  } else {
    renderAuth();
  }
}
iniciar();
