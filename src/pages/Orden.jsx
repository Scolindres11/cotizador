import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase.js'
import { useDatos, useAviso, useOrgElegida, BuscadorOrg } from '../components/comun.jsx'
import { lempiras, porcentaje, subtotal, totales, esNum, descargarExcel } from '../util.js'

const BASE = import.meta.env.BASE_URL

export default function Orden() {
  const { orgs, cotsDeOrg } = useDatos()
  const aviso = useAviso()
  const [org, setOrg] = useOrgElegida()
  const [orden, setOrden] = useState(null) // {numero, creado_en}
  const [cargandoOC, setCargandoOC] = useState(false)

  const items = useMemo(() => {
    const todos = cotsDeOrg(org).filter((c) => c.comprar)
    return todos.sort((a, b) => (a.fuente === b.fuente ? a.id - b.id : a.fuente === 'COMRURAL' ? -1 : 1))
  }, [cotsDeOrg, org])
  const t = totales(items, org)

  useEffect(() => {
    setOrden(null)
    if (!org) return
    let vivo = true
    setCargandoOC(true)
    supabase.from('ordenes_compra').select('numero, creado_en').eq('organizacion_id', String(org.id))
      .order('id', { ascending: false }).limit(1)
      .then(({ data, error }) => {
        if (!vivo) return
        setCargandoOC(false)
        if (error) aviso.error(error); else setOrden(data?.[0] || null)
      })
    return () => { vivo = false }
  }, [org, aviso])

  const asignar = async (nueva) => {
    if (nueva && !window.confirm('¿Crear un número de orden nuevo para esta organización? El anterior queda guardado.')) return
    const { data, error } = await supabase.rpc('crear_orden_compra', {
      p_organizacion_id: String(org.id), p_organizacion: org.organizacion, p_lote: org.lote == null ? null : String(org.lote), p_total: t.total,
    })
    if (error) { aviso.error(error); return }
    const fila = Array.isArray(data) ? data[0] : data
    setOrden(fila); aviso.ok(`Orden ${fila.numero} creada`)
  }

  const fecha = orden ? new Date(orden.creado_en) : new Date()
  const fechaTxt = fecha.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const nombreArchivo = `${orden?.numero || 'Orden'} ${org?.organizacion || ''}`.replace(/[\\/:*?"<>|]/g, '').trim()

  const pdf = () => {
    if (!orden) { aviso.error('Primero asigna el número de orden'); return }
    const antes = document.title
    document.title = nombreArchivo
    window.print()
    setTimeout(() => { document.title = antes }, 500)
  }

  const excel = async () => {
    if (!orden) { aviso.error('Primero asigna el número de orden'); return }
    const filas = [
      ['GOAL Honduras / COMRURAL — Orden de compra'],
      [],
      ['N.º de orden', orden.numero, '', 'Fecha', fechaTxt],
      ['Lote', org.lote ?? '', '', 'Organización', org.organizacion],
      ['Municipio', org.municipio ?? '', '', 'Comunidad', org.comunidad ?? ''],
      ['Cadena de valor', org.cadena_valor ?? '', '', 'Subproyecto', org.subproyecto ?? ''],
      [],
      ['N.º', 'Fuente', 'Descripción', 'Especificación técnica', 'Cantidad', 'Unidad', 'Precio unit.', 'Tienda', 'Importe'],
      ...items.map((i, n) => [n + 1, i.fuente, i.producto || i.item_buscado, i.especificacion || '', Number(i.cantidad) || 0, i.unidad || '',
        esNum(i.precio_unit) ? Number(i.precio_unit) : 'Pendiente', i.tienda || '', subtotal(i)]),
      [],
      ['', '', '', '', '', '', '', 'Total cotizado', t.total],
      ['', '', '', '', '', '', '', `Seguro (${porcentaje(t.tSeg)})`, t.seguro ?? 'pendiente'],
      ['', '', '', '', '', '', '', `Flete (${porcentaje(t.tFle)})`, t.flete ?? 'pendiente'],
      ['', '', '', '', '', '', '', 'Total con flete y seguro', t.conTodo ?? 'pendiente'],
    ]
    try {
      await descargarExcel(`${nombreArchivo}.xlsx`, [{ nombre: orden.numero, filas, anchos: [6, 12, 34, 34, 10, 10, 14, 24, 16] }])
    } catch (e) { aviso.error(e) }
  }

  return (
    <>
      <div className="tarjeta no-imprimir">
        <BuscadorOrg orgs={orgs} valor={org} onChange={setOrg} />
        {!org && <div className="aviso ambar">Elige una organización para armar su orden de compra.</div>}
        {org && (
          <div className="fila">
            {cargandoOC ? <span className="muted">Buscando número de orden…</span>
              : !orden ? <button className="btn" onClick={() => asignar(false)} disabled={!items.length}>Asignar N.º de orden</button>
              : <button className="btn sec" onClick={() => asignar(true)}>Crear orden nueva</button>}
            <button className="btn" onClick={pdf} disabled={!orden || !items.length}>Descargar PDF</button>
            <button className="btn" onClick={excel} disabled={!orden || !items.length}>Descargar Excel</button>
          </div>
        )}
        {org && <p className="muted">“Descargar PDF” abre la impresión: elige “Guardar como PDF”.</p>}
      </div>

      {org && (
        <div className="tarjeta" id="orden">
          <div className="oc-encabezado">
            <img src={`${BASE}logo.svg`} alt="GOAL" />
            <div className="marca"><strong>GOAL / COMRURAL</strong><span className="muted">GOAL Honduras · Orden de compra</span></div>
            <div className="numero"><span className="muted">N.º de orden</span><strong>{orden?.numero || 'Sin asignar'}</strong><span>{fechaTxt}</span></div>
          </div>
          <div className="datos-org" style={{ marginBottom: 10 }}>
            {[['Lote', org.lote], ['Organización', org.organizacion], ['Municipio', org.municipio], ['Comunidad', org.comunidad],
              ['Cadena de valor', org.cadena_valor], ['Subproyecto', org.subproyecto]].map(([k, v]) => <div key={k}><b>{k}</b>{v || '—'}</div>)}
          </div>
          {items.length === 0 ? <div className="aviso ambar">No hay ítems con 🛒 Comprar en COMRURAL ni en Aporte GP.</div> : (
            <div className="tabla-cont">
              <table>
                <thead><tr><th>N.º</th><th>Fuente</th><th>Descripción</th><th>Especificación técnica</th><th className="num">Cantidad</th><th>Unidad</th><th className="num">Precio unit.</th><th>Tienda</th><th className="num">Importe</th></tr></thead>
                <tbody>
                  {items.map((i, n) => (
                    <tr key={i.id}>
                      <td>{n + 1}</td><td>{i.fuente}</td><td>{i.producto || i.item_buscado}</td><td>{i.especificacion || ''}</td>
                      <td className="num">{i.cantidad}</td><td>{i.unidad}</td>
                      <td className="num">{esNum(i.precio_unit) ? lempiras(i.precio_unit) : 'Pendiente'}</td><td>{i.tienda}</td>
                      <td className="num">{lempiras(subtotal(i))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="oc-totales">
            <div><span>Total cotizado</span><span>{lempiras(t.total)}</span></div>
            <div><span>Seguro ({porcentaje(t.tSeg)})</span><span>{t.seguro === null ? 'pendiente' : lempiras(t.seguro)}</span></div>
            <div><span>Flete ({porcentaje(t.tFle)})</span><span>{t.flete === null ? 'pendiente' : lempiras(t.flete)}</span></div>
            <div className="final"><span>Total con flete y seguro</span><span>{t.conTodo === null ? 'pendiente' : lempiras(t.conTodo)}</span></div>
          </div>
          <div className="firmas solo-impresion"><div>Elaborado por</div><div>Revisado por</div><div>Autorizado por</div></div>
        </div>
      )}
    </>
  )
}
