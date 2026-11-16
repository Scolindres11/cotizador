import { useMemo, useState } from 'react'
import { useDatos, Kpi } from '../components/comun.jsx'
import { lempiras, subtotal, esNum, orgDeCotizacion, sinTildes } from '../util.js'

const pct = (x) => `${(Math.round(x * 1000) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 })} %`

export default function Resumenes() {
  const { cots, orgs, porId, porNombre } = useDatos()
  const [lote, setLote] = useState('')
  const [municipio, setMunicipio] = useState('')

  // Cada cotización con su organización (para municipio y comunidad)
  const filas = useMemo(() => cots.map((c) => {
    const o = orgDeCotizacion(c, porId, porNombre)
    return { c, lote: String(o?.lote ?? c.lote ?? ''), municipio: o?.municipio || '(sin municipio)', comunidad: o?.comunidad || '(sin comunidad)' }
  }), [cots, porId, porNombre])

  const lotes = useMemo(() => [...new Set(filas.map((f) => f.lote).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })), [filas])
  const municipios = useMemo(() => [...new Set(orgs.map((o) => o.municipio).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [orgs])

  const vista = filas.filter((f) => (!lote || f.lote === lote) && (!municipio || f.municipio === municipio))

  const porMuni = useMemo(() => agrupar(vista, (f) => `${f.municipio}|${f.comunidad}`), [vista])
  const porTienda = useMemo(() => agrupar(vista.filter((f) => (f.c.tienda || '').trim()), (f) => normTienda(f.c.tienda)), [vista])
  const granTotal = vista.reduce((s, f) => s + subtotal(f.c), 0)
  const tiendas = new Set(vista.map((f) => normTienda(f.c.tienda)).filter(Boolean))

  return (
    <>
      <div className="tarjeta">
        <div className="fila">
          <div className="campo"><label>Lote</label>
            <select value={lote} onChange={(e) => setLote(e.target.value)}><option value="">Todos</option>{lotes.map((l) => <option key={l}>{l}</option>)}</select>
          </div>
          <div className="campo"><label>Municipio</label>
            <select value={municipio} onChange={(e) => setMunicipio(e.target.value)}><option value="">Todos</option>{municipios.map((m) => <option key={m}>{m}</option>)}</select>
          </div>
        </div>
      </div>

      <div className="kpis">
        <Kpi etiqueta="Artículos registrados" valor={vista.length.toLocaleString('en-US')} />
        <Kpi etiqueta="Tiendas distintas" valor={tiendas.size} />
        <Kpi etiqueta="Total cotizado" valor={lempiras(granTotal)} tipo="total" />
        <Kpi etiqueta="Ítems en carrito" valor={vista.filter((f) => f.c.comprar).length.toLocaleString('en-US')} />
        <Kpi etiqueta="Pendientes de precio" valor={vista.filter((f) => !esNum(f.c.precio_unit)).length.toLocaleString('en-US')} tipo="pend" />
      </div>

      <div className="tarjeta">
        <h2>Por municipio y comunidad</h2>
        <div className="tabla-cont" style={{ maxHeight: 420 }}>
          <table>
            <thead><tr><th>Municipio</th><th>Comunidad</th><th className="num">Artículos</th><th className="num">Cotizados (con tienda)</th><th className="num">En carrito</th><th className="num">Cotizado COMRURAL</th><th className="num">Cotizado Aporte GP</th><th className="num">Total</th></tr></thead>
            <tbody>
              {porMuni.sort((a, b) => a.clave.localeCompare(b.clave, 'es')).map((g) => {
                const [m, c] = g.clave.split('|')
                return <tr key={g.clave}><td>{m}</td><td>{c}</td><td className="num">{g.n}</td><td className="num">{g.conTienda}</td><td className="num">{g.carrito}</td><td className="num">{lempiras(g.comrural)}</td><td className="num">{lempiras(g.gp)}</td><td className="num">{lempiras(g.total)}</td></tr>
              })}
            </tbody>
            <tfoot><Totales grupos={porMuni} cols={2} /></tfoot>
          </table>
        </div>
      </div>

      <div className="tarjeta">
        <h2>Por tienda</h2>
        <div className="tabla-cont" style={{ maxHeight: 420 }}>
          <table>
            <thead><tr><th>Tienda</th><th className="num">Ítems</th><th className="num">En carrito</th><th className="num">COMRURAL</th><th className="num">Aporte GP</th><th className="num">Total</th><th className="num">% del total</th></tr></thead>
            <tbody>
              {porTienda.sort((a, b) => b.total - a.total).map((g) => (
                <tr key={g.clave}><td>{g.nombre}</td><td className="num">{g.n}</td><td className="num">{g.carrito}</td><td className="num">{lempiras(g.comrural)}</td><td className="num">{lempiras(g.gp)}</td><td className="num">{lempiras(g.total)}</td><td className="num">{granTotal ? pct(g.total / granTotal) : '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

const normTienda = (t) => sinTildes(t).trim().replace(/\s+/g, ' ')

function agrupar(lista, clave) {
  const m = new Map()
  for (const f of lista) {
    const k = clave(f)
    const g = m.get(k) || { clave: k, nombre: (f.c.tienda || '').trim(), n: 0, conTienda: 0, carrito: 0, comrural: 0, gp: 0, total: 0 }
    const s = subtotal(f.c)
    g.n += 1
    if ((f.c.tienda || '').trim()) g.conTienda += 1
    if (f.c.comprar) g.carrito += 1
    if (f.c.fuente === 'COMRURAL') g.comrural += s; else if (f.c.fuente === 'Aporte GP') g.gp += s
    g.total += s
    m.set(k, g)
  }
  return [...m.values()]
}

function Totales({ grupos, cols }) {
  const s = (k) => grupos.reduce((a, g) => a + g[k], 0)
  return (
    <tr><td colSpan={cols}>Total</td><td className="num">{s('n')}</td><td className="num">{s('conTienda')}</td><td className="num">{s('carrito')}</td>
      <td className="num">{lempiras(s('comrural'))}</td><td className="num">{lempiras(s('gp'))}</td><td className="num">{lempiras(s('total'))}</td></tr>
  )
}
