const CLAVE = 'uniformidad-v1';
const TALLAS = ['6', '8', '10', '12', '14', 'XS', 'S', 'M', 'L', 'XL', '2XL'];
const PARES = { '5-6': '6', '7-8': '8', '9-10': '10', '11-12': '12' };
const PRODUCTOS = {
  camiseta: { nombre: 'Camisetas', singular: 'camiseta', tallas: TALLAS },
  sudadera: { nombre: 'Sudaderas', singular: 'sudadera', tallas: TALLAS },
  panoleta: { nombre: 'Pañoletas', singular: 'pañoleta', tallas: ['Pequeña', 'Grande'] },
};
const BAJO = 3; // por debajo de este stock se avisa

const ICONOS = {
  camiseta: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 3 3 6l2 4.5 3-1.4V21h8V9.1l3 1.4L21 6l-5.5-3c-.4 1.7-1.7 2.8-3.5 2.8S8.9 4.7 8.5 3z"/></svg>',
  sudadera: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 2.5 4 5 2 19l4 .5L7 11v10h10V11l1 8.500 4-.5L20 5l-5-2.500C14.700 4.500 13.500 6 12 6S9.300 4.500 9 2.500z"/></svg>',
  panoleta: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h18l-1.500 5.500L13.200 20.300a1.400 1.400 0 0 1-2.400 0L4.500 9.500z"/></svg>',
};
const ICO_VACIO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>';
const ICO_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

let estado = cargar();
let busqueda = '';
let filtro = 'todas'; // todas | pendientes | pagadas

function vacio() {
  const stock = {};
  for (const [p, d] of Object.entries(PRODUCTOS)) {
    stock[p] = {};
    d.tallas.forEach(t => (stock[p][t] = 0));
  }
  return { stock, personas: [], camisas: [] };
}

// Adapta datos antiguos: 13-14 pasa a XS y se rellenan las tallas que falten
function migrar(datos) {
  const base = vacio();
  const e = { ...base, ...datos };
  if (!Array.isArray(e.camisas)) e.camisas = [];
  for (const [p, d] of Object.entries(PRODUCTOS)) {
    const s = (e.stock[p] = e.stock[p] || {});
    if ('13-14' in s) { s.XS = (s.XS || 0) + s['13-14']; delete s['13-14']; }
    // Las tallas por rango pasan a su número par: 5-6 → 6, 7-8 → 8...
    for (const [viejo, nuevo] of Object.entries(PARES)) {
      if (viejo in s) { s[nuevo] = (s[nuevo] || 0) + s[viejo]; delete s[viejo]; }
    }
    d.tallas.forEach(t => (s[t] = s[t] || 0));
  }
  const par = t => (t === '13-14' ? 'XS' : PARES[t] || t);
  e.personas.forEach(per => per.entregas.forEach(en => { en.talla = par(en.talla); }));
  e.camisas.forEach(c => { c.talla = par(c.talla); c.insignias = Math.min(3, Math.max(0, parseInt(c.insignias, 10) || 0)); });
  return e;
}

function cargar() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE));
    if (guardado) return migrar(guardado);
  } catch (e) {}
  return vacio();
}

let ultimoTexto = ''; // última versión conocida en el servidor

// Se guarda en el servidor (data.json) y, como copia, en el navegador
function guardar() {
  const texto = JSON.stringify(estado);
  ultimoTexto = texto;
  try { localStorage.setItem(CLAVE, texto); } catch (e) {}
  fetch('/api/datos', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: texto }).catch(() => {});
}

