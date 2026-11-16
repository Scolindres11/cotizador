import { useMemo, useState } from 'react'
import {
  useDatos, useAviso, useOrgElegida, BuscadorOrg, DatosOrg, PestanasFuente, Interruptor, Kpi,
} from '../components/comun.jsx'
import { lempiras, porcentaje, subtotal, sumar, totales, esNum, enlaceDe, orgDeCotizacion } from '../util.js'

export default function Carrito() {
  const { orgs, cots, cotsDeOrg, porId, porNombre, actualizarCot } = useDatos()
  const aviso = useAviso()
  const [org, setOrg] = useOrgElegida()
  const [fuente, setFuente] = useState(() => sessionStorage.getItem('cz_fuente') || 'COMRURAL')
  const cambiarFuente = (f) => { setFuente(f); try { sessionStorage.setItem('cz_fuente', f) } catch { /* nada */ } }

  // Resumen de todas las organizaciones (fuente elegida)
  const resumen = useMemo(() => {
    const m = new Map()
    for (const c of cots) {
      if (!c.comprar || c.fuente !== fuente) continue
      const o = orgDeCotizacion(c, porId, porNombre)
      const k = o ? String(o.id) : `?${c.organizacion}`
      const r = m.get(k) || { org: o, nombre: o?.organizacion || c.organizacion || '(sin organización)', lote: o?.lote ?? c.lote, n: 0, total: 0 }
      r.n += 1; r.total += subtotal(c)
      m.set(k, r)
    }
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [cots, fuente, porId, porNombre])

  const items = useMemo(() => cotsDeOrg(org, fuente).filter((c) => c.comprar), [cotsDeOrg, org, fuente])
  const t = totales(items, org)
  const conPrecio = items.filter((i) => esNum(i.precio_unit)).length

  return (
    <>
      <PestanasFuente valor={fuente} onChange={cambiarFuente} />

      <div className="tarjeta">
        <h2>Carrito por organización · {fuente}</h2>
        {resumen.length === 0 ? <p className="muted">Ninguna organización tiene ítems en el carrito.</p> : (
          <div className="tabla-cont" style={{ maxHeight: 280 }}>
            <table>
              <thead><tr><th>Organización</th><th>Lote</th><th className="num">Ítems en carrito</th><th className="num">Total comercial</th></tr></thead>
              <tbody>
                {resumen.map((r) => (
                  <tr key={r.nombre + r.lote} className={`clic ${org && r.org && r.org.id === org.id ? 'sel' : ''}`} onClick={() => r.org && setOrg(r.org)}>
                    <td>{r.nombre}</td><td>{r.lote ?? '—'}</td><td className="num">{r.n}</td><td className="num">{lempiras(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={2}>Total</td><td className="num">{resumen.reduce((s, r) => s + r.n, 0)}</td><td className="num">{lempiras(resumen.reduce((s, r) => s + r.total, 0))}</td></tr></tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="tarjeta">
        <BuscadorOrg orgs={orgs} valor={org} onChange={setOrg} />
        {org ? <DatosOrg org={org} /> : <div className="aviso ambar">Elige una organización para ver su carrito.</div>}
      </div>

      {org && (
        <>
          {(t.tSeg === null || t.tFle === null) && (
            <div className="aviso ambar">
              Falta la tasa de {[t.tSeg === null && 'seguro', t.tFle === null && 'flete'].filter(Boolean).join(' y ')} para esta organización.
              Pide a la administradora que la registre.
            </div>
          )}
          <div className="kpis">
            <Kpi etiqueta="Ítems en carrito" valor={items.length} />
            <Kpi etiqueta="Ítems con precio" valor={`${conPrecio} de ${items.length}`} />
            <Kpi etiqueta="Total comercial" valor={lempiras(t.total)} />
            <Kpi etiqueta={`Seguro (${porcentaje(t.tSeg)})`} valor={t.seguro === null ? 'pendiente' : lempiras(t.seguro)} tipo={t.seguro === null ? 'pend' : ''} />
            <Kpi etiqueta={`Flete/movilización (${porcentaje(t.tFle)})`} valor={t.flete === null ? 'pendiente' : lempiras(t.flete)} tipo={t.flete === null ? 'pend' : ''} />
            <Kpi etiqueta="Total con flete y seguro" valor={t.conTodo === null ? 'pendiente' : lempiras(t.conTodo)} tipo="total" />
          </div>

          <div className="tarjeta">
            <h2>Ítems en el carrito</h2>
            {items.length === 0 ? <p className="muted">No hay ítems marcados con 🛒 Comprar. Márcalos en la pantalla Cotizar.</p> : (
              <div className="tabla-cont">
                <table>
                  <thead><tr><th>Ítem</th><th className="num">Cantidad</th><th>Unidad</th><th>Producto</th><th>Tienda</th><th className="num">Precio unit.</th><th className="num">Subtotal</th><th>Enlace</th><th>🛒</th></tr></thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id}>
                        <td>{i.item_buscado}</td><td className="num">{i.cantidad}</td><td>{i.unidad}</td><td>{i.producto}</td><td>{i.tienda}</td>
                        <td className="num">{esNum(i.precio_unit) ? lempiras(i.precio_unit) : <span className="etiqueta ambar">Pendiente de precio</span>}</td>
                        <td className="num">{lempiras(subtotal(i))}</td>
                        <td>{enlaceDe(i) && <a href={enlaceDe(i)} target="_blank" rel="noopener noreferrer">↗</a>}</td>
                        <td><Interruptor checked={i.comprar} etiqueta="" onChange={async (v) => { try { await actualizarCot(i.id, { comprar: v }); aviso.ok(v ? 'Agregado al carrito' : 'Quitado del carrito') } catch (e) { aviso.error(e) } }} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan={6}>Total comercial</td><td className="num">{lempiras(sumar(items))}</td><td colSpan={2}></td></tr></tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
