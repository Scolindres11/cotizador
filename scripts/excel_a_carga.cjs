// Lee las hojas web_ del Excel de cotización y genera:
//  - <salida>/01_organizaciones_y_cotizaciones.sql  (para el SQL Editor)
//  - <salida>/catalogo_completo.csv                  (para Administración › Catálogo)
// Uso: node scripts/excel_a_carga.cjs "<excel.xlsx>" <carpeta_salida>
const X = require('xlsx')
const fs = require('fs')
const path = require('path')

const [, , entrada, salida] = process.argv
const wb = X.readFile(entrada, { sheets: ['web_organizaciones', 'web_cotizaciones', 'web_catalogo'] })
const hoja = (n) => X.utils.sheet_to_json(wb.Sheets[n], { defval: '' })

const txt = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s }
const num = (v) => {
  if (typeof v === 'number') return v
  const s = String(v ?? '').replace(/[L\s,]/gi, '')
  return s && !Number.isNaN(Number(s)) ? Number(s) : null
}
const lit = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)

// Organizaciones
const orgs = hoja('web_organizaciones').filter((r) => txt(r.organizacion)).map((r) => ({
  lote: txt(r.lote), n_pn: txt(r.n_pn), organizacion: txt(r.organizacion), municipio: txt(r.municipio), comunidad: txt(r.comunidad),
  cadena_valor: txt(r.cadena_valor), subproyecto: txt(r.subproyecto), tecnico_1: txt(r.tecnico_1), tecnico_2: txt(r.tecnico_2),
  formulador: txt(r.formulador), flete_pct: num(r.flete_pct), seguro_pct: num(r.seguro_pct), observacion: txt(r.observacion),
}))
const colsO = Object.keys(orgs[0])

// Cotizaciones
const cots = hoja('web_cotizaciones').filter((r) => txt(r.organizacion) && (txt(r.producto) || txt(r.item_buscado))).map((r) => ({
  fuente: txt(r.fuente) === 'Aporte GP' ? 'Aporte GP' : 'COMRURAL',
  lote: txt(r.lote), organizacion: txt(r.organizacion), item_buscado: txt(r.item_buscado), cantidad: num(r.cantidad),
  unidad: txt(r.unidad), producto: txt(r.producto), tienda: txt(r.tienda), precio_unit: num(r.precio_unit), enlace: txt(r.enlace),
  observaciones: txt(r.observaciones), especificacion: txt(r.especificacion), motivo_sin_precio: txt(r.motivo_sin_precio),
  comprar: r.comprar === true || /^(s[ií]|true|1)$/i.test(String(r.comprar).trim()),
}))
const colsC = Object.keys(cots[0])

let sql = `-- Carga inicial desde "${path.basename(entrada)}" (hojas web_organizaciones y web_cotizaciones)
-- Ejecutar UNA vez en Supabase › SQL Editor › Run.
begin;

insert into public.organizaciones (${colsO.join(', ')}) values
${orgs.map((o) => `  (${colsO.map((c) => lit(o[c])).join(', ')})`).join(',\n')};

insert into public.cotizaciones (${colsC.join(', ')}, organizacion_id, creado_por) values
${cots.map((c) => `  (${colsC.map((k) => lit(c[k])).join(', ')}, (select id from public.organizaciones o where lower(o.organizacion) = lower(${lit(c.organizacion)}) order by (o.lote is not distinct from ${lit(c.lote)}) desc limit 1), 'importado del Excel')`).join(',\n')};

-- El lote de cada cotización sale de su organización
update public.cotizaciones c set lote = o.lote
  from public.organizaciones o
 where c.organizacion_id = o.id and c.lote is distinct from o.lote;

commit;

select (select count(*) from public.organizaciones) as organizaciones,
       (select count(*) from public.cotizaciones) as cotizaciones,
       (select count(*) from public.cotizaciones where organizacion_id is null) as cotizaciones_sin_organizacion;
`
fs.mkdirSync(salida, { recursive: true })
fs.writeFileSync(path.join(salida, '01_organizaciones_y_cotizaciones.sql'), sql, 'utf8')

// Catálogo
const colsK = ['tienda', 'producto', 'precio', 'enlace', 'especificacion', 'motivo_sin_precio']
const esc = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const cat = hoja('web_catalogo').filter((r) => txt(r.producto))
const lineas = cat.map((r) => colsK.map((c) => esc(c === 'precio' ? (num(r.precio) ?? '') : String(r[c] ?? '').trim())).join(','))
fs.writeFileSync(path.join(salida, 'catalogo_completo.csv'), '﻿' + [colsK.join(','), ...lineas].join('\n') + '\n', 'utf8')

const tiendas = {}
for (const r of cat) tiendas[r.tienda] = (tiendas[r.tienda] || 0) + 1
console.log(`Organizaciones: ${orgs.length} | sin tasa: ${orgs.filter((o) => o.flete_pct === null || o.seguro_pct === null).length}`)
console.log(`Lotes: ${JSON.stringify([...new Set(orgs.map((o) => o.lote))])}`)
console.log(`Nombres repetidos: ${orgs.length - new Set(orgs.map((o) => o.organizacion.toLowerCase())).size}`)
console.log(`Cotizaciones: ${cots.length} | en carrito: ${cots.filter((c) => c.comprar).length}`)
console.log(`Catálogo: ${cat.length} | con precio: ${cat.filter((r) => num(r.precio) !== null).length}`)
console.log(`Tiendas: ${JSON.stringify(tiendas)}`)
