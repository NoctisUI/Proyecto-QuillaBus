// Simula el GPS de un conductor para probar el mapa, el ETA y las alertas sin un celular.
// Uso: npm run simular   (o API=https://tu-app.onrender.com/api npm run simular)
const API = process.env.API || 'http://localhost:3000/api';
const PASSWORD = process.env.DEMO_PASSWORD || 'Quilla2026!';

async function j(path, body, token) {
  const res = await fetch(API + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

(async () => {
  const { token } = await j('/auth/login', { correo: 'conductor@universidad.edu.co', password: PASSWORD });
  let rec = await j('/conductor/recorrido', undefined, token);
  if (!rec) {
    rec = await j('/recorridos', { bus_id: 1, ruta_id: 1 }, token);
    console.log('Recorrido iniciado:', rec.id, '· bus 1 · ruta 1');
  } else {
    console.log('Reutilizando recorrido activo:', rec.id, '·', rec.ruta_nombre, '·', rec.placa);
  }

  const paradas = await j(`/rutas/${rec.ruta_id}/paradas`, undefined, token);
  if (!paradas || paradas.length < 2) throw new Error('La ruta no tiene paradas suficientes');
  console.log(`Simulando ${paradas.length} paradas reales. Ctrl+C para detener.`);

  let i = 0;
  setInterval(async () => {
    const a = paradas[Math.floor(i) % paradas.length];
    const b = paradas[(Math.floor(i) + 1) % paradas.length];
    const f = i % 1;
    const latitud = a.latitud + (b.latitud - a.latitud) * f;
    const longitud = a.longitud + (b.longitud - a.longitud) * f;
    try {
      await j(`/buses/${rec.bus_id}/ubicacion`, { latitud, longitud, velocidad: 7.5 }, token);
      console.log(`GPS enviado · ${a.nombre} → ${b.nombre} · ${Math.round(f * 100)}%`);
    } catch (e) {
      console.error('GPS:', e.message);
    }
    i = (i + 0.12) % paradas.length;
  }, 5000);
})().catch(e => { console.error(e.message); process.exit(1); });
