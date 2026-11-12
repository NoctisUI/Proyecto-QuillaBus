let mapa = null, capaBuses = null, capaParadas = null, lineaRuta = null, mapaRutaActual = null;
const geoCache = new Map();
const normalizar = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const rutaActual = () => Estado.rutas.find(r => r.id === Estado.rutaSel) || null;
const paradaActual = () => (Estado.paradasPorRuta[Estado.rutaSel] || []).find(p => p.id === Estado.paradaSel) || null;
const nombreRuta = id => (Estado.rutas.find(r => r.id === id) || {}).nombre || `Ruta ${id}`;
const nombreParada = id => (Estado.paradasMap[id] || {}).nombre || `Parada ${id}`;
const alertaActiva = () => Estado.alertas.find(a => a.estado === 'ACTIVA' && a.ruta_id === Estado.rutaSel && a.parada_id === Estado.paradaSel) || null;
const esFavRuta = id => Estado.favoritos.some(f => f.ruta_id === id);
const esFavParada = id => Estado.favoritos.some(f => f.parada_id === id);
function quitarMapa(m) {
  if (!m) return;
  try { m.stop(); } catch { }
  try { m.off(); } catch { }
  try { m.remove(); } catch { }
}

async function cargarDatosEstudiante() {
  const [rutas, avisos, favoritos, alertas] = await Promise.all([
    api('/rutas'), api('/avisos'), api('/favoritos'), api('/alertas')
  ]);
  Estado.rutas = rutas || [];
  Estado.avisos = avisos || [];
  Estado.favoritos = favoritos || [];
  Estado.alertas = alertas || [];
  const porRuta = {}, mapaParadas = {};
  await Promise.all(Estado.rutas.map(async r => {
    const ps = await api(`/rutas/${r.id}/paradas`);
    porRuta[r.id] = ps || [];
    for (const p of ps || []) {
      if (!mapaParadas[p.id]) mapaParadas[p.id] = { ...p, rutaIds: [] };
      if (!mapaParadas[p.id].rutaIds.includes(r.id)) mapaParadas[p.id].rutaIds.push(r.id);
    }
  }));
  Estado.paradasPorRuta = porRuta;
  Estado.paradasMap = mapaParadas;
  if (!Estado.rutaSel || !Estado.rutas.some(r => r.id === Estado.rutaSel)) {
    const fav = Estado.favoritos.find(f => f.ruta_id);
    Estado.rutaSel = (fav && Estado.rutas.some(r => r.id === fav.ruta_id)) ? fav.ruta_id : (Estado.rutas[0] ? Estado.rutas[0].id : null);
  }
  const ps = Estado.paradasPorRuta[Estado.rutaSel] || [];
  if (!ps.some(p => p.id === Estado.paradaSel)) {
    const favP = Estado.favoritos.find(f => f.parada_id && ps.some(p => p.id === f.parada_id));
    Estado.paradaSel = favP ? favP.parada_id : (ps[0] ? ps[0].id : null);
  }
}
function renderEstudiante() {
  const vistas = { mapa: vistaMapa, rutas: vistaRutas, alertas: vistaAlertas, avisos: vistaAvisos };
  const v = (vistas[Estado.tab] || vistaMapa)();
  app.innerHTML = cabecera(v.titulo, v.sub) + `<main>${v.html}</main>` + navEstudiante();
  if (Estado.tab === 'mapa') pintarMapa();
}
function navEstudiante() {
  const activas = Estado.alertas.filter(a => a.estado === 'ACTIVA').length;
  const tabs = [['mapa', 'Mapa', 'mapa'], ['rutas', 'Rutas', 'rutas'], ['alertas', 'Alertas', 'alertas'], ['avisos', 'Avisos', 'avisos']];
  return `<nav class="nv">${tabs.map(([k, l, ic]) => `<button class="${Estado.tab === k ? 'on' : ''}" onclick="irTab('${k}')" ${Estado.tab === k ? 'aria-current="page"' : ''}>${icono(ic)}<span>${l}</span>${k === 'alertas' && activas ? `<i class="bd">${activas}</i>` : ''}</button>`).join('')}</nav>`;
}
async function irTab(k) {
  Estado.tab = ['mapa', 'rutas', 'alertas', 'avisos'].includes(k) ? k : 'mapa';
  render();
  if (k === 'alertas') {
    try {
      await Promise.all([cargarAlertas(), cargarFavoritos()]);
      if (Estado.tab === 'alertas') render();
    } catch (e) { toast(e.message, 'err'); }
  } else if (k === 'avisos') {
    try {
      Estado.avisos = await api('/avisos') || [];
      if (Estado.tab === 'avisos') render();
    } catch (e) { toast(e.message, 'err'); }
  }
}
function vistaMapa() {
  const ruta = rutaActual(), ps = ruta ? (Estado.paradasPorRuta[ruta.id] || []) : [];
  return {
    titulo: '¿Dónde está tu bus?',
    sub: 'Paradas reales de Barranquilla · posición del bus cada 5 segundos',
    html: `<div class="chips" aria-label="Elegir ruta">${Estado.rutas.map(r => `<button class="ch ${r.id === Estado.rutaSel ? 'on' : ''}" style="--c:${esc(r.color)}" onclick="seleccionarRuta(${r.id})" title="${esc(r.nombre)}">${esc(r.nombre.split('·')[0].trim())}</button>`).join('')}</div>
    ${!ruta ? '<div class="empty">Todavía no hay rutas activas. Pide al administrador que habilite una.</div>' : `
    <div class="card mapa-card">
      <div class="mapa-head"><div><b>${esc(ruta.nombre)}</b><small>${ps.length} paradas · ${ruta.en_servicio ? 'servicio activo' : 'sin buses en servicio'}</small></div><span class="bg ${ruta.en_servicio ? '' : 'gr'}" id="servicio-badge">${ruta.en_servicio ? 'En servicio' : 'Sin buses'}</span></div>
      <div id="mapa" class="mapbox" role="application" aria-label="Mapa de ${esc(ruta.nombre)}"></div>
      <div class="mapa-foot"><span id="ultima-act">Actualizando…</span><span id="buses-activos">0 buses</span></div>
    </div>
    <div id="panel-eta-wrap">${panelEta()}</div>
    <div class="card flat row"><small>Los tiempos se calculan con la última velocidad real reportada por cada bus.</small><button class="link" onclick="refrescarBusesYETA(true)">Actualizar</button></div>`}`
  };
}
function panelEta() {
  const ruta = rutaActual(), parada = paradaActual();
  if (!ruta || !parada) return '<div class="empty">Selecciona una ruta y una parada para ver el tiempo de llegada.</div>';
  const p = (Estado.paradasPorRuta[ruta.id] || []), fav = esFavParada(parada.id), alerta = alertaActiva();
  return `<div class="card">
    <div class="row">
      <div><small>Tu bus llega en</small><div class="row start" style="gap:10px"><b class="big" id="eta-big">—</b><span id="eta-badge" class="bg gr">Calculando</span></div></div>
      <button class="icon-btn" onclick="alternarFavParada(${parada.id})" aria-label="${fav ? 'Quitar parada de favoritas' : 'Guardar parada en favoritas'}" title="${fav ? 'Quitar de favoritas' : 'Guardar en favoritas'}">${fav ? '★' : '☆'}</button>
    </div>
    <label style="margin-top:8px">Tu parada<select onchange="seleccionarParada(+this.value)" aria-label="Elegir parada">${p.map((x, i) => `<option value="${x.id}" ${x.id === parada.id ? 'selected' : ''}>${i + 1}. ${esc(x.nombre)}</option>`).join('')}</select></label>
    <div id="eta-lista" style="margin-top:9px"></div>
    <div class="row" style="margin-top:12px;align-items:flex-end">
      <label style="flex:1">Avisarme antes<select id="min-alerta" onchange="cambiarMinutos(this.value)">${[1, 3, 5, 10, 15].map(m => `<option value="${m}" ${m === Estado.minutosAntes ? 'selected' : ''}>${m} min antes</option>`).join('')}</select></label>
      <button class="pb" id="btn-alerta" style="flex:1.25" onclick="crearAlerta()" ${alerta ? 'disabled' : ''}>${alerta ? 'Alerta activa' : 'Activar alerta'}</button>
    </div>
    <div class="row" style="margin-top:7px"><small id="alerta-nota">${alerta ? `Aviso ${alerta.estado === 'ENVIADA' ? 'enviado' : 'activo'} · ${alerta.minutos_antes} min antes` : 'Te avisamos una sola vez cuando el bus esté cerca.'}</small><button class="link" onclick="irTab('alertas')">Gestionar</button></div>
  </div>`;
}
function cambiarMinutos(v) { Estado.minutosAntes = Number(v) || 3; }
function seleccionarRuta(id) {
  Estado.rutaSel = Number(id);
  const ps = Estado.paradasPorRuta[Estado.rutaSel] || [];
  const favP = Estado.favoritos.find(f => f.parada_id && ps.some(p => p.id === f.parada_id));
  if (!ps.some(p => p.id === Estado.paradaSel)) Estado.paradaSel = favP ? favP.parada_id : (ps[0] ? ps[0].id : null);
  Estado.tab = 'mapa'; Estado.buses = []; Estado.eta = []; Estado.ultimaAct = null;
  render();
}
function seleccionarParada(id) {
  Estado.paradaSel = Number(id); Estado.eta = [];
  render();
}
function verParadaEnMapa(rutaId, paradaId) {
  Estado.rutaSel = Number(rutaId); Estado.paradaSel = Number(paradaId);
  Estado.tab = 'mapa'; Estado.buses = []; Estado.eta = []; Estado.ultimaAct = null;
  render();
}
function iconoParada(sel, color) {
  return L.divIcon({ className: '', html: `<div class="pin-parada ${sel ? 'sel' : ''}" style="--c:${esc(color)}"></div>`, iconSize: sel ? [22, 22] : [16, 16], iconAnchor: sel ? [11, 11] : [8, 8] });
}
function iconoBus(color) {
  return L.divIcon({ className: '', html: `<div class="pin-bus" style="--c:${esc(color)}">🚌</div>`, iconSize: [34, 34], iconAnchor: [17, 17] });
}
function pintarMapa() {
  const cont = document.getElementById('mapa');
  if (!cont) return;
  const ruta = rutaActual();
  if (!ruta) return;
  if (!window.L) {
    cont.innerHTML = '<div class="mapa-error">No se pudo cargar el mapa (revisa la conexión). Las paradas, el ETA y las alertas siguen funcionando.</div>';
    return;
  }
  if (mapa) { quitarMapa(mapa); mapa = null; }
  const ps = Estado.paradasPorRuta[ruta.id] || [];
  const centro = ps.length ? [ps[0].latitud, ps[0].longitud] : [10.9878, -74.7889];
  mapa = L.map(cont, { zoomControl: true, attributionControl: true, zoomAnimation: false, fadeAnimation: false }).setView(centro, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(mapa);
  const coords = ps.map(p => [p.latitud, p.longitud]);
  lineaRuta = L.polyline(coords.length > 1 ? coords : [centro], { color: ruta.color, weight: 5, opacity: .88, lineJoin: 'round' }).addTo(mapa);
  capaParadas = L.layerGroup().addTo(mapa);
  ps.forEach((p, i) => {
    const m = L.marker([p.latitud, p.longitud], { icon: iconoParada(p.id === Estado.paradaSel, ruta.color), title: `${i + 1}. ${p.nombre}` }).addTo(capaParadas);
    m.bindPopup(`<b>${i + 1}. ${esc(p.nombre)}</b><br><button class="link" onclick="seleccionarParada(${p.id})">Ver ETA en esta parada</button>`);
    m.on('click', () => seleccionarParada(p.id));
  });
  capaBuses = L.layerGroup().addTo(mapa);
  mapaRutaActual = ruta.id;
  if (coords.length > 1) mapa.fitBounds(lineaRuta.getBounds(), { padding: [28, 28] }); else mapa.setView(centro, 15);
  geometriaRuta(ruta).then(ll => {
    if (mapa && Estado.rutaSel === ruta.id && lineaRuta && ll && ll.length > 1) {
      lineaRuta.setLatLngs(ll);
      mapa.fitBounds(lineaRuta.getBounds(), { padding: [28, 28] });
    }
  }).catch(() => { });
  Estado.buses = []; Estado.eta = [];
  dibujarBuses();
  refrescarBusesYETA();
}
async function geometriaRuta(ruta) {
  if (geoCache.has(ruta.id)) return geoCache.get(ruta.id);
  const ps = Estado.paradasPorRuta[ruta.id] || [];
  const fallback = ps.map(p => [p.latitud, p.longitud]);
  if (ps.length < 2) return fallback;
  try {
    const url = 'https://router.project-osrm.org/route/v1/driving/' + ps.map(p => `${p.longitud},${p.latitud}`).join(';') + '?overview=full&geometries=geojson';
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('OSRM');
    const data = await res.json();
    const c = data && data.routes && data.routes[0] && data.routes[0].geometry && data.routes[0].geometry.coordinates;
    if (Array.isArray(c) && c.length > 1) {
      const ll = c.map(([lon, lat]) => [lat, lon]);
      geoCache.set(ruta.id, ll);
      return ll;
    }
  } catch { }
  return fallback;
}
function dibujarBuses() {
  if (!mapa || !capaBuses) return;
  const ruta = rutaActual();
  capaBuses.clearLayers();
  for (const b of Estado.buses) {
    L.marker([b.latitud, b.longitud], { icon: iconoBus(ruta ? ruta.color : '#00573F'), title: b.placa, zIndexOffset: 1000 })
      .addTo(capaBuses)
      .bindPopup(`<b>${esc(b.placa)}</b><br>Velocidad: ${Math.round((b.vel || 0) * 3.6)} km/h<br>Actualizado ${desde(b.registrada_en)}`);
  }
  const el = document.getElementById('buses-activos');
  if (el) el.textContent = `${Estado.buses.length} bus${Estado.buses.length === 1 ? '' : 'es'}`;
  const badge = document.getElementById('servicio-badge');
  if (badge) {
    badge.textContent = Estado.buses.length ? 'En servicio' : 'Sin buses';
    badge.className = 'bg' + (Estado.buses.length ? '' : ' gr');
  }
}
async function refrescarBusesYETA(manual = false) {
  const ruta = Estado.rutaSel, parada = Estado.paradaSel;
  if (!ruta || !parada) return;
  try {
    const [buses, eta] = await Promise.all([
      api(`/rutas/${ruta}/buses`, { silencioso: true }),
      api(`/paradas/${parada}/eta?ruta=${ruta}`, { silencioso: true })
    ]);
    if (Estado.rutaSel !== ruta || Estado.paradaSel !== parada) return;
    Estado.buses = buses || [];
    Estado.eta = eta || [];
    Estado.ultimaAct = new Date();
    dibujarBuses();
    actualizarEtaDOM();
    if (manual) toast(Estado.buses.length ? 'Datos actualizados' : 'No hay buses en servicio en este momento', Estado.buses.length ? 'ok' : '');
  } catch (e) {
    if (manual) toast(e.message, 'err');
  }
}
function actualizarEtaDOM() {
  const big = document.getElementById('eta-big');
  if (!big) return;
  const e = Estado.eta[0];
  big.textContent = e ? minTexto(e.eta_min) : '—';
  const badge = document.getElementById('eta-badge');
  if (badge) {
    badge.textContent = e ? (Number(e.eta_min) < 1 ? 'Llegando' : 'En camino') : 'Sin bus';
    badge.className = 'bg' + (e ? '' : ' gr');
  }
  const lista = document.getElementById('eta-lista');
  if (lista) {
    lista.innerHTML = Estado.eta.length
      ? Estado.eta.map((b, i) => `<div class="stop-item"><span class="n">${i + 1}</span><span><b>${esc(b.placa)}</b><br><small>Bus en camino</small></span><span class="eta">${minTexto(b.eta_min)}</span></div>`).join('')
      : '<div class="empty" style="padding:13px">No hay buses en servicio en este momento. El ETA aparecerá cuando un conductor inicie la ruta.</div>';
  }
  const last = document.getElementById('ultima-act');
  if (last) last.textContent = Estado.ultimaAct ? `Actualizado ${hora(Estado.ultimaAct.toISOString())}` : 'Actualizando…';
  const alerta = alertaActiva();
  if (alerta && e && !alerta.enviada_en && Number(e.eta_min) <= alerta.minutos_antes) {
    const key = 'qb.aviso.' + alerta.id;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      toast(`🔔 Tu bus está por llegar a ${alerta.minutos_antes} min de ${nombreParada(alerta.parada_id)}`, 'ok', 7000);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
  }
}
function actualizarPanelEta() {
  const w = document.getElementById('panel-eta-wrap');
  if (w) { w.innerHTML = panelEta(); actualizarEtaDOM(); }
  const nav = document.querySelector('.nv');
  if (nav) nav.outerHTML = navEstudiante();
  else if (Estado.tab === 'alertas') render();
}
async function crearAlerta() {
  const ruta = rutaActual(), parada = paradaActual();
  if (!ruta || !parada) return toast('Elige una ruta y una parada', 'err');
  if (alertaActiva()) return toast('Ya tienes una alerta activa para esta parada');
  const minutos = Number((document.getElementById('min-alerta') || {}).value || Estado.minutosAntes);
  const btn = document.getElementById('btn-alerta');
  if (btn) { btn.disabled = true; btn.textContent = 'Creando…'; }
  try {
    const a = await api('/alertas', { method: 'POST', body: { parada_id: parada.id, ruta_id: ruta.id, minutos_antes: minutos } });
    Estado.alertas = await api('/alertas');
    actualizarPanelEta();
    toast(`Alerta creada · ${minutos} min antes de ${parada.nombre}`, 'ok');
  } catch (e) {
    toast(e.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'Activar alerta'; }
  }
}
async function cargarAlertas() { Estado.alertas = await api('/alertas'); }
async function cargarFavoritos() { Estado.favoritos = await api('/favoritos'); }
async function alternarAlerta(id, activa) {
  try {
    await api(`/alertas/${id}`, { method: 'PATCH', body: { activa: !!activa } });
    await cargarAlertas();
    render();
    toast(activa ? 'Alerta activada' : 'Alerta desactivada', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
async function borrarAlerta(id) {
  if (!confirm('¿Eliminar esta alerta de llegada?')) return;
  try {
    await api(`/alertas/${id}`, { method: 'DELETE' });
    await cargarAlertas();
    render();
    toast('Alerta eliminada');
  } catch (e) { toast(e.message, 'err'); }
}
async function alternarFavRuta(id) {
  const f = Estado.favoritos.find(x => x.ruta_id === id);
  try {
    if (f) await api(`/favoritos/${f.id}`, { method: 'DELETE' });
    else await api('/favoritos', { method: 'POST', body: { ruta_id: id } });
    await cargarFavoritos();
    render();
    toast(f ? 'Ruta quitada de favoritas' : 'Ruta guardada en favoritas', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
async function alternarFavParada(id) {
  const f = Estado.favoritos.find(x => x.parada_id === id);
  try {
    if (f) await api(`/favoritos/${f.id}`, { method: 'DELETE' });
    else await api('/favoritos', { method: 'POST', body: { parada_id: id } });
    await cargarFavoritos();
    actualizarPanelEta();
    toast(f ? 'Parada quitada de favoritas' : 'Parada guardada en favoritas', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
function vistaRutas() {
  return {
    titulo: 'Rutas y paradas',
    sub: `${Estado.rutas.length} rutas activas · ${Object.keys(Estado.paradasMap).length} paradas reales de Barranquilla`,
    html: `<input id="buscar-rutas" aria-label="Buscar ruta o parada" placeholder="Buscar ruta o parada…" value="${esc(Estado.busqueda)}" oninput="filtrarRutas(this.value)">
    <div id="lista-rutas" class="col">${listaRutasHTML()}</div>`
  };
}
function filtrarRutas(v) {
  Estado.busqueda = v;
  const cont = document.getElementById('lista-rutas');
  if (cont) cont.innerHTML = listaRutasHTML();
}
function listaRutasHTML() {
  const q = normalizar(Estado.busqueda), resultados = [];
  for (const r of Estado.rutas) {
    const ps = Estado.paradasPorRuta[r.id] || [];
    const coincideRuta = normalizar(r.nombre).includes(q);
    const coinciden = ps.filter(p => normalizar(p.nombre).includes(q));
    if (!q || coincideRuta || coinciden.length) resultados.push({ r, ps, coinciden, coincideRuta });
  }
  if (!resultados.length) return '<div class="empty">No encontramos rutas ni paradas con ese nombre.</div>';
  return resultados.map(({ r, ps, coinciden, coincideRuta }) => {
    const mostrar = q && !coincideRuta ? coinciden : ps;
    return `<div class="card" style="--c:${esc(r.color)}">
      <div class="it"><i class="bar"></i>
        <div><div class="row"><b>${esc(r.nombre)}</b><button class="icon-btn" onclick="alternarFavRuta(${r.id})" aria-label="${esFavRuta(r.id) ? 'Quitar de favoritas' : 'Guardar en favoritas'}">${esFavRuta(r.id) ? '★' : '☆'}</button></div>
          <small>${ps.length} paradas · ${r.en_servicio ? 'servicio activo' : 'sin buses por ahora'}</small>
          <div class="row wrap" style="justify-content:flex-start;margin-top:7px"><span class="bg ${r.en_servicio ? '' : 'gr'}">${r.en_servicio ? 'En servicio' : 'Sin buses'}</span><button class="pb sm" onclick="seleccionarRuta(${r.id})">Ver en el mapa</button></div>
        </div>
      </div>
      <details ${q && !coincideRuta ? 'open' : ''}><summary>Paradas del recorrido${q && !coincideRuta ? ` · ${mostrar.length} coincidencias` : ''}</summary>
        <div class="stop-list">${mostrar.map((p, i) => {
          const n = ps.findIndex(x => x.id === p.id) + 1;
          return `<div class="stop-item" style="--c:${esc(r.color)}"><span class="n">${n}</span><button onclick="verParadaEnMapa(${r.id},${p.id})">${esc(p.nombre)}</button><span class="eta">Ver ETA</span></div>`;
        }).join('') || '<small>Sin paradas.</small>'}</div>
      </details>
    </div>`;
  }).join('');
}
function vistaAlertas() {
  const activas = Estado.alertas.filter(a => a.estado === 'ACTIVA').length;
  const rutasFav = Estado.favoritos.filter(f => f.ruta_id).map(f => Estado.rutas.find(r => r.id === f.ruta_id)).filter(Boolean);
  const paradasFav = Estado.favoritos.filter(f => f.parada_id).map(f => ({ f, p: Estado.paradasMap[f.parada_id] })).filter(x => x.p);
  const cfg = (typeof self !== 'undefined' && self.QUILLABUS_FIREBASE) || {};
  const pushListo = !!(cfg.config && cfg.config.apiKey && cfg.vapidKey);
  return {
    titulo: 'Alertas y favoritos',
    sub: `${activas} ${activas === 1 ? 'alerta activa' : 'alertas activas'} · te avisamos una sola vez por llegada`,
    html: `<div class="card row"><div><b>${activas ? `${activas} ${activas === 1 ? 'aviso en espera' : 'avisos en espera'}` : 'Sin alertas activas'}</b><small>${Estado.alertas.length} ${Estado.alertas.length === 1 ? 'alerta creada' : 'alertas creadas'} en total</small></div><button class="pb sm ou" onclick="irTab('alertas')">Actualizar</button></div>
    <div class="col">${Estado.alertas.length ? Estado.alertas.map(a => {
      const estado = a.estado || (a.enviada_en ? 'ENVIADA' : (a.activa ? 'ACTIVA' : 'DESACTIVADA'));
      const cls = estado === 'ACTIVA' ? '' : estado === 'ENVIADA' ? 'or' : 'gr';
      return `<div class="card" style="--c:${esc((Estado.rutas.find(r => r.id === a.ruta_id) || {}).color || '#00573F')}"><div class="it"><i class="bar"></i><div>
        <div class="row"><b>${esc(nombreParada(a.parada_id))}</b><span class="bg ${cls}">${estado === 'ACTIVA' ? 'Activa' : estado === 'ENVIADA' ? 'Enviada' : 'Desactivada'}</span></div>
        <small>${esc(nombreRuta(a.ruta_id))} · ${a.minutos_antes} min antes</small>
        <div class="row wrap" style="justify-content:flex-start;margin-top:7px">
          ${estado === 'ACTIVA' ? `<button class="pb sm ou" onclick="alternarAlerta(${a.id},false)">Desactivar</button>` : `<button class="pb sm" onclick="alternarAlerta(${a.id},true)">Reactivar</button>`}
          <button class="pb sm ghost" onclick="borrarAlerta(${a.id})">Eliminar</button>
        </div></div></div></div>`;
    }).join('') : '<div class="empty">Aún no tienes alertas. Entra al mapa, elige una parada y activa tu primer aviso de llegada.</div>'}</div>
    <h2 style="margin:8px 4px 0">Favoritas</h2>
    ${rutasFav.map(r => `<div class="card it" style="--c:${esc(r.color)}"><i class="bar"></i><div><b>${esc(r.nombre)}</b><small>Ruta favorita</small></div><button class="icon-btn" onclick="alternarFavRuta(${r.id})" aria-label="Quitar favorita">★</button></div>`).join('')}
    ${paradasFav.map(({ f, p }) => `<div class="card it"><i class="bar"></i><div><b>${esc(p.nombre)}</b><small>Parada favorita · ${p.rutaIds.map(id => esc(nombreRuta(id).split('·')[0].trim())).join(', ')}</small></div><button class="icon-btn" onclick="alternarFavParada(${p.id})" aria-label="Quitar favorita">★</button></div>`).join('')}
    ${!rutasFav.length && !paradasFav.length ? '<div class="empty">Marca rutas o paradas con la estrella para encontrarlas aquí.</div>' : ''}
    <div class="card flat"><div class="row"><div><b>Notificaciones push</b><small>${pushListo ? 'Recibe el aviso incluso con la app cerrada.' : 'Opcional. Requiere configurar Firebase en el servidor.'}</small></div><button class="pb sm ${pushListo ? '' : 'ou'}" ${pushListo ? '' : 'disabled'} onclick="activarPush()">${pushListo ? 'Activar' : 'No configurado'}</button></div></div>`
  };
}
function vistaAvisos() {
  return {
    titulo: 'Avisos del servicio',
    sub: 'Desvíos, horarios y novedades publicadas por la administración',
    html: Estado.avisos.length ? Estado.avisos.map(a => `<article class="card"><div class="row"><b>${esc(a.titulo)}</b><small>${fecha(a.publicado_en)}</small></div><p class="mut" style="margin-top:6px">${esc(a.mensaje)}</p><small style="display:block;margin-top:8px">Vigente hasta ${fechaHora(a.vigente_hasta)}</small></article>`).join('') : '<div class="empty">No hay avisos vigentes en este momento.</div>'
  };
}
function destruirMapa() {
  if (typeof destruirMapaConductor === 'function') destruirMapaConductor();
  if (mapa) { quitarMapa(mapa); mapa = null; }
  capaBuses = null; capaParadas = null; lineaRuta = null; mapaRutaActual = null;
}
