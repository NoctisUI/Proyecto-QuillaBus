const ADMIN_TABS = [['resumen', 'Resumen'], ['rutas', 'Rutas'], ['paradas', 'Paradas'], ['buses', 'Buses'], ['conductores', 'Conductores'], ['avisos', 'Avisos']];
async function cargarAdmin(tab = Estado.admin.tab) {
  const a = Estado.admin;
  a.tab = tab; a.cargando = true; a.error = null;
  try {
    if (tab === 'resumen') a.resumen = await api('/admin/resumen');
    else if (tab === 'rutas') {
      const [rutas, paradas] = await Promise.all([api('/admin/rutas'), api('/admin/paradas')]);
      a.rutas = rutas || []; a.paradas = paradas || [];
    } else if (tab === 'paradas') a.paradas = await api('/admin/paradas');
    else if (tab === 'buses') a.buses = await api('/admin/buses');
    else if (tab === 'conductores') a.conductores = await api('/admin/conductores');
    else if (tab === 'avisos') a.avisos = await api('/admin/avisos');
  } catch (e) {
    a.error = e.message;
    throw e;
  } finally { a.cargando = false; }
}
function renderAdmin() {
  const a = Estado.admin;
  const vistas = {
    resumen: vistaResumenAdmin, rutas: vistaRutasAdmin, paradas: vistaParadasAdmin,
    buses: vistaBusesAdmin, conductores: vistaConductoresAdmin, avisos: vistaAvisosAdmin
  };
  const v = (vistas[a.tab] || vistaResumenAdmin)();
  app.innerHTML = cabecera(v.titulo, v.sub) + `<main>
    <nav class="tabs" aria-label="Secciones de administración">${ADMIN_TABS.map(([k, l]) => `<button class="tab ${a.tab === k ? 'on' : ''}" onclick="adminTab('${k}')">${l}</button>`).join('')}</nav>
    ${a.error ? `<div class="notice rd">${esc(a.error)} <button class="link" onclick="adminTab('${a.tab}')">Reintentar</button></div>` : ''}
    ${v.html}
  </main>`;
}
async function adminTab(tab) {
  if (!ADMIN_TABS.some(([k]) => k === tab)) return;
  Estado.admin.tab = tab;
  render();
  try {
    await cargarAdmin(tab);
    if (Estado.admin.tab === tab && Estado.sesion && Estado.sesion.usuario.rol === 'ADMIN') render();
  } catch (e) { toast(e.message, 'err'); }
}
async function recargarAdmin() {
  try {
    await cargarAdmin(Estado.admin.tab);
    render();
  } catch (e) { toast(e.message, 'err'); }
}
function adminCargando() {
  return '<div class="card"><div class="gps"><i></i><span>Cargando información…</span></div></div>';
}
function vistaResumenAdmin() {
  const a = Estado.admin, r = a.resumen;
  const kpis = r ? [
    ['Rutas activas', `${r.rutas_activas}/${r.rutas}`, 'Con recorridos disponibles'],
    ['Buses en servicio', `${r.buses_servicio}/${r.buses}`, 'Transmitiendo en este momento'],
    ['Conductores', r.conductores, 'Cuentas registradas'],
    ['Avisos vigentes', r.avisos, 'Publicados y sin vencer']
  ] : [];
  return {
    titulo: 'Operación de QuillaBus',
    sub: 'Resumen del sistema en tiempo real',
    html: `${!r ? adminCargando() : `<div class="kp">${kpis.map(([l, v, s]) => `<div class="card"><small>${l}</small><b>${v}</b><small>${s}</small></div>`).join('')}</div>
    <div class="grid">
      <div class="card"><h2>¿Qué puedes administrar?</h2><p class="mut" style="margin-top:4px">Crea y activa rutas, edita el orden de las paradas, controla buses y conductores, y publica avisos para todos los estudiantes.</p>
        <div class="row wrap" style="justify-content:flex-start;margin-top:12px"><button class="pb sm" onclick="adminTab('rutas')">Rutas</button><button class="pb sm ou" onclick="adminTab('avisos')">Publicar aviso</button><button class="pb sm ghost" onclick="adminTab('buses')">Buses</button></div>
      </div>
      <div class="card"><h2>Rastreo en vivo</h2><p class="mut" style="margin-top:4px">Los estudiantes ven un bus solo si su recorrido está en curso y reportó GPS en los últimos 30 segundos. El ETA se calcula con la velocidad real.</p><div class="notice ok" style="margin-top:10px">Actualiza el panel para ver el estado operativo más reciente.</div><div class="row" style="margin-top:10px"><button class="pb sm ou" onclick="recargarAdmin()">Actualizar panel</button></div></div>
    </div>`}`
  };
}
function vistaRutasAdmin() {
  const a = Estado.admin;
  const html = !a.rutas.length ? adminCargando() : `
    <div class="card"><div class="row"><div><h2>Rutas</h2><small>${a.rutas.length} rutas registradas</small></div><button class="pb sm" onclick="abrirEditorRuta()">Nueva ruta</button></div>
      <div class="tw" style="margin-top:10px"><table><thead><tr><th>Ruta</th><th>Paradas</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
      ${a.rutas.map(r => `<tr><td><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(r.color)};margin-right:6px"></span><b>${esc(r.nombre)}</b></td>
        <td>${r.paradas}</td><td><span class="bg ${r.activa ? (r.en_servicio ? '' : 'or') : 'gr'}">${r.activa ? (r.en_servicio ? 'En servicio' : 'Sin buses') : 'Inactiva'}</span></td>
        <td><button class="pb sm ou" onclick="abrirEditorRuta(${r.id})">Paradas</button><button class="pb sm ${r.activa ? 'ghost' : ''}" onclick="alternarRuta(${r.id},${r.activa ? 'false' : 'true'})">${r.activa ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('')}
      </tbody></table></div>
    </div>
    ${a.paradas.length ? '' : '<div class="notice">No hay paradas creadas. Agrega paradas antes de armar una ruta.</div>'}`;
  return { titulo: 'Rutas', sub: 'Crea recorridos y define sus paradas en orden', html };
}
function abrirEditorRuta(id) {
  const a = Estado.admin;
  const ruta = id ? a.rutas.find(r => r.id === Number(id)) : null;
  let ids = ruta ? ruta.parada_ids : [];
  if (typeof ids === 'string') { try { ids = JSON.parse(ids); } catch { ids = []; } }
  ids = (ids || []).map(Number);
  const ordenadas = [...a.paradas].sort((x, y) => {
    const ix = ids.indexOf(x.id), iy = ids.indexOf(y.id);
    if (ix >= 0 && iy >= 0) return ix - iy;
    if (ix >= 0) return -1;
    if (iy >= 0) return 1;
    return x.nombre.localeCompare(y.nombre);
  });
  abrirModal(`<div class="modal-head"><h2>${ruta ? 'Editar ruta' : 'Nueva ruta'}</h2><button onclick="cerrarModal()" aria-label="Cerrar">×</button></div>
    <label>Nombre de la ruta<input id="mr-nombre" value="${ruta ? esc(ruta.nombre) : ''}" placeholder="Ruta 4 · Campus – Aeropuerto" minlength="3" required></label>
    <label>Color<input id="mr-color" type="color" value="${ruta ? esc(ruta.color) : '#00573F'}"></label>
    <div><b style="font-size:14px">Paradas en orden</b><small style="display:block;margin-bottom:5px">Marca las paradas; se guardan en el orden de esta lista.</small>
      <div class="check-list" id="mr-paradas">${ordenadas.map(p => `<label><input type="checkbox" value="${p.id}" ${ids.includes(p.id) ? 'checked' : ''}><span>${esc(p.nombre)}</span><small>${p.activa ? '' : 'inactiva'}</small></label>`).join('') || '<small>No hay paradas disponibles.</small>'}</div>
    </div>
    <div class="row" style="margin-top:4px"><button class="pb ou" onclick="cerrarModal()">Cancelar</button><button class="pb" id="mr-guardar" onclick="guardarRuta(${ruta ? ruta.id : 'null'})">${ruta ? 'Guardar cambios' : 'Crear ruta'}</button></div>`);
}
async function guardarRuta(id) {
  const nombre = document.getElementById('mr-nombre').value.trim();
  const color = document.getElementById('mr-color').value;
  const paradas = $$('#mr-paradas input:checked').map(x => Number(x.value));
  if (nombre.length < 3) return toast('El nombre de la ruta es muy corto', 'err');
  const btn = document.getElementById('mr-guardar');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    if (id) {
      await api(`/admin/rutas/${id}`, { method: 'PATCH', body: { nombre, color } });
      await api(`/admin/rutas/${id}/paradas`, { method: 'PUT', body: { paradas } });
    } else {
      await api('/admin/rutas', { method: 'POST', body: { nombre, color, paradas } });
    }
    cerrarModal();
    await cargarAdmin('rutas');
    render();
    toast(id ? 'Ruta actualizada' : 'Ruta creada', 'ok');
  } catch (e) {
    toast(e.message, 'err');
    if (btn) { btn.disabled = false; btn.textContent = id ? 'Guardar cambios' : 'Crear ruta'; }
  }
}
async function alternarRuta(id, activa) {
  if (!activa && !confirm('¿Desactivar esta ruta? Dejará de aparecer para los estudiantes.')) return;
  try {
    await api(`/admin/rutas/${id}`, { method: 'PATCH', body: { activa: !!activa } });
    await cargarAdmin('rutas'); render();
    toast(activa ? 'Ruta activada' : 'Ruta desactivada', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
function vistaParadasAdmin() {
  const a = Estado.admin;
  return {
    titulo: 'Paradas', sub: 'Puntos reales de Barranquilla usados por las rutas',
    html: `<div class="card"><details><summary>+ Agregar una parada</summary>
      <form onsubmit="crearParada(event)" class="col" style="margin-top:8px">
        <label>Nombre<input id="np-nombre" placeholder="Ej.: Estación La Catedral" required></label>
        <div class="grid2"><label>Latitud<input id="np-lat" type="number" step="any" placeholder="10.9884" required></label><label>Longitud<input id="np-lng" type="number" step="any" placeholder="-74.7887" required></label></div>
        <button class="pb block" type="submit">Guardar parada</button>
      </form></details></div>
    ${!a.paradas.length ? adminCargando() : `<div class="card"><div class="row"><h2>Paradas registradas</h2><small>${a.paradas.length} en total</small></div>
      <div class="tw" style="margin-top:10px"><table><thead><tr><th>Parada</th><th>Coordenadas</th><th>Rutas</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
      ${a.paradas.map(p => `<tr><td><b>${esc(p.nombre)}</b></td><td class="mono" style="white-space:nowrap">${Number(p.latitud).toFixed(5)}, ${Number(p.longitud).toFixed(5)}</td><td>${p.rutas}</td><td><span class="bg ${p.activa ? '' : 'gr'}">${p.activa ? 'Activa' : 'Inactiva'}</span></td><td><button class="pb sm ${p.activa ? 'ghost' : ''}" onclick="alternarParada(${p.id},${p.activa ? 'false' : 'true'})">${p.activa ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('')}
      </tbody></table></div></div>`}`
  };
}
async function crearParada(ev) {
  ev.preventDefault();
  const nombre = document.getElementById('np-nombre').value.trim();
  const latitud = Number(document.getElementById('np-lat').value), longitud = Number(document.getElementById('np-lng').value);
  if (!nombre || !Number.isFinite(latitud) || !Number.isFinite(longitud)) return toast('Completa el nombre y coordenadas válidas', 'err');
  try {
    await api('/admin/paradas', { method: 'POST', body: { nombre, latitud, longitud } });
    await cargarAdmin('paradas'); render();
    toast('Parada creada', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
async function alternarParada(id, activa) {
  try {
    await api(`/admin/paradas/${id}`, { method: 'PATCH', body: { activa: !!activa } });
    await cargarAdmin('paradas'); render();
    toast(activa ? 'Parada activada' : 'Parada desactivada', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
function vistaBusesAdmin() {
  const a = Estado.admin;
  return {
    titulo: 'Buses', sub: 'Estado de la flota y recorridos en curso',
    html: `<div class="card"><details><summary>+ Agregar un bus</summary>
      <form onsubmit="crearBus(event)" class="col" style="margin-top:8px">
        <div class="grid2"><label>Placa<input id="nb-placa" placeholder="QB-045" required></label><label>Capacidad<input id="nb-cap" type="number" min="1" max="200" value="40" required></label></div>
        <button class="pb block" type="submit">Guardar bus</button>
      </form></details></div>
    ${!a.buses.length ? adminCargando() : `<div class="card"><div class="row"><h2>Flota</h2><small>${a.buses.length} buses</small></div>
      <div class="tw" style="margin-top:10px"><table><thead><tr><th>Placa</th><th>Capacidad</th><th>Estado</th><th>Recorrido actual</th><th>Última señal GPS</th></tr></thead><tbody>
      ${a.buses.map(b => `<tr><td><b>${esc(b.placa)}</b></td><td>${b.capacidad}</td>
        <td><select aria-label="Estado de ${esc(b.placa)}" onchange="cambiarEstadoBus(${b.id},this.value)">${['DISPONIBLE', 'AVERIA', 'INACTIVO'].map(e => `<option value="${e}" ${b.estado === e ? 'selected' : ''}>${e === 'DISPONIBLE' ? 'Disponible' : e === 'AVERIA' ? 'Avería' : 'Inactivo'}</option>`).join('')}</select></td>
        <td>${b.ruta ? `${esc(b.ruta)}<br><small>${esc(b.conductor || '')} · ${b.recorrido_estado === 'EN_CURSO' ? 'en curso' : b.recorrido_estado === 'INTERRUMPIDO' ? 'interrumpido' : ''}</small>` : '<small>Sin recorrido</small>'}</td>
        <td>${b.ultima_posicion ? `${fechaHora(b.ultima_posicion)}<br><small>${desde(b.ultima_posicion)}</small>` : '<small>Sin datos</small>'}</td></tr>`).join('')}
      </tbody></table></div></div>`}`
  };
}
async function crearBus(ev) {
  ev.preventDefault();
  const placa = document.getElementById('nb-placa').value.trim(), capacidad = Number(document.getElementById('nb-cap').value);
  if (!placa) return toast('Escribe la placa del bus', 'err');
  try {
    await api('/admin/buses', { method: 'POST', body: { placa, capacidad } });
    await cargarAdmin('buses'); render();
    toast('Bus agregado', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
async function cambiarEstadoBus(id, estado) {
  try {
    await api(`/admin/buses/${id}`, { method: 'PATCH', body: { estado } });
    await cargarAdmin('buses'); render();
    toast('Estado del bus actualizado', 'ok');
  } catch (e) {
    toast(e.message, 'err');
    try { await cargarAdmin('buses'); render(); } catch { }
  }
}
function vistaConductoresAdmin() {
  const a = Estado.admin;
  return {
    titulo: 'Conductores', sub: 'Cuentas y recorridos asignados',
    html: `<div class="card"><details><summary>+ Agregar un conductor</summary>
      <form onsubmit="crearConductor(event)" class="col" style="margin-top:8px">
        <label>Nombre completo<input id="nc-nombre" required minlength="3"></label>
        <div class="grid2"><label>Correo<input id="nc-correo" type="email" placeholder="conductor@universidad.edu.co" required></label><label>Licencia<input id="nc-licencia" placeholder="C3-123456"></label></div>
        <label>Contraseña temporal<input id="nc-password" type="password" minlength="8" placeholder="Mínimo 8 caracteres" required></label>
        <button class="pb block" type="submit">Crear conductor</button>
      </form></details></div>
    ${!a.conductores.length ? adminCargando() : `<div class="card"><div class="row"><h2>Conductores</h2><small>${a.conductores.length} cuentas</small></div>
      <div class="tw" style="margin-top:10px"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Licencia</th><th>Recorrido</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
      ${a.conductores.map(c => `<tr><td><b>${esc(c.nombre)}</b></td><td>${esc(c.correo)}</td><td>${esc(c.licencia || '—')}</td>
        <td>${c.ruta ? `${esc(c.ruta)}<br><small>${esc(c.placa || '')} · ${c.recorrido_estado === 'EN_CURSO' ? 'en curso' : 'interrumpido'}</small>` : '<small>Sin recorrido</small>'}</td>
        <td><span class="bg ${c.activo ? '' : 'gr'}">${c.activo ? 'Activo' : 'Inactivo'}</span></td>
        <td><button class="pb sm ${c.activo ? 'ghost' : ''}" onclick="alternarConductor(${c.id},${c.activo ? 'false' : 'true'})">${c.activo ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('')}
      </tbody></table></div></div>`}`
  };
}
async function crearConductor(ev) {
  ev.preventDefault();
  const nombre = document.getElementById('nc-nombre').value.trim();
  const correo = document.getElementById('nc-correo').value.trim();
  const password = document.getElementById('nc-password').value;
  const licencia = document.getElementById('nc-licencia').value.trim();
  if (!nombre || !correo || password.length < 8) return toast('Completa nombre, correo y contraseña de mínimo 8 caracteres', 'err');
  try {
    await api('/admin/conductores', { method: 'POST', body: { nombre, correo, password, licencia } });
    await cargarAdmin('conductores'); render();
    toast('Conductor creado', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
async function alternarConductor(id, activo) {
  try {
    await api(`/admin/conductores/${id}`, { method: 'PATCH', body: { activo: !!activo } });
    await cargarAdmin('conductores'); render();
    toast(activo ? 'Conductor activado' : 'Conductor desactivado', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
function vistaAvisosAdmin() {
  const a = Estado.admin;
  return {
    titulo: 'Avisos', sub: 'Comunicados vigentes para estudiantes y conductores',
    html: `<div class="card"><h2>Publicar aviso</h2>
      <form onsubmit="crearAviso(event)" class="col" style="margin-top:9px">
        <label>Título<input id="na-titulo" placeholder="Ej.: Desvío temporal de la Ruta 2" required></label>
        <label>Mensaje<textarea id="na-mensaje" rows="3" placeholder="Explica el cambio, el motivo y hasta cuándo aplica." required></textarea></label>
        <label>Vigente hasta<input id="na-vigencia" type="datetime-local" value="${fechaInput(7)}" required></label>
        <button class="pb block" type="submit">Publicar aviso</button>
      </form></div>
    ${!a.avisos.length ? adminCargando() : `<div class="card"><div class="row"><h2>Avisos publicados</h2><small>${a.avisos.length} en total</small></div>
      <div class="tw" style="margin-top:10px"><table><thead><tr><th>Título</th><th>Mensaje</th><th>Publicado</th><th>Vigente hasta</th><th>Autor</th></tr></thead><tbody>
      ${a.avisos.map(x => `<tr><td><b>${esc(x.titulo)}</b></td><td style="min-width:220px">${esc(x.mensaje)}</td><td>${fechaHora(x.publicado_en)}</td><td>${fechaHora(x.vigente_hasta)}</td><td>${esc(x.admin || '')}</td></tr>`).join('')}
      </tbody></table></div></div>`}`
  };
}
async function crearAviso(ev) {
  ev.preventDefault();
  const titulo = document.getElementById('na-titulo').value.trim();
  const mensaje = document.getElementById('na-mensaje').value.trim();
  const vigente_hasta = document.getElementById('na-vigencia').value;
  if (!titulo || !mensaje || !vigente_hasta) return toast('Completa el título, el mensaje y la fecha de vigencia', 'err');
  if (new Date(vigente_hasta) <= new Date()) return toast('La fecha de vigencia debe ser futura', 'err');
  try {
    await api('/avisos', { method: 'POST', body: { titulo, mensaje, vigente_hasta } });
    await cargarAdmin('avisos'); render();
    toast('Aviso publicado', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
