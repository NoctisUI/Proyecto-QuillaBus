const $ = (s, raiz = document) => raiz.querySelector(s);
const $$ = (s, raiz = document) => [...raiz.querySelectorAll(s)];
const app = document.getElementById('app');
const Estado = {
  sesion: null,
  loginModo: 'login',
  tab: 'mapa',
  rutaSel: null,
  paradaSel: null,
  minutosAntes: 3,
  busqueda: '',
  rutas: [],
  paradasPorRuta: {},
  paradasMap: {},
  avisos: [],
  favoritos: [],
  alertas: [],
  buses: [],
  eta: [],
  ultimaAct: null,
  cargando: false,
  admin: { tab: 'resumen', resumen: null, rutas: [], paradas: [], buses: [], conductores: [], avisos: [], cargando: false, error: null },
  conductor: { recorrido: null, buses: [], rutas: [], gps: { watchId: null, pos: null, error: null, ultimoEnvio: null, enviando: false } }
};
const ICONOS = {
  mapa: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  rutas: 'M6 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM18 15.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 8.5v3c0 4 12 1 12 4',
  alertas: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4',
  avisos: 'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5',
  bus: 'M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM3 11h18M7 20v-3M17 20v-3M7 14h.01M17 14h.01',
  pin: 'M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'
};
const icono = n => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONOS[n] || ICONOS.mapa}"/></svg>`;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rolTexto = r => ({ ESTUDIANTE: 'Estudiante', CONDUCTOR: 'Conductor', ADMIN: 'Administrador' }[r] || r || '');
const fecha = v => { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }); };
const hora = v => { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
const fechaHora = v => !v ? '—' : `${fecha(v)} · ${hora(v)}`;
const desde = v => {
  if (!v) return '—';
  const s = Math.max(0, Math.round((Date.now() - new Date(v)) / 1000));
  if (s < 10) return 'ahora';
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  return `hace ${Math.floor(s / 3600)} h`;
};
const minTexto = m => {
  if (m === null || m === undefined || Number.isNaN(Number(m))) return '—';
  return Number(m) < 1 ? 'Ya llega' : `${Math.ceil(Number(m))} min`;
};
const fechaInput = dias => {
  const d = new Date(Date.now() + dias * 86400000), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
let toastTimer = null;
function toast(msg, tipo = '', ms = 3800) {
  const t = document.getElementById('toast');
  if (!t) return;
  clearTimeout(toastTimer);
  t.textContent = msg;
  t.className = 'ts on' + (tipo ? ' ' + tipo : '');
  toastTimer = setTimeout(() => { t.className = 'ts'; }, ms);
}
function aplicarTema(t) {
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function alternarTema() {
  const actual = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const nuevo = actual === 'dark' ? 'light' : 'dark';
  localStorage.setItem('qb.tema', nuevo);
  aplicarTema(nuevo);
}
function leerSesion() {
  try {
    const s = JSON.parse(localStorage.getItem('qb.sesion'));
    return s && s.token && s.usuario && s.usuario.rol ? s : null;
  } catch { return null; }
}
async function api(ruta, opciones = {}) {
  const { silencioso, ...fetchOpts } = opciones;
  const headers = { ...(fetchOpts.headers || {}) };
  const token = Estado.sesion && Estado.sesion.token;
  if (token) headers.Authorization = 'Bearer ' + token;
  let body = fetchOpts.body;
  if (body !== undefined && body !== null && !(body instanceof FormData) && typeof body !== 'string') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch('/api' + ruta, { ...fetchOpts, body, headers });
  } catch {
    const e = new Error('No hay conexión con el servidor. Revisa tu red.');
    e.sinRed = true;
    throw e;
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = new Error((data && data.error) || (res.status === 429 ? 'Demasiados intentos. Espera unos minutos y vuelve a intentar.' : 'No fue posible completar la solicitud'));
    e.status = res.status;
    if (res.status === 401 && token) {
      cerrarSesion(true);
      e.message = 'Tu sesión expiró. Ingresa de nuevo.';
    }
    throw e;
  }
  return data;
}
function cabecera(titulo, sub) {
  const u = Estado.sesion && Estado.sesion.usuario;
  return `<header class="hd">
    <div class="top"><div class="brand">QuillaBus</div>
      <div class="acciones">
        <button class="gh icon" onclick="alternarTema()" aria-label="Cambiar tema" title="Cambiar tema">◐</button>
        <button class="gh" onclick="cerrarSesion()">Salir</button>
      </div>
    </div>
    <h1>${esc(titulo)}</h1><p class="sub">${esc(sub)}</p>
    ${u ? `<div class="usuario"><i></i>${esc(u.nombre)} · ${rolTexto(u.rol)}</div>` : ''}
  </header>`;
}
function pantallaCarga(msg = 'Cargando información…') {
  app.className = '';
  app.innerHTML = `<div class="auth"><div class="auth-logo">Quilla<span>Bus</span></div>
    <div class="card"><div class="gps"><i></i><span>${esc(msg)}</span></div>
    <small style="display:block;margin-top:6px">Conectando con el servidor y las paradas de Barranquilla.</small></div></div>`;
}
function render() {
  if (typeof destruirMapa === 'function') destruirMapa();
  if (!Estado.sesion) return renderAuth();
  const rol = Estado.sesion.usuario.rol;
  app.className = rol === 'ADMIN' ? 'wide' : '';
  if (rol === 'ESTUDIANTE') return renderEstudiante();
  if (rol === 'CONDUCTOR') return renderConductor();
  return renderAdmin();
}
function renderAuth() {
  if (typeof destruirMapa === 'function') destruirMapa();
  const login = Estado.loginModo === 'login';
  app.className = '';
  app.innerHTML = `<div class="auth">
    <div><div class="auth-logo">Quilla<span>Bus</span></div>
      <p class="lead">Menos espera, más tiempo para ti. Sigue tu bus en el mapa y recibe un aviso justo antes de que llegue.</p></div>
    <div class="auth-card">
      <div class="seg" role="tablist" aria-label="Ingresar o crear cuenta">
        <button class="${login ? 'on' : ''}" onclick="cambiarAuth('login')">Ingresar</button>
        <button class="${!login ? 'on' : ''}" onclick="cambiarAuth('registro')">Crear cuenta</button>
      </div>
      ${login ? `<form onsubmit="entrar(event)" style="display:flex;flex-direction:column;gap:12px">
        <label>Correo institucional<input id="login-correo" type="email" autocomplete="username" placeholder="nombre@universidad.edu.co" required></label>
        <label>Contraseña<span style="position:relative"><input id="login-password" type="password" autocomplete="current-password" placeholder="Tu contraseña" required style="padding-right:52px"><button type="button" class="link" style="position:absolute;right:4px;top:4px" onclick="verClave('login-password', this)">Ver</button></span></label>
        <button class="pb block" id="btn-login" type="submit">Ingresar a QuillaBus</button>
      </form>
      <div><small>Cuentas de demostración · clave <b>Quilla2026!</b></small>
        <div class="demo" style="margin-top:7px">
          <button type="button" onclick="usarDemo('estudiante@universidad.edu.co')">Estudiante</button>
          <button type="button" onclick="usarDemo('conductor@universidad.edu.co')">Conductor</button>
          <button type="button" onclick="usarDemo('admin@universidad.edu.co')">Admin</button>
        </div>
      </div>` : `<form onsubmit="registrar(event)" style="display:flex;flex-direction:column;gap:12px">
        <label>Nombre completo<input id="reg-nombre" autocomplete="name" placeholder="Nombre y apellido" required minlength="3"></label>
        <label>Correo institucional<input id="reg-correo" type="email" autocomplete="username" placeholder="nombre@universidad.edu.co" required></label>
        <label>Contraseña<input id="reg-password" type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres" required minlength="8"></label>
        <label>Confirmar contraseña<input id="reg-password2" type="password" autocomplete="new-password" placeholder="Repite la contraseña" required minlength="8"></label>
        <button class="pb block" id="btn-reg" type="submit">Crear mi cuenta</button>
        <small>El registro crea una cuenta de estudiante. Los permisos de conductor y administrador los asigna la institución.</small>
      </form>`}
    </div>
    <p class="auth-foot">Rastreo cada 5 segundos · Paradas reales de Barranquilla<br>QuillaBus · Proyecto de Ingeniería de Software</p>
  </div>`;
}
function cambiarAuth(modo) {
  Estado.loginModo = modo === 'registro' ? 'registro' : 'login';
  renderAuth();
}
function verClave(id, btn) {
  const i = document.getElementById(id);
  if (!i) return;
  i.type = i.type === 'password' ? 'text' : 'password';
  btn.textContent = i.type === 'password' ? 'Ver' : 'Ocultar';
}
function usarDemo(correo) {
  const c = document.getElementById('login-correo'), p = document.getElementById('login-password');
  if (c) c.value = correo;
  if (p) p.value = 'Quilla2026!';
  toast('Credenciales de demostración cargadas');
}
async function entrar(ev) {
  ev.preventDefault();
  const correo = $('#login-correo').value.trim(), password = $('#login-password').value;
  if (!correo || !password) return toast('Escribe tu correo y contraseña', 'err');
  const btn = $('#btn-login');
  btn.disabled = true; btn.textContent = 'Ingresando…';
  try {
    const data = await api('/auth/login', { method: 'POST', body: { correo, password } });
    Estado.sesion = { token: data.token, usuario: data.usuario };
    localStorage.setItem('qb.sesion', JSON.stringify(Estado.sesion));
    toast('Bienvenido, ' + data.usuario.nombre, 'ok');
    await iniciarApp();
  } catch (e) {
    toast(e.message, 'err');
    btn.disabled = false; btn.textContent = 'Ingresar a QuillaBus';
  }
}
async function registrar(ev) {
  ev.preventDefault();
  const nombre = $('#reg-nombre').value.trim(), correo = $('#reg-correo').value.trim();
  const password = $('#reg-password').value, password2 = $('#reg-password2').value;
  if (nombre.length < 3) return toast('Escribe tu nombre completo', 'err');
  if (!/^[^@\s]+@[^@\s]+\.edu\.co$/i.test(correo)) return toast('Usa tu correo institucional terminado en .edu.co', 'err');
  if (password.length < 8) return toast('La contraseña necesita mínimo 8 caracteres', 'err');
  if (password !== password2) return toast('Las contraseñas no coinciden', 'err');
  const btn = $('#btn-reg');
  btn.disabled = true; btn.textContent = 'Creando cuenta…';
  try {
    await api('/auth/registro', { method: 'POST', body: { nombre, correo, password } });
    const data = await api('/auth/login', { method: 'POST', body: { correo, password } });
    Estado.sesion = { token: data.token, usuario: data.usuario };
    localStorage.setItem('qb.sesion', JSON.stringify(Estado.sesion));
    toast('Cuenta creada. ¡Bienvenido!', 'ok');
    await iniciarApp();
  } catch (e) {
    toast(e.message, 'err');
    btn.disabled = false; btn.textContent = 'Crear mi cuenta';
  }
}
async function iniciarApp() {
  if (!Estado.sesion) return renderAuth();
  const rol = Estado.sesion.usuario.rol;
  app.className = rol === 'ADMIN' ? 'wide' : '';
  pantallaCarga(rol === 'CONDUCTOR' ? 'Preparando tu recorrido…' : 'Cargando rutas y paradas reales…');
  try {
    iniciarLatido();
    if (rol === 'ESTUDIANTE') {
      Estado.tab = 'mapa';
      await cargarDatosEstudiante();
    } else if (rol === 'CONDUCTOR') {
      await cargarConductor();
    } else {
      Estado.admin.tab = 'resumen';
      await cargarAdmin('resumen');
    }
    render();
  } catch (e) {
    toast(e.message, 'err', 6000);
    render();
  }
}
function cerrarSesion(porExpiracion) {
  if (typeof detenerGPSConductor === 'function') detenerGPSConductor();
  if (typeof detenerLatido === 'function') detenerLatido();
  localStorage.removeItem('qb.sesion');
  Estado.sesion = null;
  Estado.rutas = []; Estado.paradasPorRuta = {}; Estado.paradasMap = {};
  Estado.avisos = []; Estado.favoritos = []; Estado.alertas = [];
  Estado.buses = []; Estado.eta = []; Estado.rutaSel = null; Estado.paradaSel = null; Estado.ultimaAct = null;
  Estado.conductor = { recorrido: null, buses: [], rutas: [], gps: { watchId: null, pos: null, error: null, ultimoEnvio: null, enviando: false } };
  Estado.loginModo = 'login';
  cerrarModal();
  renderAuth();
  if (porExpiracion) setTimeout(() => toast('Tu sesión expiró. Ingresa de nuevo.', 'err', 5000), 100);
}
function abrirModal(html) {
  const m = document.getElementById('modal');
  if (!m) return;
  m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${html}</div>`;
  m.hidden = false;
  document.body.style.overflow = 'hidden';
}
function cerrarModal() {
  const m = document.getElementById('modal');
  if (!m) return;
  m.hidden = true; m.innerHTML = '';
  document.body.style.overflow = '';
}
