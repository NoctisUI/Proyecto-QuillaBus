// QuillaBus · API REST (Node.js + Express + PostgreSQL)
require('dotenv').config();
const path = require('path');
const express = require('express'), cors = require('cors'), helmet = require('helmet'), rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), { Pool } = require('pg');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('Falta JWT_SECRET en el archivo .env');
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const q = (t, p) => db.query(t, p).then(r => r.rows);

const app = express();
app.set('trust proxy', 1);
// CSP permite Leaflet (unpkg), mapas OSM, fuentes de Google y Firebase; el resto queda restringido.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://www.gstatic.com'],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org', 'https://unpkg.com'],
      connectSrc: ["'self'", 'https://router.project-osrm.org', 'https://*.googleapis.com', 'https://*.gstatic.com', 'https://*.firebaseio.com'],
      workerSrc: ["'self'", 'blob:'],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  // OSM exige un Referer válido para servir teselas; no lo elimines con no-referrer.
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
if (process.env.CORS_ORIGIN) app.use(cors({ origin: process.env.CORS_ORIGIN.split(',').map(s => s.trim()) }));
app.use(express.json({ limit: '50kb' }));
// La app se sirve desde el mismo backend: evita CORS y usa el HTTPS del despliegue.
app.use(express.static(path.join(__dirname, 'public'), {
  index: 'quillabus.html',
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  setHeaders: (res, file) => {
    if (/(quillabus\.html|firebase-messaging-sw\.js|firebase-config\.js)$/i.test(file)) res.setHeader('Cache-Control', 'no-cache');
  }
}));

// Manejo de errores: 23505 = violación de unicidad (correo repetido, bus o conductor ya en un recorrido en curso)
const h = f => (req, res) => f(req, res).catch(e => {
  if (e.code === '23505') return res.status(409).json({ error: 'Ese registro ya existe o el recurso ya está en uso' });
  console.error(e); res.status(500).json({ error: 'No fue posible completar la operación' });
});
// RNF02: roles diferenciados
const auth = (...roles) => (req, res, next) => {
  try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET); }
  catch { return res.status(401).json({ error: 'Inicia sesión para continuar' }); }
  if (roles.length && !roles.includes(req.user.rol)) return res.status(403).json({ error: 'No tienes permiso para esta acción' });
  next();
};
const any = auth(), est = auth('ESTUDIANTE'), cond = auth('CONDUCTOR'), adm = auth('ADMIN');
const nf = (res, r) => r ? res.json(r) : res.status(404).json({ error: 'No encontrado' });

// ---------- Rastreo y ETA (RNF03) ----------
const rad = x => x * Math.PI / 180;
const dist = (a, b) => { // metros (haversine)
  const dLa = rad(b.latitud - a.latitud), dLo = rad(b.longitud - a.longitud);
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a.latitud)) * Math.cos(rad(b.latitud)) * Math.sin(dLo / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(x));
};
// Regla: un bus aparece solo si su recorrido está EN_CURSO y su última posición tiene menos de 30 s
const BUSES = `SELECT b.id, b.placa, u.latitud, u.longitud, u.registrada_en,
  (SELECT COALESCE(AVG(velocidad),0) FROM (SELECT velocidad FROM ubicaciones WHERE bus_id=b.id ORDER BY registrada_en DESC LIMIT 5) v)::float AS vel
  FROM recorridos r JOIN buses b ON b.id=r.bus_id
  JOIN LATERAL (SELECT latitud, longitud, registrada_en FROM ubicaciones WHERE bus_id=b.id ORDER BY registrada_en DESC LIMIT 1) u ON true
  WHERE r.ruta_id=$1 AND r.estado='EN_CURSO' AND u.registrada_en > now() - interval '30 seconds'`;

