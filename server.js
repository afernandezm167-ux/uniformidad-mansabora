// Servidor: node server.js  ->  http://localhost:3000
// Guarda los datos en una base de datos SQLite (uniformidad.db, dentro del proyecto)
// y es accesible desde otros dispositivos de la misma red (móvil).
// Usa el módulo SQLite incluido en Node (22.5 o superior): no hay que instalar nada.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const VIEJO = path.join(__dirname, 'data.json'); // formato anterior, solo se usa para importar
const PRIVADOS = ['server.js', 'package.json', 'data.json'];
const PRIVADAS_EXT = ['.db', '.db-wal', '.db-shm', '.db-journal'];
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// ---------- Base de datos ----------
const db = new DatabaseSync(path.join(__dirname, 'uniformidad.db'));
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS meta (clave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE IF NOT EXISTS stock (
    producto TEXT, talla TEXT, cantidad INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (producto, talla));
  CREATE TABLE IF NOT EXISTS personas (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, orden INTEGER);
  CREATE TABLE IF NOT EXISTS entregas (
    id TEXT PRIMARY KEY, persona_id TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    producto TEXT, talla TEXT, cantidad INTEGER, pagado INTEGER, entregado INTEGER, descontado INTEGER, orden INTEGER);
  CREATE TABLE IF NOT EXISTS camisas (
    id TEXT PRIMARY KEY, nombre TEXT NOT NULL, talla TEXT, seccion TEXT, metodo TEXT, pagado INTEGER, orden INTEGER);
`);
// Bases de datos anteriores: añade la columna "entregado" a camisas
if (!db.prepare('PRAGMA table_info(camisas)').all().some(c => c.name === 'entregado')) {
  db.exec('ALTER TABLE camisas ADD COLUMN entregado INTEGER NOT NULL DEFAULT 0');
}

if (!db.prepare('PRAGMA table_info(camisas)').all().some(c => c.name === 'insignias')) {
  db.exec('ALTER TABLE camisas ADD COLUMN insignias INTEGER NOT NULL DEFAULT 0');
}

const hayDatos =() => !!db.prepare("SELECT 1 FROM meta WHERE clave = 'inicializado'").get();

// Sustituye todo el contenido por el estado recibido, en una sola transacción
function guardarEstado(e) {
  db.exec('BEGIN');
  try {
    for (const t of ['entregas', 'personas', 'stock', 'camisas']) db.exec(`DELETE FROM ${t}`);
    const insStock = db.prepare('INSERT INTO stock VALUES (?, ?, ?)');
    for (const [p, tallas] of Object.entries(e.stock || {})) {
      for (const [t, n] of Object.entries(tallas)) insStock.run(p, t, Number(n) || 0);
    }
    const insPer = db.prepare('INSERT INTO personas VALUES (?, ?, ?)');
    const insEn = db.prepare('INSERT INTO entregas VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    (e.personas || []).forEach((per, i) => {
      insPer.run(per.id, per.nombre, i);
      (per.entregas || []).forEach((en, j) => insEn.run(en.id, per.id, en.producto, en.talla, en.cantidad,
        en.pagado ? 1 : 0, en.entregado === false ? 0 : 1, en.descontado === undefined ? null : en.descontado, j));
    });
    const insCam = db.prepare('INSERT INTO camisas (id, nombre, talla, seccion, metodo, pagado, orden, entregado, insignias) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    (e.camisas || []).forEach((c, i) => insCam.run(c.id, c.nombre, c.talla, c.seccion, c.metodo, c.pagado ? 1 : 0, i, c.entregado ? 1 : 0,
      Math.min(3, Math.max(0, parseInt(c.insignias, 10) || 0))));
    db.prepare("INSERT OR REPLACE INTO meta VALUES ('inicializado', '1')").run();
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
}

function leerEstado() {
  const stock = {};
  for (const r of db.prepare('SELECT * FROM stock').all()) (stock[r.producto] = stock[r.producto] || {})[r.talla] = r.cantidad;
  const entregas = db.prepare('SELECT * FROM entregas ORDER BY orden').all();
  const personas = db.prepare('SELECT * FROM personas ORDER BY orden').all().map(p => ({
    id: p.id, nombre: p.nombre,
    entregas: entregas.filter(en => en.persona_id === p.id).map(en => {
      const o = { id: en.id, producto: en.producto, talla: en.talla, cantidad: en.cantidad, pagado: !!en.pagado, entregado: !!en.entregado };
      if (en.descontado !== null) o.descontado = en.descontado;
      return o;
    }),
  }));
  const camisas = db.prepare('SELECT * FROM camisas ORDER BY orden').all().map(c => ({
    id: c.id, nombre: c.nombre, talla: c.talla, seccion: c.seccion, metodo: c.metodo, pagado: !!c.pagado, entregado: !!c.entregado, insignias: c.insignias || 0 }));
  return { stock, personas, camisas };
}

// Primera vez: si existe el data.json de la versión anterior, se importa a la base de datos
if (!hayDatos() && fs.existsSync(VIEJO)) {
  try {
    guardarEstado(JSON.parse(fs.readFileSync(VIEJO, 'utf8')));
    console.log('Datos de data.json importados a uniformidad.db');
  } catch (e) { console.error('No se pudo importar data.json:', e.message); }
}

// ---------- API ----------
function api(req, res) {
  if (req.method === 'GET') {
    if (!hayDatos()) { res.writeHead(204); return res.end(); } // todavía no hay datos
    res.writeHead(200, { 'Content-Type': TIPOS['.json'], 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(leerEstado()));
  }
  if (req.method === 'PUT') {
    let cuerpo = '';
    req.on('data', c => {
      cuerpo += c;
      if (cuerpo.length > 5e6) req.destroy();
    });
    return req.on('end', () => {
      let datos;
      try { datos = JSON.parse(cuerpo); } catch (e) { res.writeHead(400); return res.end('JSON no válido'); }
      try { guardarEstado(datos); res.writeHead(204); } catch (e) { console.error(e.message); res.writeHead(500); }
      res.end();
    });
  }
  res.writeHead(405); res.end();
}

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/api/datos') return api(req, res);

  const file = path.join(__dirname, url === '/' ? 'index.html' : url);
  if (!file.startsWith(__dirname) || PRIVADOS.includes(path.basename(file)) || PRIVADAS_EXT.includes(path.extname(file))) {
    res.writeHead(403); return res.end('Prohibido');
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log('\nUniformidad en marcha');
  console.log(`  En este ordenador:  http://localhost:${PORT}`);
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista) {
      if (i.family === 'IPv4' && !i.internal) console.log(`  Desde el móvil:     http://${i.address}:${PORT}`);
    }
  }
  console.log('\nLos datos se guardan en uniformidad.db\n');
});
