const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: 'postgres://postgres@127.0.0.1:5432/postgres' });
  await c.connect();
  const r = await c.query("SELECT 1 FROM pg_database WHERE datname='quillabus'");
  if (!r.rowCount) {
    await c.query('CREATE DATABASE quillabus');
    console.log('Base quillabus creada');
  } else {
    console.log('La base quillabus ya existe');
  }
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