// ETA = distancia restante por las paradas / velocidad promedio reciente (mínimo 3 m/s)
async function etaParada(paradaId, rutaId) {
  const S = await q(`SELECT p.id, p.latitud, p.longitud FROM ruta_parada rp JOIN paradas p ON p.id=rp.parada_id
                     WHERE rp.ruta_id=$1 AND p.activa ORDER BY rp.orden`, [rutaId]);
  const t = S.findIndex(s => s.id == paradaId);
  if (t < 0) return [];
  return (await q(BUSES, [rutaId])).map(b => {
    const n = S.reduce((m, s, i) => dist(b, s) < dist(b, S[m]) ? i : m, 0); // parada más cercana al bus
    if (n > t) return null; // el bus ya pasó por esa parada
    let m = dist(b, S[n]);
    for (let i = n; i < t; i++) m += dist(S[i], S[i + 1]);
    return { bus_id: b.id, placa: b.placa, eta_min: +(m / Math.max(b.vel, 3) / 60).toFixed(1) };
  }).filter(Boolean).sort((a, c) => a.eta_min - c.eta_min);
}

// ---------- Autenticación (RF01, RF02, RNF01) ----------
app.get('/api/salud', (_, res) => res.json({ ok: true }));
const lim = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30, skipSuccessfulRequests: true,
  standardHeaders: true, legacyHeaders: false,
  handler: (_, res) => res.status(429).json({ error: 'Demasiados intentos fallidos. Espera unos minutos y vuelve a intentar.' })
});
app.post('/api/auth/registro', lim, h(async (req, res) => {
  const { nombre, correo, password } = req.body;
  if (!nombre || nombre.trim().length < 3) return res.status(400).json({ error: 'Escribe tu nombre completo' });
  if (!/^[^@\s]+@[^@\s]+\.edu\.co$/i.test(correo || '')) return res.status(400).json({ error: 'Usa tu correo institucional, por ejemplo nombre@universidad.edu.co' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'La contraseña necesita mínimo 8 caracteres' });
  const [u] = await q(`INSERT INTO usuarios(nombre,correo,password_hash,rol) VALUES($1,$2,$3,'ESTUDIANTE') RETURNING id,nombre,rol`,
    [nombre.trim(), correo.toLowerCase(), await bcrypt.hash(password, 12)]);
  res.status(201).json(u);
}));
app.post('/api/auth/login', lim, h(async (req, res) => {
  const [u] = await q('SELECT * FROM usuarios WHERE correo=$1 AND activo', [(req.body.correo || '').toLowerCase()]);
  if (!u || !await bcrypt.compare(req.body.password || '', u.password_hash)) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  res.json({ token: jwt.sign({ id: u.id, rol: u.rol }, SECRET, { expiresIn: '8h' }), usuario: { id: u.id, nombre: u.nombre, rol: u.rol } });
}));

// ---------- Estudiante: rutas, mapa, ETA, avisos (RF03 a RF08) ----------
app.get('/api/rutas', any, h(async (_, res) => res.json(await q(`SELECT r.id, r.nombre, r.color,
  (SELECT count(*) FROM ruta_parada rp JOIN paradas p ON p.id=rp.parada_id WHERE rp.ruta_id=r.id AND p.activa)::int AS paradas,
  EXISTS(SELECT 1 FROM recorridos x WHERE x.ruta_id=r.id AND x.estado='EN_CURSO') AS en_servicio
  FROM rutas r WHERE r.activa ORDER BY r.id`))));
app.get('/api/rutas/:id/paradas', any, h(async (req, res) => res.json(await q(`SELECT p.id, p.nombre, p.latitud, p.longitud, rp.orden
  FROM ruta_parada rp JOIN paradas p ON p.id=rp.parada_id WHERE rp.ruta_id=$1 AND p.activa ORDER BY rp.orden`, [req.params.id]))));
app.get('/api/rutas/:id/buses', any, h(async (req, res) => res.json(await q(BUSES, [req.params.id]))));
app.get('/api/paradas/:id/eta', any, h(async (req, res) => {
  const ruta = Number(req.query.ruta);
  if (!ruta) return res.status(400).json({ error: 'Indica la ruta con ?ruta=ID' });
  const e = await etaParada(req.params.id, ruta);
  e.length ? res.json(e) : res.status(204).end(); // 204 = sin buses en servicio
}));
app.get('/api/avisos', any, h(async (_, res) => res.json(await q(
  'SELECT id, titulo, mensaje, publicado_en, vigente_hasta FROM avisos WHERE vigente_hasta > now() ORDER BY publicado_en DESC'))));