// Trae los datos del servidor al abrir y cada pocos segundos (para ver los cambios hechos desde otro dispositivo)
async function sincronizar(inicial) {
  try {
    const r = await fetch('/api/datos', { cache: 'no-store' });
    if (r.status === 204) { if (inicial) guardar(); return; } // servidor vacío: sube lo que haya aquí
    if (!r.ok) return;
    const texto = await r.text();
    if (texto === ultimoTexto) return;
    const a = document.activeElement;
    if (!inicial && a && a.matches('input, select')) return; // no molestar mientras se escribe
    ultimoTexto = texto;
    estado = migrar(JSON.parse(texto));
    try { localStorage.setItem(CLAVE, texto); } catch (e) {}
    pintarStock();
    pintarPersonas();
    pintarCamisas();
  } catch (e) {} // sin servidor (p. ej. Live Server) se sigue usando solo el navegador
}

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let temporizador;
function aviso(texto) {
  const t = $('#toast');
  t.textContent = texto;
  t.classList.add('visible');
  clearTimeout(temporizador);
  temporizador = setTimeout(() => t.classList.remove('visible'), 2200);
}

function refrescar() {
  guardar();
  pintarStock();
  pintarPersonas();
  pintarCamisas();
}

// ---------- Navegación ----------
const TITULOS = {
  stock: ['Inventario', 'Existencias de camisetas, sudaderas y pañoletas'],
  personas: ['Personas y entregas', 'Qué se ha dado a cada persona y si lo ha pagado'],
  camisas: ['Camisas', 'Pedidos por niño: se encargan según pedido, sin stock'],
};
document.querySelectorAll('.nav').forEach(b =>
  b.addEventListener('click', () => {
    const tab = b.dataset.tab;
    document.querySelectorAll('.nav').forEach(x => x.classList.toggle('activa', x === b));
    document.querySelectorAll('.panel').forEach(p => (p.hidden = p.id !== tab));
    $('#titulo').textContent = TITULOS[tab][0];
    $('#subtitulo').textContent = TITULOS[tab][1];
  })
);
$('#fecha').textContent = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

// ---------- Stock ----------
const totalDe = p => PRODUCTOS[p].tallas.reduce((s, t) => s + (estado.stock[p][t] || 0), 0);
const agotadasDe = p => PRODUCTOS[p].tallas.filter(t => !estado.stock[p][t]).length;
const entregada = en => en.entregado !== false;
// Unidades que hay que devolver al stock al quitar una entrega (las antiguas no guardaban el dato)
const devuelve = en => (en.descontado === undefined ? en.cantidad : en.descontado);
// Unidades apuntadas que todavía no se han podido dar, por producto y talla
function porDar(p, t) {
  return estado.personas.flatMap(x => x.entregas)
    .filter(en => !entregada(en) && en.producto === p && en.talla === t)
    .reduce((s, en) => s + en.cantidad, 0);
}
const etiquetaFaltan = (p, t) => {
  const f = porDar(p, t);
  return f ? `<span class="faltan">${f} por dar</span>` : '';
};
const nivel = n => (n === 0 ? 'cero' : n < BAJO ? 'bajo' : '');
const textoNivel = n => (n === 0 ? 'Agotado' : n < BAJO ? 'Stock bajo' : 'Disponible');

function stepper(p, t, n) {
  return `<div class="cant">
    <button data-p="${p}" data-t="${esc(t)}" data-d="-1" aria-label="Quitar uno">−</button>
    <input type="number" min="0" value="${n}" data-p="${p}" data-t="${esc(t)}" aria-label="${PRODUCTOS[p].nombre} talla ${esc(t)}">
    <button data-p="${p}" data-t="${esc(t)}" data-d="1" aria-label="Añadir uno">+</button>
  </div>`;
}

