// Formatos de Honduras: "L 1,234.00" y "30 %"
const fmtNum = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const esNum = (v) => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v))

export function lempiras(v) {
  if (!esNum(v)) return '—'
  const n = Number(v)
  return (n < 0 ? '-L ' : 'L ') + fmtNum.format(Math.abs(n))
}

export function porcentaje(dec) {
  if (!esNum(dec)) return 'pendiente'
  const p = Math.round(Number(dec) * 10000) / 100
  return `${p.toLocaleString('en-US', { maximumFractionDigits: 2 })} %`
}

export const subtotal = (it) => (esNum(it.cantidad) && esNum(it.precio_unit) ? Number(it.cantidad) * Number(it.precio_unit) : 0)

export const sumar = (lista) => lista.reduce((s, it) => s + subtotal(it), 0)

// Convierte "L 1,234.50" o "1234,5" a número; vacío => null
export function aNumero(txt) {
  if (txt === null || txt === undefined) return null
  if (typeof txt === 'number') return txt
  let s = String(txt).replace(/[L\s]/gi, '').trim()
  if (!s) return null
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.') // 1.234,50
  else s = s.replace(/,/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function sinTildes(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Enlace del producto o, si no tiene, uno de búsqueda
export function enlaceDe(it) {
  if (it.enlace && /^https?:\/\//i.test(it.enlace)) return it.enlace
  const prod = (it.producto || it.item_buscado || '').trim()
  if (!prod) return null
  const tienda = (it.tienda || '').trim()
  if (/diunsa/i.test(tienda)) {
    const p = encodeURIComponent(prod)
    return `https://www.diunsa.hn/${p}?_q=${p}&map=ft`
  }
  return `https://www.google.com/search?q=${encodeURIComponent(`${tienda} ${prod} Honduras`.trim())}`
}

export const pendientePrecio = (it) => !esNum(it.precio_unit)

export function mensajeError(e) {
  const m = (e && (e.message || e.error_description || String(e))) || 'Error desconocido'
  if (!navigator.onLine || /failed to fetch|networkerror|load failed|network request failed/i.test(m)) {
    return 'Sin conexión, intenta de nuevo'
  }
  if (/row-level security|permission denied|42501/i.test(m)) return 'No tienes permiso para hacer este cambio'
  return m
}

export const fechaHoy = () =>
  new Date().toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })

export const UNIDADES = ['unidad', 'libra', 'kilogramo', 'quintal', 'saco', 'bolsa', 'caja', 'docena', 'galón', 'litro', 'metro', 'rollo', 'yarda', 'pie', 'lámina', 'barra', 'par', 'juego', 'cubeta', 'servicio']

// Clave para unir una cotización con su organización
export const claveOrg = (org) => (org ? String(org.id) : '')
export function orgDeCotizacion(c, porId, porNombre) {
  if (c.organizacion_id != null && porId.has(String(c.organizacion_id))) return porId.get(String(c.organizacion_id))
  return porNombre.get(sinTildes(c.organizacion).trim()) || null
}

export async function descargarExcel(nombreArchivo, hojas) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const { nombre, filas, anchos } of hojas) {
    const ws = Array.isArray(filas[0]) ? XLSX.utils.aoa_to_sheet(filas) : XLSX.utils.json_to_sheet(filas)
    if (anchos) ws['!cols'] = anchos.map((w) => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31))
  }
  XLSX.writeFile(wb, nombreArchivo)
}

// Totales del carrito u orden: si falta una tasa, queda "pendiente"
export function totales(items, org) {
  const total = sumar(items)
  const tSeg = org && esNum(org.seguro_pct) ? Number(org.seguro_pct) : null
  const tFle = org && esNum(org.flete_pct) ? Number(org.flete_pct) : null
  const seguro = tSeg === null ? null : total * tSeg
  const flete = tFle === null ? null : total * tFle
  const conTodo = seguro === null || flete === null ? null : total + seguro + flete
  return { total, tSeg, tFle, seguro, flete, conTodo }
}