// Alertas de llegada (RF06)
const ESTADO = `CASE WHEN NOT a.activa THEN 'DESACTIVADA' WHEN a.enviada_en IS NOT NULL THEN 'ENVIADA' ELSE 'ACTIVA' END`;
app.get('/api/alertas', est, h(async (req, res) => res.json(await q(`SELECT a.*, ${ESTADO} AS estado FROM alertas a WHERE usuario_id=$1 ORDER BY id DESC`, [req.user.id]))));
app.post('/api/alertas', est, h(async (req, res) => {
  const { parada_id, ruta_id, minutos_antes = 3 } = req.body, m = Number(minutos_antes);
  if (!parada_id || !ruta_id || !(m >= 1 && m <= 30)) return res.status(400).json({ error: 'Indica parada, ruta y minutos de anticipación (1 a 30)' });
  const [a] = await q('INSERT INTO alertas(usuario_id,parada_id,ruta_id,minutos_antes) VALUES($1,$2,$3,$4) RETURNING *', [req.user.id, parada_id, ruta_id, m]);
  res.status(201).json(a);
}));
app.patch('/api/alertas/:id', est, h(async (req, res) => { // reactivar limpia enviada_en para que pueda volver a avisar
  const [a] = await q('UPDATE alertas SET activa=$1::boolean, enviada_en=CASE WHEN $1::boolean THEN NULL ELSE enviada_en END WHERE id=$2 AND usuario_id=$3 RETURNING *',
    [!!req.body.activa, req.params.id, req.user.id]);
  nf(res, a);
}));
app.delete('/api/alertas/:id', est, h(async (req, res) => { await q('DELETE FROM alertas WHERE id=$1 AND usuario_id=$2', [req.params.id, req.user.id]); res.status(204).end(); }));

// Favoritos (RF07)
app.get('/api/favoritos', est, h(async (req, res) => res.json(await q('SELECT * FROM favoritos WHERE usuario_id=$1', [req.user.id]))));
app.post('/api/favoritos', est, h(async (req, res) => {
  const { ruta_id = null, parada_id = null } = req.body;
  if (!ruta_id === !parada_id) return res.status(400).json({ error: 'Envía una ruta o una parada, no ambas' });
  const [f] = await q('INSERT INTO favoritos(usuario_id,ruta_id,parada_id) VALUES($1,$2,$3) RETURNING *', [req.user.id, ruta_id, parada_id]);
  res.status(201).json(f);
}));
app.delete('/api/favoritos/:id', est, h(async (req, res) => { await q('DELETE FROM favoritos WHERE id=$1 AND usuario_id=$2', [req.params.id, req.user.id]); res.status(204).end(); }));
app.post('/api/push/token', est, h(async (req, res) => { // el celular registra su token de Firebase
  if (!req.body.token) return res.status(400).json({ error: 'Falta el token' });
  await q('INSERT INTO tokens_push(usuario_id,token) VALUES($1,$2) ON CONFLICT (token) DO UPDATE SET usuario_id=$1', [req.user.id, req.body.token]);
  res.status(201).json({ ok: true });
}));