function pintarStock() {
  const entregas = estado.personas.flatMap(x => x.entregas);
  const sinPagar = entregas.filter(e => !e.pagado).length;

  const kpis = Object.entries(PRODUCTOS).map(([p, d]) => {
    const ag = agotadasDe(p);
    return `<div class="kpi ${p}">
      <div class="kpi-cab">${d.nombre}<div class="icono">${ICONOS[p]}</div></div>
      <div class="valor">${totalDe(p)}</div>
      <div class="detalle">${ag ? `<b>${ag} ${ag > 1 ? 'tallas agotadas' : 'talla agotada'}</b>` : 'Todas las tallas con stock'}</div>
    </div>`;
  }).join('') + `<div class="kpi deuda">
      <div class="kpi-cab">Pendiente de pago
        <div class="icono"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div></div>
      <div class="valor">${sinPagar}</div>
      <div class="detalle">de ${entregas.length} ${entregas.length === 1 ? 'entrega' : 'entregas'} realizadas</div>
    </div>`;

  const max = Math.max(12, ...['camiseta', 'sudadera'].flatMap(p => TALLAS.map(t => estado.stock[p][t] || 0)));
  const celda = (p, t) => {
    const n = estado.stock[p][t] || 0;
    return `<td><div class="celda ${p} ${nivel(n)}">
      ${stepper(p, t, n)}
      <div class="etiquetas"><span class="estado ${nivel(n)}">${textoNivel(n)}</span>${etiquetaFaltan(p, t)}</div>
      <div class="barra"><i style="width:${Math.min(100, (n / max) * 100)}%"></i></div>
    </div></td>`;
  };
  const cabecera = p => `<th><div class="th ${p}"><div class="icono">${ICONOS[p]}</div>${PRODUCTOS[p].nombre}<em>${totalDe(p)} uds.</em></div></th>`;

  const tabla = `<div class="caja">
    <div class="caja-cab">
      <div><h2>Camisetas y sudaderas</h2><p>Existencias por talla, de la 6 a la 2XL</p></div>
      <div class="leyenda"><span><i class="punto"></i>Disponible</span><span><i class="punto bajo"></i>Menos de ${BAJO}</span><span><i class="punto cero"></i>Agotado</span></div>
    </div>
    <table>
      <thead><tr><th>Talla</th>${cabecera('camiseta')}${cabecera('sudadera')}</tr></thead>
      <tbody>${TALLAS.map(t => `<tr><td class="talla"><span class="pastilla-talla">${esc(t)}</span></td>${celda('camiseta', t)}${celda('sudadera', t)}</tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td class="num">${totalDe('camiseta')} camisetas</td><td class="num">${totalDe('sudadera')} sudaderas</td></tr></tfoot>
    </table>
  </div>`;

  const panoletas = `<div class="caja">
    <div class="caja-cab"><div><h2>Pañoletas</h2><p>Tamaño pequeño y grande</p></div></div>
    <div class="panoletas">${PRODUCTOS.panoleta.tallas.map(t => {
      const n = estado.stock.panoleta[t] || 0;
      return `<div class="pano panoleta">
        <div class="icono">${ICONOS.panoleta}</div>
        <div class="datos"><b>${t === 'Pequeña' ? 'Pequeñas' : 'Grandes'}</b><div class="etiquetas"><span class="estado ${nivel(n)}">${textoNivel(n)}</span>${etiquetaFaltan('panoleta', t)}</div></div>
        <div class="grande">${n}</div>
        ${stepper('panoleta', t, n)}
      </div>`;
    }).join('')}</div>
  </div>`;

  // El foco se conserva si se está escribiendo en un campo
  const activo = document.activeElement;
  const clave = activo && activo.matches('#stock-contenido input') ? [activo.dataset.p, activo.dataset.t] : null;
  $('#stock-contenido').innerHTML = `<div class="kpis">${kpis}</div>${tabla}${panoletas}`;
  if (clave) {
    const i = [...document.querySelectorAll('#stock-contenido input')].find(x => x.dataset.p === clave[0] && x.dataset.t === clave[1]);
    if (i) i.focus();
  }
}

$('#stock-contenido').addEventListener('click', e => {
  const b = e.target.closest('button[data-d]');
  if (!b) return;
  const { p, t, d } = b.dataset;
  estado.stock[p][t] = Math.max(0, (estado.stock[p][t] || 0) + Number(d));
  refrescar();
});

$('#stock-contenido').addEventListener('change', e => {
  const i = e.target.closest('input[data-p]');
  if (!i) return;
  estado.stock[i.dataset.p][i.dataset.t] = Math.max(0, parseInt(i.value, 10) || 0);
  refrescar();
  aviso('Stock actualizado');
});

// ---------- Personas ----------
function pintarFiltros() {
  const todas = estado.personas;
  const pend = todas.filter(p => p.entregas.some(e => !e.pagado)).length;
  const faltan = todas.filter(p => p.entregas.some(e => !entregada(e))).length;
  const opciones = [['todas', 'Todas', todas.length], ['pendientes', 'Sin pagar', pend], ['pordar', 'Por entregar', faltan], ['pagadas', 'Pagado', todas.length - pend]];
  $('#filtros').innerHTML = opciones.map(([k, n, c]) =>
    `<button class="filtro ${filtro === k ? 'activo' : ''}" data-filtro="${k}">${n}<small>${c}</small></button>`).join('');
}

function pintarPersonas() {
  $('#contador-personas').textContent = estado.personas.length;
  pintarFiltros();

  const q = busqueda.trim().toLowerCase();
  const lista = estado.personas.filter(p => {
    if (q && !p.nombre.toLowerCase().includes(q)) return false;
    const debe = p.entregas.some(e => !e.pagado);
    if (filtro === 'pordar') return p.entregas.some(e => !entregada(e));
    if (filtro === 'pendientes') return debe;
    if (filtro === 'pagadas') return !debe;
    return true;
  });

  if (!lista.length) {
    $('#lista-personas').innerHTML = `<div class="vacio">${ICO_VACIO}
      <b>${estado.personas.length ? 'Sin resultados' : 'Todavía no hay personas'}</b>
      ${estado.personas.length ? 'Prueba con otra búsqueda o filtro.' : 'Añade la primera persona con el formulario de arriba.'}</div>`;
    return;
  }

  // Se conserva lo que se está escribiendo en los formularios de entrega
  const borradores = {};
  document.querySelectorAll('form.nueva').forEach(f => {
    borradores[f.dataset.persona] = { producto: f.elements.producto.value, talla: f.elements.talla.value, cantidad: f.elements.cantidad.value, pagado: f.elements.pagado.checked };
  });

  $('#lista-personas').innerHTML = lista.map(per => {
    const debe = per.entregas.filter(e => !e.pagado).length;
    const unidades = per.entregas.filter(entregada).reduce((s, e) => s + e.cantidad, 0);
    const faltan = per.entregas.filter(e => !entregada(e)).length;
    const insignia = (faltan ? `<span class="insignia aviso">${faltan} por entregar</span>` : '') +
      (!per.entregas.length ? '<span class="insignia nada">Sin entregas</span>' :
        debe ? `<span class="insignia mal">${debe} sin pagar</span>` : '<span class="insignia ok">Todo pagado</span>');
    const color = ['camiseta', 'sudadera', 'panoleta'][[...per.nombre].reduce((s, c) => s + c.charCodeAt(0), 0) % 3];

    const entregas = per.entregas.length ? `<div class="entregas">${per.entregas.map(en => `
      <div class="entrega ${en.producto}">
        <div class="icono">${ICONOS[en.producto]}</div>
        <span class="desc">${en.cantidad} × ${PRODUCTOS[en.producto].singular}<small>${en.producto === 'panoleta' ? 'tamaño' : 'talla'} ${esc(en.talla)}</small>${entregada(en) ? '' : '<span class="por-dar">Por entregar · sin stock</span>'}</span>
        ${entregada(en) ? '' : `<button class="entregar" data-accion="entregar" data-persona="${per.id}" data-entrega="${en.id}">Entregar ahora</button>`}
        <label class="interruptor">
          <input type="checkbox" data-accion="pagar" data-persona="${per.id}" data-entrega="${en.id}" ${en.pagado ? 'checked' : ''}>
          <span class="caja-check">${ICO_CHECK}</span>${en.pagado ? 'Pagado' : 'Pendiente'}
        </label>
        <button class="quitar" data-accion="quitar-entrega" data-persona="${per.id}" data-entrega="${en.id}" title="Quitar y devolver al stock" aria-label="Quitar entrega">✕</button>
      </div>`).join('')}</div>` : '<div class="sin-entregas">Todavía no se le ha dado nada.</div>';

    return `<article class="persona">
      <div class="persona-cab ${color}">
        <div class="avatar">${esc([...per.nombre.trim()][0].toUpperCase())}</div>
        <div class="quien"><h3>${esc(per.nombre)}</h3><div class="sub">${unidades} ${unidades === 1 ? 'artículo' : 'artículos'}</div></div>
        ${insignia}
        <button class="texto-boton" data-accion="borrar-persona" data-persona="${per.id}">Eliminar</button>
      </div>
      ${entregas}
      <form class="nueva" data-persona="${per.id}">
        <select name="producto">${Object.entries(PRODUCTOS).map(([k, v]) => `<option value="${k}">${v.singular[0].toUpperCase() + v.singular.slice(1)}</option>`).join('')}</select>
        <select name="talla"></select>
        <input type="number" name="cantidad" min="1" value="1" aria-label="Cantidad">
        <label><input type="checkbox" name="pagado"> Ya ha pagado</label>
        <button class="primario" data-modo="dar">Dar</button>
        <button class="secundario" data-modo="pendiente" title="Apuntarlo para dárselo cuando haya stock">Apuntar por entregar</button>
      </form>
    </article>`;
  }).join('');

  document.querySelectorAll('form.nueva').forEach(f => {
    const b = borradores[f.dataset.persona];
    if (b) { f.elements.producto.value = b.producto; f.elements.cantidad.value = b.cantidad; f.elements.pagado.checked = b.pagado; }
    rellenarTallas(f, b && b.talla);
  });
}

function rellenarTallas(form, elegida) {
  const prod = form.elements.producto.value;
  form.elements.talla.innerHTML = PRODUCTOS[prod].tallas
    .map(t => `<option value="${esc(t)}">${esc(t)} · quedan ${estado.stock[prod][t] || 0}</option>`).join('');
  if (elegida) form.elements.talla.value = elegida;
}

$('#lista-personas').addEventListener('change', e => {
  const f = e.target.closest('form.nueva');
  if (f && e.target.name === 'producto') return rellenarTallas(f);
  if (e.target.dataset.accion === 'pagar') {
    const per = estado.personas.find(p => p.id === e.target.dataset.persona);
    per.entregas.find(x => x.id === e.target.dataset.entrega).pagado = e.target.checked;
    refrescar();
    aviso(e.target.checked ? 'Marcado como pagado' : 'Marcado como pendiente');
  }
});

$('#lista-personas').addEventListener('click', e => {
  const b = e.target.closest('button[data-accion]');
  if (!b) return;
  const per = estado.personas.find(p => p.id === b.dataset.persona);
  if (b.dataset.accion === 'borrar-persona') {
    if (!confirm(`¿Eliminar a ${per.nombre}? Lo que tenga asignado se devolverá al stock.`)) return;
    per.entregas.filter(entregada).forEach(en => (estado.stock[en.producto][en.talla] += devuelve(en)));
    estado.personas = estado.personas.filter(p => p !== per);
    aviso('Persona eliminada');
  } else if (b.dataset.accion === 'quitar-entrega') {
    const en = per.entregas.find(x => x.id === b.dataset.entrega);
    if (entregada(en)) estado.stock[en.producto][en.talla] += devuelve(en);
    per.entregas = per.entregas.filter(x => x !== en);
    aviso(entregada(en) ? 'Devuelto al stock' : 'Eliminado de la lista');
  } else if (b.dataset.accion === 'entregar') {
    const en = per.entregas.find(x => x.id === b.dataset.entrega);
    const disponible = estado.stock[en.producto][en.talla] || 0;
    en.descontado = Math.min(en.cantidad, disponible);
    estado.stock[en.producto][en.talla] = disponible - en.descontado;
    en.entregado = true;
    aviso('Entregado');
  }
  refrescar();
});

$('#lista-personas').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  const per = estado.personas.find(p => p.id === f.dataset.persona);
  const producto = f.elements.producto.value;
  const talla = f.elements.talla.value;
  const cantidad = Math.max(1, parseInt(f.elements.cantidad.value, 10) || 1);
  const disponible = estado.stock[producto][talla] || 0;
  const pagado = f.elements.pagado.checked;
  // `descontado` es lo que realmente salió del stock, para devolver lo mismo si se quita
  const nueva = (entregado, descontado = 0) => per.entregas.push({ id: id(), producto, talla, cantidad, pagado, entregado, descontado });

  if (e.submitter && e.submitter.dataset.modo === 'pendiente') {
    nueva(false);
    aviso('Apuntado para entregar más adelante');
  } else {
    // Se puede entregar aunque no haya stock: el stock llega como mucho a 0
    const descontado = Math.min(cantidad, disponible);
    estado.stock[producto][talla] = disponible - descontado;
    nueva(true, descontado);
    aviso(descontado < cantidad ? 'Entregado (sin stock suficiente)' : 'Entrega guardada');
  }
  f.reset();
  refrescar();
});

$('#form-persona').addEventListener('submit', e => {
  e.preventDefault();
  const nombre = $('#nombre').value.trim();
  if (!nombre) return;
  estado.personas.unshift({ id: id(), nombre, entregas: [] });
  $('#nombre').value = '';
  refrescar();
  aviso('Persona añadida');
});

$('#buscar').addEventListener('input', e => { busqueda = e.target.value; pintarPersonas(); });
$('#filtros').addEventListener('click', e => {
  const b = e.target.closest('[data-filtro]');
  if (!b) return;
  filtro = b.dataset.filtro;
  pintarPersonas();
});

// ---------- Camisas (por pedido, sin stock) ----------
const METODOS = ['Efectivo', 'Bizum', 'Transferencia', 'Tarjeta'];
let cBusqueda = '';
let cFiltro = 'todos'; // todos | sinpagar | pagados

$('#c-talla').innerHTML = TALLAS.map(t => `<option>${esc(t)}</option>`).join('');
$('#c-metodo').innerHTML = METODOS.map(m => `<option>${m}</option>`).join('');

function pintarCamisas() {
  const todas = estado.camisas;
  $('#contador-camisas').textContent = todas.length;
  const sinPagar = todas.filter(c => !c.pagado).length;
  const opciones = [['todos', 'Todos', todas.length], ['sinpagar', 'Sin pagar', sinPagar], ['pagados', 'Pagado', todas.length - sinPagar],
    ['porentregar', 'Por entregar', todas.filter(c => !c.entregado).length], ['entregados', 'Entregado', todas.filter(c => c.entregado).length]];
  $('#c-filtros').innerHTML = opciones.map(([k, n, c]) =>
    `<button class="filtro ${cFiltro === k ? 'activo' : ''}" data-filtro="${k}">${n}<small>${c}</small></button>`).join('');

  const q = cBusqueda.trim().toLowerCase();
  const lista = todas.filter(c => {
    if (q && !(c.nombre.toLowerCase().includes(q) || c.seccion.toLowerCase().includes(q))) return false;
    if (cFiltro === 'sinpagar') return !c.pagado;
    if (cFiltro === 'pagados') return c.pagado;
    if (cFiltro === 'porentregar') return !c.entregado;
    if (cFiltro === 'entregados') return c.entregado;
    return true;
  });

  if (!lista.length) {
    $('#lista-camisas').innerHTML = `<div class="vacio">${ICO_VACIO}
      <b>${todas.length ? 'Sin resultados' : 'Todavía no hay pedidos de camisa'}</b>
      ${todas.length ? 'Prueba con otra búsqueda o filtro.' : 'Añade el primero con el formulario de arriba.'}</div>`;
    return;
  }

  $('#lista-camisas').innerHTML = `<div class="caja"><table class="tabla-camisas">
    <thead><tr><th>Niño/a</th><th>Talla</th><th>Sección</th><th>Método de pago</th><th>Pago</th><th>Entrega</th><th>Insignias</th><th></th></tr></thead>
    <tbody>${lista.map(c => `<tr>
      <td><b>${esc(c.nombre)}</b></td>
      <td><span class="pastilla-talla">${esc(c.talla)}</span></td>
      <td>${esc(c.seccion)}</td>
      <td>${esc(c.metodo)}</td>
      <td><label class="interruptor">
        <input type="checkbox" data-camisa="${c.id}" ${c.pagado ? 'checked' : ''}>
        <span class="caja-check">${ICO_CHECK}</span>${c.pagado ? 'Pagado' : 'Pendiente'}
      </label></td>
      <td><label class="interruptor">
        <input type="checkbox" data-camisa-entregada="${c.id}" ${c.entregado ? 'checked' : ''}>
        <span class="caja-check">${ICO_CHECK}</span>${c.entregado ? 'Entregado' : 'Por entregar'}
      </label></td>
      <td><div class="insignias">${[1, 2, 3].map(n => `<label class="ins ${c.insignias >= n ? 'on' : ''}" title="${n}ª insignia${n > 1 && c.insignias < n - 1 ? ' (necesita la ' + (n - 1) + 'ª)' : ''}">
        <input type="checkbox" data-insignia="${n}" data-camisa-ins="${c.id}" ${c.insignias >= n ? 'checked' : ''} ${c.insignias < n - 1 ? 'disabled' : ''}>${n}ª
      </label>`).join('')}</div></td>
      <td><button class="quitar" data-quitar-camisa="${c.id}" title="Eliminar pedido" aria-label="Eliminar pedido">✕</button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

$('#form-camisa').addEventListener('submit', e => {
  e.preventDefault();
  const nombre = $('#c-nombre').value.trim();
  const seccion = $('#c-seccion').value.trim();
  if (!nombre || !seccion) return;
  estado.camisas.unshift({ id: id(), nombre, talla: $('#c-talla').value, seccion, metodo: $('#c-metodo').value, pagado: $('#c-pagado').checked, entregado: false, insignias: 0 });
  $('#c-nombre').value = '';
  $('#c-pagado').checked = false;
  refrescar();
  aviso('Pedido añadido');
});

$('#lista-camisas').addEventListener('change', e => {
  if (e.target.dataset.camisaIns) {
    const cam = estado.camisas.find(x => x.id === e.target.dataset.camisaIns);
    const n = Number(e.target.dataset.insignia);
    if (!cam) return;
    // Marcar la n-ésima implica tener las anteriores; desmarcarla quita también las siguientes
    cam.insignias = e.target.checked ? n : n - 1;
    refrescar();
    return aviso(`${cam.insignias} ${cam.insignias === 1 ? 'insignia' : 'insignias'}`);
  }
  const ent = estado.camisas.find(x => x.id === e.target.dataset.camisaEntregada);
  if (ent) {
    ent.entregado = e.target.checked;
    refrescar();
    return aviso(ent.entregado ? 'Marcada como entregada' : 'Marcada como por entregar');
  }
  const c = estado.camisas.find(x => x.id === e.target.dataset.camisa);
  if (!c) return;
  c.pagado = e.target.checked;
  refrescar();
  aviso(c.pagado ? 'Marcado como pagado' : 'Marcado como pendiente');
});

$('#lista-camisas').addEventListener('click', e => {
  const b = e.target.closest('[data-quitar-camisa]');
  if (!b) return;
  const c = estado.camisas.find(x => x.id === b.dataset.quitarCamisa);
  if (!c || !confirm(`¿Eliminar el pedido de ${c.nombre}?`)) return;
  estado.camisas = estado.camisas.filter(x => x !== c);
  refrescar();
  aviso('Pedido eliminado');
});

$('#c-buscar').addEventListener('input', e => { cBusqueda = e.target.value; pintarCamisas(); });
$('#c-filtros').addEventListener('click', e => {
  const b = e.target.closest('[data-filtro]');
  if (!b) return;
  cFiltro = b.dataset.filtro;
  pintarCamisas();
});

// ---------- Excel ----------
const ANCHOS = { Stock: [14, 10, 10, 13, 12], Entregas: [26, 14, 10, 10, 15, 12], Personas: [26, 20, 14, 12], Camisas: [26, 10, 16, 16, 12, 14, 10] };

// Las mismas tablas sirven para el Excel y para Google Sheets
function tablas() {
  const stock = [['Producto', 'Talla', 'En stock', 'Por entregar', 'Estado']];
  for (const [p, d] of Object.entries(PRODUCTOS)) {
    d.tallas.forEach(t => {
      const n = estado.stock[p][t] || 0;
      stock.push([d.nombre, t, n, porDar(p, t), textoNivel(n)]);
    });
  }

  const entregas = [['Persona', 'Producto', 'Talla', 'Cantidad', 'Entrega', 'Pago']];
  estado.personas.forEach(per => per.entregas.forEach(en =>
    entregas.push([per.nombre, PRODUCTOS[en.producto].nombre, en.talla, en.cantidad,
      entregada(en) ? 'Entregado' : 'Por entregar', en.pagado ? 'Pagado' : 'Sin pagar'])));

  const personas = [['Persona', 'Artículos entregados', 'Por entregar', 'Sin pagar']];
  estado.personas.forEach(per => personas.push([
    per.nombre,
    per.entregas.filter(entregada).reduce((s, e) => s + e.cantidad, 0),
    per.entregas.filter(e => !entregada(e)).length,
    per.entregas.filter(e => !e.pagado).length,
  ]));

  const camisas = [['Niño/a', 'Talla', 'Sección', 'Método de pago', 'Pago', 'Entrega', 'Insignias']];
  estado.camisas.forEach(c => camisas.push([c.nombre, c.talla, c.seccion, c.metodo, c.pagado ? 'Pagado' : 'Sin pagar', c.entregado ? 'Entregado' : 'Por entregar', c.insignias || 0]));

  return { Stock: stock, Entregas: entregas, Personas: personas, Camisas: camisas };
}

$('#excel').addEventListener('click', () => {
  if (typeof XLSX === 'undefined') {
    return alert('No se pudo cargar el generador de Excel. Comprueba la conexión a internet y recarga la página.');
  }
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(tablas())) {
    const ws = XLSX.utils.aoa_to_sheet(filas);
    ws['!cols'] = ANCHOS[nombre].map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  }
  XLSX.writeFile(wb, `uniformidad-${new Date().toISOString().slice(0, 10)}.xlsx`);
  aviso('Excel descargado');
});

// ---------- Google Sheets ----------
const CLAVE_SHEETS = 'uniformidad-sheets-url';
const urlSheets = () => { try { return localStorage.getItem(CLAVE_SHEETS) || ''; } catch (e) { return ''; } };

function pedirUrlSheets() {
  const nueva = prompt('Pega la URL de la aplicación web de tu script de Google (la explicación está en google-sheets.gs):', urlSheets());
  if (nueva === null) return '';
  try { localStorage.setItem(CLAVE_SHEETS, nueva.trim()); } catch (e) {}
  return nueva.trim();
}

$('#sheets').addEventListener('click', async () => {
  const url = urlSheets() || pedirUrlSheets();
  if (!url) return;
  if (!/^https:\/\/script\.google\.com\//.test(url)) {
    try { localStorage.removeItem(CLAVE_SHEETS); } catch (e) {}
    return alert('Esa dirección no parece la de un script de Google (debe empezar por https://script.google.com/).');
  }
  try {
    // text/plain y no-cors: Google no admite la petición previa de CORS, así que no se puede leer la respuesta
    await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(tablas()) });
    aviso('Enviado a Google Sheets');
  } catch (e) {
    alert('No se pudo enviar. Comprueba la conexión y la URL del script.');
  }
});
$('#sheets-url').addEventListener('click', pedirUrlSheets);

// ---------- Copia de seguridad ----------
$('#exportar').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' }));
  a.download = `uniformidad-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  aviso('Copia descargada');
});

$('#importar').addEventListener('change', async e => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  try {
    const datos = JSON.parse(await archivo.text());
    if (!datos.stock || !Array.isArray(datos.personas)) throw new Error();
    if (!confirm('Esto reemplaza todos los datos actuales. ¿Continuar?')) return;
    estado = migrar(datos);
    refrescar();
    aviso('Copia restaurada');
  } catch (err) {
    alert('El archivo no es una copia válida.');
  }
  e.target.value = '';
});

pintarStock();
pintarPersonas();
pintarCamisas();
sincronizar(true);
setInterval(sincronizar, 5000);
