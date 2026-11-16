// Convierte el Excel de tiendas (una hoja por tienda) al CSV del cotizador:
// tienda, producto, precio, enlace, especificacion, motivo_sin_precio
// Uso: node scripts/catalogo_a_csv.cjs <entrada.xlsx> <salida.csv>
const X = require('xlsx')
const fs = require('fs')

const [, , entrada, salida] = process.argv
const wb = X.readFile(entrada)
const filas = []
const resumen = {}

const num = (v) => {
  if (typeof v === 'number') return v
  const s = String(v ?? '').replace(/[L\s,]/gi, '')
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null
}

for (const hoja of wb.SheetNames) {
  if (/^control$/i.test(hoja)) continue
  const datos = X.utils.sheet_to_json(wb.Sheets[hoja], { defval: '' })
  let n = 0
  for (const r of datos) {
    const producto = String(r['Producto'] || '').trim()
    if (!producto) continue
    const txtPrecio = String(r['Precio (L.)'] ?? '').trim()
    let precio = num(r['Precio (L.)'])
    let motivo = ''
    const extra = []
    const rango = txtPrecio.match(/^([\d.,]+)\s*-\s*([\d.,]+)$/)
    if (precio === null && rango) {
      precio = num(rango[2])
      extra.push(`Precio en rango L ${rango[1]} – ${rango[2]} (se usa el mayor)`)
    }
    if (precio === null) {
      motivo = /consultar/i.test(txtPrecio) || !txtPrecio
        ? 'La tienda no publica precio: consultar por teléfono o WhatsApp'
        : `Precio no numérico: ${txtPrecio}`
    }
    const usd = num(r['Precio (USD)'])
    if (precio === null && usd) extra.push(`Precio en USD: ${usd}`)
    const partes = [
      r['Marca'] && `Marca: ${r['Marca']}`,
      r['Código / SKU'] && `Código: ${r['Código / SKU']}`,
      r['Especificación técnica'],
      r['Dimensiones'] && `Dimensiones: ${r['Dimensiones']}`,
      r['Capacidad / producción'] && `Capacidad: ${r['Capacidad / producción']}`,
      r['Energía, potencia y temperatura'] && `Energía: ${r['Energía, potencia y temperatura']}`,
      r['Peso'] && `Peso: ${r['Peso']}`,
      r['Departamento / Categoría'] && `Categoría: ${[r['Departamento / Categoría'], r['Subcategoría']].filter(Boolean).join(' / ')}`,
      ...extra,
    ].filter(Boolean).map((s) => String(s).trim())
    filas.push({
      tienda: hoja.trim(),
      producto,
      precio: precio ?? '',
      enlace: String(r['Enlace'] || '').trim(),
      especificacion: partes.join('. ').slice(0, 2000),
      motivo_sin_precio: motivo,
    })
    n++
  }
  resumen[hoja] = n
}

const cols = ['tienda', 'producto', 'precio', 'enlace', 'especificacion', 'motivo_sin_precio']
const esc = (v) => {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csv = '﻿' + [cols.join(','), ...filas.map((f) => cols.map((c) => esc(f[c])).join(','))].join('\n') + '\n'
fs.writeFileSync(salida, csv, 'utf8')
console.log(JSON.stringify(resumen))
console.log(`Total: ${filas.length} | con precio: ${filas.filter((f) => f.precio !== '').length}`)