// ---------- Conductor (RF09) ----------
app.post('/api/recorridos', cond, h(async (req, res) => {
  const { bus_id, ruta_id } = req.body;
  const ok = await q(`SELECT 1 FROM rutas r, buses b WHERE r.id=$1 AND r.activa AND b.id=$2 AND b.estado='DISPONIBLE'`, [ruta_id, bus_id]);
  if (!ok.length) return res.status(400).json({ error: 'La ruta o el bus no están disponibles' });
  const busy = await q(`SELECT 1 FROM recorridos WHERE (conductor_id=$1 OR bus_id=$2) AND estado IN ('EN_CURSO','INTERRUMPIDO')`, [req.user.id, bus_id]);
  if (busy.length) return res.status(409).json({ error: 'Ya tienes un recorrido activo o ese bus está en uso' });
  const [r] = await q(`INSERT INTO recorridos(conductor_id,bus_id,ruta_id,hora_inicio,estado) VALUES($1,$2,$3,now(),'EN_CURSO') RETURNING *`, [req.user.id, bus_id, ruta_id]);
  res.status(201).json(r);
}));
const cambia = (estado, desde, fin) => h(async (req, res) => { // máquina de estados del recorrido (UML 5)
  const [r] = await q(`UPDATE recorridos SET estado=$1${fin ? ', hora_fin=now()' : ''} WHERE id=$2 AND conductor_id=$3 AND estado=ANY($4) RETURNING *`,
    [estado, req.params.id, req.user.id, desde]);
  r ? res.json(r) : res.status(409).json({ error: 'Ese cambio no es posible con el estado actual del recorrido' });
});
app.post('/api/recorridos/:id/finalizar', cond, cambia('FINALIZADO', ['EN_CURSO', 'INTERRUMPIDO'], true));
app.post('/api/recorridos/:id/averia', cond, cambia('INTERRUMPIDO', ['EN_CURSO']));
app.post('/api/recorridos/:id/reanudar', cond, cambia('EN_CURSO', ['INTERRUMPIDO']));
app.post('/api/buses/:id/ubicacion', cond, h(async (req, res) => { // el celular del conductor envía esto cada 5 s
  const { latitud, longitud, velocidad = 0 } = req.body;
  if (!(Math.abs(latitud) <= 90 && Math.abs(longitud) <= 180)) return res.status(400).json({ error: 'Coordenadas inválidas' });
  const [r] = await q(`SELECT id FROM recorridos WHERE bus_id=$1 AND conductor_id=$2 AND estado='EN_CURSO'`, [req.params.id, req.user.id]);
  if (!r) return res.status(403).json({ error: 'Solo el conductor asignado puede transmitir la ubicación de un bus en curso' });
  await q('INSERT INTO ubicaciones(bus_id,recorrido_id,latitud,longitud,velocidad) VALUES($1,$2,$3,$4,$5)', [req.params.id, r.id, latitud, longitud, velocidad]);
  res.status(201).json({ ok: true });
}));
app.get('/api/buses', cond, h(async (_, res) => res.json(await q(`SELECT b.id, b.placa, b.capacidad, b.estado,
  EXISTS(SELECT 1 FROM recorridos x WHERE x.bus_id=b.id AND x.estado IN ('EN_CURSO','INTERRUMPIDO')) AS ocupado
  FROM buses b ORDER BY b.placa`))));
app.get('/api/conductor/recorrido', cond, h(async (req, res) => { // recorrido activo al recargar la pantalla del conductor
  const [r] = await q(`SELECT x.*, b.placa, rut.nombre AS ruta_nombre, rut.color
    FROM recorridos x JOIN buses b ON b.id=x.bus_id JOIN rutas rut ON rut.id=x.ruta_id
    WHERE x.conductor_id=$1 AND x.estado IN ('EN_CURSO','INTERRUMPIDO') ORDER BY x.id DESC LIMIT 1`, [req.user.id]);
  r ? res.json(r) : res.status(204).end();
}));

// ---------- Administrador (RF10, RF11) ----------
app.get('/api/admin/resumen', adm, h(async (_, res) => {
  const [r] = await q(`SELECT
    (SELECT count(*) FROM rutas)::int AS rutas,
    (SELECT count(*) FROM rutas WHERE activa)::int AS rutas_activas,
    (SELECT count(*) FROM buses)::int AS buses,
    (SELECT count(*) FROM buses b WHERE EXISTS(SELECT 1 FROM recorridos x WHERE x.bus_id=b.id AND x.estado='EN_CURSO'))::int AS buses_servicio,
    (SELECT count(*) FROM usuarios WHERE rol='CONDUCTOR')::int AS conductores,
    (SELECT count(*) FROM avisos WHERE vigente_hasta > now())::int AS avisos`);
  res.json(r);
}));
app.get('/api/admin/rutas', adm, h(async (_, res) => res.json(await q(`SELECT r.id, r.nombre, r.color, r.activa,
  (SELECT count(*) FROM ruta_parada rp JOIN paradas p ON p.id=rp.parada_id WHERE rp.ruta_id=r.id AND p.activa)::int AS paradas,
  COALESCE((SELECT json_agg(rp.parada_id ORDER BY rp.orden) FROM ruta_parada rp WHERE rp.ruta_id=r.id), '[]'::json) AS parada_ids,
  EXISTS(SELECT 1 FROM recorridos x WHERE x.ruta_id=r.id AND x.estado='EN_CURSO') AS en_servicio
  FROM rutas r ORDER BY r.id`))));
