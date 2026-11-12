let mapaConductor = null, capaConductor = null, marcadorConductor = null, relojConductor = null;
async function cargarConductor() {
  const c = Estado.conductor;
  const [recorrido, buses, rutas] = await Promise.all([api('/conductor/recorrido'), api('/buses'), api('/rutas')]);
  c.recorrido = recorrido;
  c.buses = buses || [];
  c.rutas = rutas || [];
  if (recorrido) {
    const ps = await api(`/rutas/${recorrido.ruta_id}/paradas`);
    Estado.paradasPorRuta[recorrido.ruta_id] = ps || [];
  }
}
function renderConductor() {
  const c = Estado.conductor, r = c.recorrido;
  const estado = r ? r.estado : null;
  const activo = !!r;
  const color = estado === 'INTERRUMPIDO' ? 'var(--warnt)' : 'var(--g)';
  const disponibles = c.buses.filter(b => !b.ocupado && b.estado === 'DISPONIBLE');
  const g = c.gps;
  const seguro = window.isSecureContext;
  app.innerHTML = cabecera('Mi recorrido', activo ? r.ruta_nombre : 'Espacio del conductor · GPS en tiempo real') + `<main class="simple">
    <div class="card">
      <div class="row">
        <div><small>Estado del recorrido</small><b class="big" style="font-size:34px;color:${color}">${activo ? (estado === 'EN_CURSO' ? 'En curso' : 'Interrumpido') : 'Sin iniciar'}</b></div>
        <div style="text-align:right"><small>Duración</small><b class="mono" id="reloj" style="font-size:25px;display:block">${activo ? '00:00:00' : '—'}</b></div>
      </div>
      ${activo ? `<hr class="sep" style="margin:12px 0"><dl class="kv">
        <dt>Ruta</dt><dd>${esc(r.ruta_nombre)}</dd>
        <dt>Bus</dt><dd>${esc(r.placa)}</dd>
        <dt>Inicio</dt><dd>${fechaHora(r.hora_inicio)}</dd>
      </dl>` : '<p class="mut" style="margin-top:8px">Elige una ruta y un bus. Al iniciar, los estudiantes podrán ver tu posición en el mapa.</p>'}
    </div>
    ${!activo ? `<form class="card col" onsubmit="iniciarRecorrido(event)">
      <h2>Iniciar recorrido</h2>
      <label>Ruta<select id="dr-ruta" required>${c.rutas.map(rut => `<option value="${rut.id}">${esc(rut.nombre)}</option>`).join('')}</select></label>
      <label>Bus disponible<select id="dr-bus" required>${disponibles.map(b => `<option value="${b.id}">${esc(b.placa)} · ${b.capacidad} puestos</option>`).join('')}</select></label>
      ${disponibles.length ? '' : '<div class="notice">No hay buses disponibles. Pide al administrador que revise el estado de los buses o finalice otro recorrido.</div>'}
      <div class="notice ok">Al iniciar se pedirá permiso para usar el GPS. Mantén la ubicación y los datos móviles encendidos.</div>
      <button class="pb block" type="submit" ${disponibles.length ? '' : 'disabled'}>Iniciar recorrido</button>
    </form>` : ''}
    ${activo ? `<div class="card mapa-card">
      <div class="mapa-head"><div><b>Tu posición en la ruta</b><small>Los estudiantes ven este bus cada 5 segundos</small></div><span class="bg ${estado === 'EN_CURSO' ? '' : 'or'}">${estado === 'EN_CURSO' ? 'Transmitiendo' : 'En pausa'}</span></div>
      <div id="mapa-conductor" class="mapbox" style="height:300px" role="application" aria-label="Mapa de tu recorrido"></div>
    </div>
    <div class="card">
      <div class="row"><b>GPS del celular</b><span id="gps-badge" class="bg gr">Esperando</span></div>
      <div class="gps off" id="gps-linea" style="margin-top:8px"><i></i><span id="gps-estado">Obteniendo ubicación…</span></div>
      <dl class="kv" style="margin-top:10px">
        <dt>Latitud</dt><dd id="gps-lat">—</dd>
        <dt>Longitud</dt><dd id="gps-lng">—</dd>
        <dt>Precisión</dt><dd id="gps-pre">—</dd>
        <dt>Último envío</dt><dd id="gps-ultimo">—</dd>
      </dl>
      ${!seguro ? '<div class="notice" style="margin-top:10px">El GPS solo funciona en HTTPS o en localhost. Si abriste el archivo directamente, usa la URL publicada o <b>http://localhost:3000</b>.</div>' : ''}
      <div id="gps-error" class="notice rd" style="margin-top:10px" ${g.error ? '' : 'hidden'}>${esc(g.error || '')}</div>
      <div class="row" style="margin-top:10px"><small>La posición se envía cada 5 s mientras el recorrido está en curso.</small><button class="pb sm ou" onclick="iniciarGPSConductor()">Reintentar GPS</button></div>
    </div>
    <div class="col">
      ${estado === 'EN_CURSO' ? '<button class="pb go" onclick="reportarAveria()">Reportar avería</button>' : '<button class="pb go" onclick="reanudarRecorrido()">Reanudar recorrido</button>'}
      <button class="pb rj" onclick="finalizarRecorrido()">Finalizar recorrido</button>
    </div>
    <small style="text-align:center;padding:0 12px">Mantén la pantalla de QuillaBus abierta y el GPS encendido durante el recorrido.</small>` : ''}
  </main>`;
  if (activo) {
    iniciarRelojConductor();
    pintarMapaConductor();
    iniciarGPSConductor();
    actualizarGPSDOM();
  } else {
    if (relojConductor) clearInterval(relojConductor);
    relojConductor = null;
  }
}
async function iniciarRecorrido(ev) {
  ev.preventDefault();
  const ruta = Number((document.getElementById('dr-ruta') || {}).value), bus = Number((document.getElementById('dr-bus') || {}).value);
  if (!ruta || !bus) return toast('Elige una ruta y un bus disponible', 'err');
  const btn = ev.target.querySelector('button[type=submit]');
  if (btn) { btn.disabled = true; btn.textContent = 'Iniciando…'; }
  try {
    await api('/recorridos', { method: 'POST', body: { bus_id: bus, ruta_id: ruta } });
    await cargarConductor();
    render();
    toast('Recorrido iniciado. Comparte tu GPS con los estudiantes.', 'ok', 5000);
  } catch (e) {
    toast(e.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Iniciar recorrido'; }
  }
}
async function reportarAveria() {
  const r = Estado.conductor.recorrido;
  if (!r || !confirm('¿Reportar avería? El bus dejará de mostrarse a los estudiantes hasta reanudar.')) return;
  try {
    await api(`/recorridos/${r.id}/averia`, { method: 'POST' });
    await cargarConductor();
    render();
    toast('Avería reportada. El recorrido quedó en pausa.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
async function reanudarRecorrido() {
  const r = Estado.conductor.recorrido;
  if (!r) return;
  try {
    await api(`/recorridos/${r.id}/reanudar`, { method: 'POST' });
    await cargarConductor();
    render();
    toast('Recorrido reanudado', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
async function finalizarRecorrido() {
  const r = Estado.conductor.recorrido;
  if (!r || !confirm('¿Finalizar el recorrido? El bus saldrá del mapa de los estudiantes.')) return;
  try {
    await api(`/recorridos/${r.id}/finalizar`, { method: 'POST' });
    detenerGPSConductor();
    await cargarConductor();
    render();
    toast('Recorrido finalizado', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
function iniciarRelojConductor() {
  if (relojConductor) clearInterval(relojConductor);
  actualizarRelojConductor();
  relojConductor = setInterval(actualizarRelojConductor, 1000);
}
function actualizarRelojConductor() {
  const el = document.getElementById('reloj');
  if (!el) return;
  const r = Estado.conductor.recorrido;
  if (!r || !r.hora_inicio) { el.textContent = '—'; return; }
  const fin = r.hora_fin ? new Date(r.hora_fin) : new Date();
  const s = Math.max(0, Math.floor((fin - new Date(r.hora_inicio)) / 1000));
  const z = n => String(n).padStart(2, '0');
  el.textContent = `${z(Math.floor(s / 3600))}:${z(Math.floor(s / 60) % 60)}:${z(s % 60)}`;
}
function pintarMapaConductor() {
  const cont = document.getElementById('mapa-conductor');
  if (!cont) return;
  const c = Estado.conductor, r = c.recorrido;
  if (!r) return;
  if (!window.L) { cont.innerHTML = '<div class="mapa-error">No se pudo cargar el mapa. El GPS sigue enviando la ubicación.</div>'; return; }
  const ps = Estado.paradasPorRuta[r.ruta_id] || [];
  if (mapaConductor) { quitarMapa(mapaConductor); mapaConductor = null; }
  const centro = ps.length ? [ps[0].latitud, ps[0].longitud] : [10.9878, -74.7889];
  mapaConductor = L.map(cont, { zoomControl: true, zoomAnimation: false, fadeAnimation: false }).setView(centro, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mapaConductor);
  const coords = ps.map(p => [p.latitud, p.longitud]);
  capaConductor = L.layerGroup().addTo(mapaConductor);
  if (coords.length > 1) {
    const linea = L.polyline(coords, { color: r.color || '#00573F', weight: 5, opacity: .85 }).addTo(mapaConductor);
    mapaConductor.fitBounds(linea.getBounds(), { padding: [28, 28] });
    geometriaRuta({ id: r.ruta_id }).then(ll => {
      if (mapaConductor && ll && ll.length > 1 && Estado.conductor.recorrido && Estado.conductor.recorrido.ruta_id === r.ruta_id) {
        linea.setLatLngs(ll);
        mapaConductor.fitBounds(linea.getBounds(), { padding: [28, 28] });
      }
    }).catch(() => { });
  }
  ps.forEach((p, i) => {
    L.circleMarker([p.latitud, p.longitud], { radius: 5, color: r.color || '#00573F', fillColor: '#fff', fillOpacity: 1, weight: 3 })
      .addTo(capaConductor).bindTooltip(`${i + 1}. ${p.nombre}`);
  });
  actualizarMapaConductor();
}
function actualizarMapaConductor() {
  if (!mapaConductor) return;
  const g = Estado.conductor.gps, r = Estado.conductor.recorrido;
  if (!g.pos || !r) return;
  const ll = [g.pos.lat, g.pos.lng];
  if (!marcadorConductor) {
    marcadorConductor = L.marker(ll, { icon: iconoBus(r.color || '#00573F'), zIndexOffset: 2000, title: 'Tu bus' }).addTo(mapaConductor);
    mapaConductor.panTo(ll);
  } else marcadorConductor.setLatLng(ll);
}
function iniciarGPSConductor() {
  const g = Estado.conductor.gps;
  if (!Estado.conductor.recorrido) return;
  if (!('geolocation' in navigator)) { g.error = 'Este dispositivo o navegador no soporta geolocalización.'; actualizarGPSDOM(); return; }
  if (!window.isSecureContext) { g.error = 'El GPS requiere HTTPS o localhost. Abre la URL publicada de la app.'; actualizarGPSDOM(); return; }
  if (g.watchId !== null) return;
  g.error = null;
  try {
    g.watchId = navigator.geolocation.watchPosition(pos => {
      g.pos = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, speed: pos.coords.speed || 0, ts: Date.now() };
      g.error = null;
      actualizarGPSDOM();
      actualizarMapaConductor();
      if (!g.ultimoEnvio) enviarUbicacion();
    }, err => {
      g.error = err.code === 1 ? 'Permiso de ubicación denegado. Actívalo en los ajustes del navegador y pulsa Reintentar GPS.' :
        err.code === 2 ? 'No se pudo obtener la ubicación. Verifica que el GPS esté encendido.' :
          'La ubicación tardó demasiado. Busca un lugar con mejor señal e inténtalo de nuevo.';
      if (err.code === 1 && g.watchId !== null) { try { navigator.geolocation.clearWatch(g.watchId); } catch { } g.watchId = null; }
      actualizarGPSDOM();
    }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
  } catch (e) {
    g.error = 'No se pudo iniciar el GPS: ' + e.message;
  }
  actualizarGPSDOM();
}
function detenerGPSConductor() {
  const g = Estado.conductor.gps;
  if (g.watchId !== null) {
    try { navigator.geolocation.clearWatch(g.watchId); } catch { }
    g.watchId = null;
  }
  actualizarGPSDOM();
}
async function enviarUbicacion() {
  const c = Estado.conductor, g = c.gps, r = c.recorrido;
  if (!r || r.estado !== 'EN_CURSO' || !g.pos || g.enviando) return;
  if (Date.now() - g.pos.ts > 30000) return;
  g.enviando = true;
  try {
    await api(`/buses/${r.bus_id}/ubicacion`, { method: 'POST', body: { latitud: g.pos.lat, longitud: g.pos.lng, velocidad: Math.max(0, g.pos.speed || 0) }, silencioso: true });
    g.ultimoEnvio = new Date();
    g.error = null;
  } catch (e) {
    if (e.status !== 401) g.error = 'No se pudo enviar la ubicación: ' + e.message;
  } finally {
    g.enviando = false;
    actualizarGPSDOM();
    actualizarMapaConductor();
  }
}
function actualizarGPSDOM() {
  const c = Estado.conductor, g = c.gps, r = c.recorrido;
  const badge = document.getElementById('gps-badge'), linea = document.getElementById('gps-linea'), est = document.getElementById('gps-estado');
  if (!badge || !linea || !est) return;
  const error = g.error;
  const pausa = r && r.estado === 'INTERRUMPIDO';
  const transmitiendo = g.pos && g.watchId !== null && !error && !pausa;
  badge.className = 'bg ' + (error ? 'rd' : transmitiendo ? '' : pausa ? 'or' : 'gr');
  badge.textContent = error ? 'Revisar' : transmitiendo ? 'Transmitiendo' : pausa ? 'En pausa' : 'Esperando';
  linea.className = 'gps ' + (error ? 'bad' : transmitiendo ? '' : 'off');
  est.textContent = error ? 'GPS con problemas' : transmitiendo ? (r.estado === 'EN_CURSO' ? 'GPS activo · enviando cada 5 s' : 'GPS listo · recorrido en pausa') : g.pos ? 'Ubicación obtenida' : 'Obteniendo ubicación…';
  const lat = document.getElementById('gps-lat'), lng = document.getElementById('gps-lng'), pre = document.getElementById('gps-pre'), ult = document.getElementById('gps-ultimo');
  if (lat) lat.textContent = g.pos ? g.pos.lat.toFixed(6) : '—';
  if (lng) lng.textContent = g.pos ? g.pos.lng.toFixed(6) : '—';
  if (pre) pre.textContent = g.pos && g.pos.accuracy ? `± ${Math.round(g.pos.accuracy)} m` : '—';
  if (ult) ult.textContent = g.ultimoEnvio ? `${hora(g.ultimoEnvio.toISOString())} (${desde(g.ultimoEnvio)})` : 'Aún no se ha enviado';
  const err = document.getElementById('gps-error');
  if (err) { err.hidden = !error; err.textContent = error || ''; }
}
function destruirMapaConductor() {
  if (mapaConductor) { quitarMapa(mapaConductor); mapaConductor = null; }
  capaConductor = null; marcadorConductor = null;
}
