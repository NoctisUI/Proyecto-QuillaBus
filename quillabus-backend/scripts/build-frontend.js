// Une las partes de frontend/ en un único public/quillabus.html.
const fs = require('fs'), path = require('path');
const origen = path.join(__dirname, '..', 'frontend');
const destino = path.join(__dirname, '..', 'public', 'quillabus.html');
const partes = fs.readdirSync(origen)
  .filter(f => /^\d{2}-.+\.(html|js)$/.test(f))
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
if (!partes.length) {
  console.error('No hay partes en frontend/.');
  process.exit(1);
}
const html = partes.map(f => fs.readFileSync(path.join(origen, f), 'utf8').replace(/\r\n/g, '\n')).join('\n');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, html, 'utf8');
console.log(`quillabus.html generado (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB) desde ${partes.length} partes.`);