app.post('/api/admin/rutas', adm, h(async (req, res) => {
  const { nombre, color, paradas = [] } = req.body; // paradas: ids en orden
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Escribe el nombre de la ruta' });
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const { rows: [r] } = await c.query('INSERT INTO rutas(nombre,color) VALUES($1,$2) RETURNING *', [nombre.trim(), color || '#00573F']);
    for (const [i, pid] of paradas.entries()) await c.query('INSERT INTO ruta_parada(ruta_id,parada_id,orden,minutos_desde_inicio) VALUES($1,$2,$3,$4)', [r.id, pid, i + 1, i * 3]);
    await c.query('COMMIT'); res.status(201).json(r);
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}));
app.patch('/api/admin/rutas/:id', adm, h(async (req, res) => {
  const fields = [], vals = [];
  if (typeof req.body.nombre === 'string') {
    if (req.body.nombre.trim().length < 3) return res.status(400).json({ error: 'El nombre de la ruta es muy corto' });
    fields.push(`nombre=$${vals.length + 1}`); vals.push(req.body.nombre.trim());
  }
  if (typeof req.body.color === 'string') {
    if (!/^#[0-9a-f]{6}$/i.test(req.body.color)) return res.status(400).json({ error: 'Color inválido' });
    fields.push(`color=$${vals.length + 1}`); vals.push(req.body.color);
  }
  if (typeof req.body.activa === 'boolean') { fields.push(`activa=$${vals.length + 1}`); vals.push(req.body.activa); }
  if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });
  vals.push(req.params.id);
  nf(res, (await q(`UPDATE rutas SET ${fields.join(', ')} WHERE id=$${vals.length} RETURNING *`, vals))[0]);
}));
app.put('/api/admin/rutas/:id/paradas', adm, h(async (req, res) => { // reemplaza el recorrido completo, en orden
  const ids = Array.isArray(req.body.paradas) ? req.body.paradas.map(Number).filter(Number.isInteger) : null;
  if (!ids) return res.status(400).json({ error: 'Envía la lista de paradas en orden' });
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const { rowCount } = await c.query('SELECT 1 FROM rutas WHERE id=$1', [req.params.id]);
    if (!rowCount) { await c.query('ROLLBACK'); return res.status(404).json({ error: 'No encontrado' }); }
    await c.query('DELETE FROM ruta_parada WHERE ruta_id=$1', [req.params.id]);
    for (const [i, pid] of ids.entries()) await c.query('INSERT INTO ruta_parada(ruta_id,parada_id,orden,minutos_desde_inicio) VALUES($1,$2,$3,$4)', [req.params.id, pid, i + 1, i * 3]);
    await c.query('COMMIT'); res.json({ ok: true });
  } catch (e) {
    await c.query('ROLLBACK');
    if (e.code === '23503') return res.status(400).json({ error: 'Alguna de las paradas no existe' });
    throw e;
  } finally { c.release(); }
}));
app.get('/api/admin/paradas', adm, h(async (_, res) => res.json(await q(`SELECT p.*,
  (SELECT count(*) FROM ruta_parada rp WHERE rp.parada_id=p.id)::int AS rutas
  FROM paradas p ORDER BY p.id`))));
