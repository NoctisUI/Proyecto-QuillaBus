// Crea las tablas y carga datos reales de Barranquilla. Uso: npm run setup
require('dotenv').config();
const fs = require('fs'), path = require('path'), bcrypt = require('bcryptjs'), { Pool } = require('pg');

(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  await db.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  if ((await db.query('SELECT 1 FROM usuarios LIMIT 1')).rowCount) {
    console.log('La base ya tiene datos, no se cargó la demostración.');
    await db.end();
    return;
  }

  const demoPassword = process.env.DEMO_PASSWORD || 'Quilla2026!';
  if (demoPassword.length < 8) throw new Error('DEMO_PASSWORD debe tener mínimo 8 caracteres');
  const hash = await bcrypt.hash(demoPassword, 12);
  const c = await db.connect();
  try {
    await c.query('BEGIN');

    const usuarios = [
      ['Admin Demo', 'admin@universidad.edu.co', 'ADMIN', null],
      ['Conductor Demo', 'conductor@universidad.edu.co', 'CONDUCTOR', 'C3-123456'],
      ['Estudiante Demo', 'estudiante@universidad.edu.co', 'ESTUDIANTE', null]
    ];
    const userId = {};
    for (const [nombre, correo, rol, licencia] of usuarios) {
      const { rows: [u] } = await c.query(
        'INSERT INTO usuarios(nombre,correo,password_hash,rol,licencia) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [nombre, correo, hash, rol, licencia]
      );
      userId[rol] = u.id;
    }

    // Estaciones reales de Transmetro y puntos de referencia de Barranquilla.
    // Coordenadas tomadas de OpenStreetMap (estaciones y campus universitarios).
    const paradas = [
      ['Portal de Soledad', 10.907453, -74.800904],
      ['Pacho Galán', 10.915326, -74.799104],
      ['Pedro Ramayá', 10.921284, -74.799187],
      ['Joaquín Barrios Polo / Estadio Metropolitano', 10.932983, -74.799208],
      ['Buenos Aires', 10.941926, -74.799604],
      ['La Ocho', 10.946977, -74.799757],
      ['La Catorce', 10.955030, -74.796403],
      ['La Veintiuna', 10.960556, -74.793708],
      ['Atlántico', 10.968830, -74.790264],
      ['Chiquinquirá', 10.977314, -74.787806],
      ['La Arenosa', 10.982202, -74.786439],
      ['La Catedral', 10.988414, -74.788701],
      ['Alfredo Correa de Andréis', 10.990378, -74.795803],
      ['Esthercita Forero', 10.992699, -74.802656],
      ['Joe Arroyo', 10.994700, -74.807772],
      ['Universidad del Norte', 11.022090, -74.851364],
      ['Alto Prado', 11.004359, -74.812183],
      ['El Prado', 10.997799, -74.796869],
      ['Parque Cultural del Caribe', 10.985907, -74.778338],
      ['Portal de Barranquillita', 10.985600, -74.771936],
      ['Universidad del Atlántico', 11.017712, -74.874335],
      ['Gran Malecón del Río', 11.025604, -74.799319],
      ['Barrio Abajo', 10.987051, -74.783995]
    ];
    const paradaId = {};
    for (const [nombre, latitud, longitud] of paradas) {
      const { rows: [p] } = await c.query(
        'INSERT INTO paradas(nombre,latitud,longitud) VALUES($1,$2,$3) RETURNING id',
        [nombre, latitud, longitud]
      );
      paradaId[nombre] = p.id;
    }

    const rutas = [
      ['Ruta 1 · Portal de Soledad – Joe Arroyo', '#1E8F66', [
        'Portal de Soledad', 'Pacho Galán', 'Pedro Ramayá', 'Joaquín Barrios Polo / Estadio Metropolitano',
        'Buenos Aires', 'La Ocho', 'La Catorce', 'La Veintiuna', 'Atlántico', 'Chiquinquirá',
        'La Arenosa', 'La Catedral', 'Alfredo Correa de Andréis', 'Esthercita Forero', 'Joe Arroyo'
      ]],
      ['Ruta 2 · Uninorte – Centro', '#2E86C1', [
        'Universidad del Norte', 'Alto Prado', 'El Prado', 'La Catedral',
        'Parque Cultural del Caribe', 'Portal de Barranquillita'
      ]],
      ['Ruta 3 · Uniatlántico – Gran Malecón', '#E67E22', [
        'Universidad del Atlántico', 'Gran Malecón del Río', 'Joe Arroyo', 'Esthercita Forero',
        'La Catedral', 'Barrio Abajo', 'Parque Cultural del Caribe', 'Portal de Barranquillita'
      ]]
    ];
    let ruta1 = null;
    for (const [nombre, color, nombresParadas] of rutas) {
      const { rows: [r] } = await c.query(
        'INSERT INTO rutas(nombre,color) VALUES($1,$2) RETURNING id', [nombre, color]
      );
      if (!ruta1) ruta1 = r.id;
      for (const [i, nombreParada] of nombresParadas.entries()) {
        await c.query(
          'INSERT INTO ruta_parada(ruta_id,parada_id,orden,minutos_desde_inicio) VALUES($1,$2,$3,$4)',
          [r.id, paradaId[nombreParada], i + 1, i * 3]
        );
      }
    }

    for (const [placa, capacidad] of [['QB-014', 40], ['QB-021', 40], ['QB-033', 40]]) {
      await c.query('INSERT INTO buses(placa,capacidad) VALUES($1,$2)', [placa, capacidad]);
    }

    await c.query(
      `INSERT INTO avisos(admin_id,titulo,mensaje,vigente_hasta) VALUES
       ($1,$2,$3,now() + interval '7 days'),
       ($1,$4,$5,now() + interval '30 days'),
       ($1,$6,$7,now() + interval '14 days')`,
      [
        userId.ADMIN,
        'Desvío temporal de la Ruta 2',
        'Por obras en la Carrera 54, la Ruta 2 desvía por la Calle 72 hasta el viernes. Las paradas se mantienen.',
        'Nuevo horario de la Ruta 1',
        'La Ruta 1 sale cada 10 minutos entre 6:00 y 20:00 durante el semestre.',
        'Estaciones habilitadas en el Centro',
        'La Catedral, Alfredo Correa de Andréis y Esthercita Forero están operando con normalidad.'
      ]
    );

    // Un par de favoritos para que la cuenta de estudiante arranque con contenido útil.
    await c.query('INSERT INTO favoritos(usuario_id,ruta_id) VALUES($1,$2)', [userId.ESTUDIANTE, ruta1]);
    await c.query('INSERT INTO favoritos(usuario_id,parada_id) VALUES($1,$2)', [userId.ESTUDIANTE, paradaId['La Catedral']]);

    await c.query('COMMIT');
    console.log('Listo. Base con paradas reales de Barranquilla y 3 rutas.');
    console.log('Usuarios demo: admin@universidad.edu.co, conductor@universidad.edu.co, estudiante@universidad.edu.co');
    console.log(process.env.NODE_ENV === 'production' ? 'La clave demo es el valor configurado en DEMO_PASSWORD.' : `Clave demo local: ${demoPassword}`);
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
    await db.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