app.post('/api/admin/paradas', adm, h(async (req, res) => {
  const { nombre, latitud, longitud } = req.body;
  if (!nombre || !nombre.trim() || !(Math.abs(latitud) <= 90 && Math.abs(longitud) <= 180)) return res.status(400).json({ error: 'Indica nombre y coordenadas válidas' });
  res.status(201).json((await q('INSERT INTO paradas(nombre,latitud,longitud) VALUES($1,$2,$3) RETURNING *', [nombre.trim(), latitud, longitud]))[0]);
}));
app.patch('/api/admin/paradas/:id', adm, h(async (req, res) => {
  const fields = [], vals = [];
  if (typeof req.body.nombre === 'string') {
    if (!req.body.nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    fields.push(`nombre=$${vals.length + 1}`); vals.push(req.body.nombre.trim());
  }
  for (const k of ['latitud', 'longitud']) {
    if (req.body[k] !== undefined) {
      const n = Number(req.body[k]);
      if (!Number.isFinite(n) || Math.abs(n) > (k === 'latitud' ? 90 : 180)) return res.status(400).json({ error: 'Coordenada inválida' });
      fields.push(`${k}=$${vals.length + 1}`); vals.push(n);
    }
  }
  if (typeof req.body.activa === 'boolean') { fields.push(`activa=$${vals.length + 1}`); vals.push(req.body.activa); }
  if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });
  vals.push(req.params.id);
  nf(res, (await q(`UPDATE paradas SET ${fields.join(', ')} WHERE id=$${vals.length} RETURNING *`, vals))[0]);
}));
app.get('/api/admin/buses', adm, h(async (_, res) => res.json(await q(`SELECT b.*,
  x.id AS recorrido_id, x.estado AS recorrido_estado,
  r.id AS ruta_id, r.nombre AS ruta, u.nombre AS conductor,
  (SELECT registrada_en FROM ubicaciones WHERE bus_id=b.id ORDER BY registrada_en DESC LIMIT 1) AS ultima_posicion
  FROM buses b
  LEFT JOIN LATERAL (SELECT * FROM recorridos WHERE bus_id=b.id AND estado IN ('EN_CURSO','INTERRUMPIDO') ORDER BY id DESC LIMIT 1) x ON true
  LEFT JOIN rutas r ON r.id=x.ruta_id
  LEFT JOIN usuarios u ON u.id=x.conductor_id
  ORDER BY b.placa`))));
app.post('/api/admin/buses', adm, h(async (req, res) => {
  if (!req.body.placa) return res.status(400).json({ error: 'Escribe la placa del bus' });
  res.status(201).json((await q('INSERT INTO buses(placa,capacidad) VALUES($1,$2) RETURNING *', [req.body.placa.toUpperCase(), req.body.capacidad || 40]))[0]);
}));
app.patch('/api/admin/buses/:id', adm, h(async (req, res) => {
  const fields = [], vals = [];
  if (typeof req.body.placa === 'string' && req.body.placa.trim()) { fields.push(`placa=$${vals.length + 1}`); vals.push(req.body.placa.trim().toUpperCase()); }
  if (req.body.capacidad !== undefined) {
    const n = Number(req.body.capacidad);
    if (!Number.isInteger(n) || n < 1 || n > 200) return res.status(400).json({ error: 'Capacidad inválida' });
    fields.push(`capacidad=$${vals.length + 1}`); vals.push(n);
  }
  if (typeof req.body.estado === 'string') {
    if (!['DISPONIBLE', 'AVERIA', 'INACTIVO'].includes(req.body.estado)) return res.status(400).json({ error: 'Estado inválido' });
    fields.push(`estado=$${vals.length + 1}`); vals.push(req.body.estado);
  }
  if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });
  vals.push(req.params.id);
  nf(res, (await q(`UPDATE buses SET ${fields.join(', ')} WHERE id=$${vals.length} RETURNING *`, vals))[0]);
}));
app.get('/api/admin/conductores', adm, h(async (_, res) => res.json(await q(`SELECT u.id, u.nombre, u.correo, u.licencia, u.activo,
  x.id AS recorrido_id, x.estado AS recorrido_estado, r.nombre AS ruta, b.placa
  FROM usuarios u
  LEFT JOIN LATERAL (SELECT * FROM recorridos WHERE conductor_id=u.id AND estado IN ('EN_CURSO','INTERRUMPIDO') ORDER BY id DESC LIMIT 1) x ON true
  LEFT JOIN rutas r ON r.id=x.ruta_id
  LEFT JOIN buses b ON b.id=x.bus_id
  WHERE u.rol='CONDUCTOR' ORDER BY u.id`))));
app.post('/api/admin/conductores', adm, h(async (req, res) => {
  const { nombre, correo, password, licencia } = req.body;
  if (!nombre || !correo || !password || password.length < 8) return res.status(400).json({ error: 'Completa nombre, correo y una contraseña de mínimo 8 caracteres' });
  res.status(201).json((await q(`INSERT INTO usuarios(nombre,correo,password_hash,rol,licencia) VALUES($1,$2,$3,'CONDUCTOR',$4) RETURNING id,nombre,rol`,
    [nombre.trim(), correo.toLowerCase(), await bcrypt.hash(password, 12), licencia || null]))[0]);
}));
app.patch('/api/admin/conductores/:id', adm, h(async (req, res) => {
  if (typeof req.body.activo !== 'boolean') return res.status(400).json({ error: 'Indica si el conductor está activo' });
  nf(res, (await q(`UPDATE usuarios SET activo=$1 WHERE id=$2 AND rol='CONDUCTOR' RETURNING id,nombre,correo,licencia,activo`, [req.body.activo, req.params.id]))[0]);
}));
app.get('/api/admin/avisos', adm, h(async (_, res) => res.json(await q(`SELECT a.*, u.nombre AS admin FROM avisos a JOIN usuarios u ON u.id=a.admin_id ORDER BY a.publicado_en DESC`))));
app.post('/api/avisos', adm, h(async (req, res) => { // se guarda quién y cuándo publicó
  const { titulo, mensaje, vigente_hasta } = req.body;
  if (!titulo || !mensaje || !(new Date(vigente_hasta) > new Date())) return res.status(400).json({ error: 'Escribe título, mensaje y una fecha de fin futura' });
  res.status(201).json((await q('INSERT INTO avisos(admin_id,titulo,mensaje,vigente_hasta) VALUES($1,$2,$3,$4) RETURNING *', [req.user.id, titulo.trim(), mensaje.trim(), vigente_hasta]))[0]);
}));

// ---------- Notificaciones push (Firebase Cloud Messaging) ----------
let fcm = null;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  try {
    const fb = require('firebase-admin');
    const cred = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
      ? fb.credential.cert(JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON))
      : fb.applicationDefault();
    if (!fb.apps.length) fb.initializeApp({ credential: cred });
    fcm = fb.messaging();
  } catch (e) { console.error('No se pudo iniciar Firebase:', e.message); }
}
async function push(uid, title, body) {
  if (!fcm) return console.log('[push simulado]', uid, body);
  for (const { token } of await q('SELECT token FROM tokens_push WHERE usuario_id=$1', [uid]))
    await fcm.send({ token, notification: { title, body } }).catch(e => console.error('FCM', e.code));
}
// Cada 10 s: envía la alerta una sola vez por aproximación y limpia posiciones viejas (se conserva una ventana reciente)
async function revisarAlertas() {
  for (const a of await q('SELECT * FROM alertas WHERE activa AND enviada_en IS NULL')) {
    const e = await etaParada(a.parada_id, a.ruta_id);
    if (e.length && e[0].eta_min <= a.minutos_antes) {
      const [ok] = await q('UPDATE alertas SET enviada_en=now() WHERE id=$1 AND enviada_en IS NULL RETURNING id', [a.id]);
      if (ok) await push(a.usuario_id, 'QuillaBus', 'Tu bus está por llegar');
    }
  }
  await q(`DELETE FROM ubicaciones WHERE registrada_en < now() - interval '10 minutes'`);
}
setInterval(() => revisarAlertas().catch(e => console.error('alertas', e)), 10000);

app.use('/api', (_, res) => res.status(404).json({ error: 'Ruta de API no encontrada' }));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`QuillaBus listo en http://localhost:${port}`));
