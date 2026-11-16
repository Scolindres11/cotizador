import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import {
  useDatos, useAviso, useOrgElegida, BuscadorOrg, DatosOrg, PestanasFuente, Interruptor,
} from '../components/comun.jsx'
import { lempiras, subtotal, sumar, aNumero, enlaceDe, esNum, UNIDADES } from '../util.js'

export default function Cotizar() {
  const { orgs, cotsDeOrg } = useDatos()
  const [org, setOrg] = useOrgElegida()
  const [fuente, setFuente] = useState(() => sessionStorage.getItem('cz_fuente') || 'COMRURAL')
  const cambiarFuente = (f) => { setFuente(f); try { sessionStorage.setItem('cz_fuente', f) } catch { /* nada */ } }
  const items = useMemo(() => cotsDeOrg(org, fuente).sort((a, b) => a.id - b.id), [cotsDeOrg, org, fuente])

  return (
    <>
      <PestanasFuente valor={fuente} onChange={cambiarFuente} />
      <div className="tarjeta">
        <BuscadorOrg orgs={orgs} valor={org} onChange={setOrg} />
        {org ? <DatosOrg org={org} /> : <div className="aviso ambar">Elige una organización para empezar a cotizar.</div>}
      </div>
      <AgregarItem org={org} fuente={fuente} />
      {org && <TablaItems items={items} fuente={fuente} />}
    </>
  )
}

/* ------------------------------------------------------------------ */
function AgregarItem({ org, fuente }) {
  const { agregarCot } = useDatos()
  const aviso = useAviso()
  const [buscado, setBuscado] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [elegido, setElegido] = useState(null)
  const [manual, setManual] = useState(false)
  const [m, setM] = useState({ producto: '', tienda: '', precio: '', enlace: '', especificacion: '' })
  const [cantidad, setCantidad] = useState('')
  const [unidad, setUnidad] = useState('unidad')
  const [obs, setObs] = useState('')
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const turno = useRef(0)

  // Búsqueda mientras se escribe, con espera de 300 ms
  useEffect(() => {
    const q = buscado.trim()
    if (q.length < 2) { setResultados([]); setBuscando(false); return }
    setBuscando(true)
    const mio = ++turno.current
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('buscar_catalogo', { q })
      if (mio !== turno.current) return
      setBuscando(false)
      if (error) { aviso.error(error); return }
      setResultados(data || [])
    }, 300)
    return () => clearTimeout(t)
  }, [buscado, aviso])

  const limpiar = () => {
    setBuscado(''); setResultados([]); setElegido(null); setManual(false)
    setM({ producto: '', tienda: '', precio: '', enlace: '', especificacion: '' })
    setCantidad(''); setUnidad('unidad'); setObs(''); setErrores({})
  }

  const guardar = async () => {
    const err = {}
    const cant = aNumero(cantidad)
    if (!org) err.org = 'Falta elegir la organización'
    if (!buscado.trim()) err.buscado = 'Escribe qué estás buscando'
    if (!(cant > 0)) err.cantidad = 'La cantidad es obligatoria y debe ser mayor que 0'
    if (!unidad.trim()) err.unidad = 'Falta la unidad'
    if (manual) {
      if (!m.producto.trim()) err.producto = 'Falta el producto'
      if (!m.tienda.trim()) err.tienda = 'Falta la tienda'
      if (!(aNumero(m.precio) >= 0) || m.precio === '') err.precio = 'Falta el precio'
    } else if (!elegido) err.producto = 'Falta elegir un producto del catálogo o agregarlo manual'
    setErrores(err)
    const msgs = Object.values(err)
    if (msgs.length) { aviso.error(msgs.join('. ')); return }

    const base = {
      fuente, lote: org.lote, organizacion: org.organizacion, organizacion_id: org.id,
      item_buscado: buscado.trim(), cantidad: cant, unidad: unidad.trim(), observaciones: obs.trim() || null, comprar: false,
    }
    const fila = manual
      ? { ...base, producto: m.producto.trim(), tienda: m.tienda.trim(), precio_unit: aNumero(m.precio),
          enlace: m.enlace.trim() || null, especificacion: m.especificacion.trim() || null, motivo_sin_precio: null, es_manual: true }
      : { ...base, producto: elegido.producto, tienda: elegido.tienda, precio_unit: esNum(elegido.precio) ? Number(elegido.precio) : null,
          enlace: elegido.enlace || null, especificacion: elegido.especificacion || null, motivo_sin_precio: elegido.motivo_sin_precio || null, es_manual: false }
    setGuardando(true)
    try {
      await agregarCot(fila)
      aviso.ok('Guardado')
      limpiar()
    } catch (e) { aviso.error(e) } finally { setGuardando(false) }
  }

  return (
    <div className="tarjeta">
      <h2>Agregar ítem · {fuente}</h2>
      {errores.org && <div className="aviso rojo">{errores.org}</div>}
      <div className="campo">
        <label htmlFor="buscado">¿Qué buscas?</label>
        <input id="buscado" className={errores.buscado ? 'error' : ''} placeholder="Por ejemplo: clavos, malla, motobomba…"
          value={buscado} onChange={(e) => { setBuscado(e.target.value); setElegido(null) }} autoComplete="off" />
      </div>

      {!manual && buscado.trim().length >= 2 && (
        <div>
          <div className="fila" style={{ alignItems: 'center' }}>
            <span className="muted">{buscando ? 'Buscando…' : `${resultados.length} resultado(s)`}</span>
            <button className="btn sec chico" style={{ flex: '0 0 auto' }}
              onClick={() => { setManual(true); setElegido(null); setM((x) => ({ ...x, producto: x.producto || buscado.trim() })) }}>
              + Agregar manual
            </button>
          </div>
          <div className="resultados">
            {resultados.map((r) => (
              <button type="button" key={r.id} className={`producto ${elegido?.id === r.id ? 'sel' : ''}`} onClick={() => setElegido(r)}>
                <span className="tienda">{r.tienda}</span>
                <span className="nombre">{r.producto}</span>
                {esNum(r.precio) ? <span className="precio">{lempiras(r.precio)}</span>
                  : <span><span className="etiqueta ambar">Pendiente de precio</span>{r.motivo_sin_precio && <span className="muted"> · {r.motivo_sin_precio}</span>}</span>}
                {r.especificacion && <span className="espec">{r.especificacion}</span>}
                <a href={enlaceDe(r)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="muted">
                  {r.enlace ? 'Ver enlace' : 'Buscar en la web'} ↗
                </a>
              </button>
            ))}
          </div>
          {!buscando && resultados.length === 0 && (
            <div className="aviso ambar">No aparece en el catálogo. Usa “Agregar manual”.</div>
          )}
        </div>
      )}

      {manual && (
        <div className="tarjeta" style={{ background: 'var(--gris-0)' }}>
          <div className="fila" style={{ alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Producto manual</h3>
            <button className="btn sec chico" style={{ flex: '0 0 auto' }} onClick={() => setManual(false)}>Volver al catálogo</button>
          </div>
          <div className="fila">
            <div className="campo"><label>Producto *</label><input className={errores.producto ? 'error' : ''} value={m.producto} onChange={(e) => setM({ ...m, producto: e.target.value })} /></div>
            <div className="campo"><label>Tienda *</label><input className={errores.tienda ? 'error' : ''} value={m.tienda} onChange={(e) => setM({ ...m, tienda: e.target.value })} /></div>
            <div className="campo"><label>Precio unitario (L) *</label><input className={errores.precio ? 'error' : ''} inputMode="decimal" value={m.precio} onChange={(e) => setM({ ...m, precio: e.target.value })} /></div>
          </div>
          <div className="fila">
            <div className="campo"><label>Enlace (opcional)</label><input type="url" value={m.enlace} onChange={(e) => setM({ ...m, enlace: e.target.value })} placeholder="https://…" /></div>
            <div className="campo"><label>Especificación (opcional)</label><input value={m.especificacion} onChange={(e) => setM({ ...m, especificacion: e.target.value })} /></div>
          </div>
        </div>
      )}

      {elegido && !manual && (
        <div className="aviso azul">
          Elegido: <strong>{elegido.producto}</strong> — {elegido.tienda} — {esNum(elegido.precio) ? lempiras(elegido.precio) : 'Pendiente de precio'}
          {!esNum(elegido.precio) && elegido.motivo_sin_precio && <div>Motivo: {elegido.motivo_sin_precio}</div>}
        </div>
      )}
      {errores.producto && !elegido && !manual && <div className="aviso rojo">{errores.producto}</div>}

      {(elegido || manual) && (
        <>
          <div className="fila">
            <div className="campo"><label>Cantidad *</label>
              <input className={errores.cantidad ? 'error' : ''} inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
            </div>
            <div className="campo"><label>Unidad *</label>
              <input className={errores.unidad ? 'error' : ''} list="unidades" value={unidad} onChange={(e) => setUnidad(e.target.value)} />
            </div>
            <div className="campo"><label>Subtotal</label>
              <input readOnly value={lempiras((aNumero(cantidad) || 0) * (manual ? aNumero(m.precio) || 0 : Number(elegido?.precio) || 0))} />
            </div>
          </div>
          <div className="campo"><label>Observaciones</label><input value={obs} onChange={(e) => setObs(e.target.value)} /></div>
          <div className="fila">
            <button className="btn sec" onClick={limpiar}>Cancelar</button>
            <button className="btn" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar ítem'}</button>
          </div>
        </>
      )}
      <datalist id="unidades">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
    </div>
  )
}

/* ------------------------------------------------------------------ */
function TablaItems({ items, fuente }) {
  const enCarrito = items.filter((i) => i.comprar)
  return (
    <div className="tarjeta">
      <h2>Ítems cotizados · {fuente} ({items.length})</h2>
      <p className="muted">Edita directo en la tabla; se guarda al salir de cada casilla. Total: <strong>{lempiras(sumar(items))}</strong> · En carrito: {enCarrito.length} ({lempiras(sumar(enCarrito))})</p>
      {items.length === 0 ? <div className="muted">Todavía no hay ítems para esta organización.</div> : (
        <div className="tabla-cont">
          <table>
            <thead><tr>
              <th>Ítem</th><th className="num">Cantidad</th><th>Unidad</th><th>Producto</th><th>Tienda</th>
              <th className="num">Precio unit.</th><th className="num">Subtotal</th><th>Enlace</th><th>Observaciones</th><th>🛒 Comprar</th><th></th>
            </tr></thead>
            <tbody>{items.map((it) => <FilaItem key={it.id} it={it} />)}</tbody>
          </table>
        </div>
      )}
      <datalist id="unidades-tabla">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
    </div>
  )
}

const CAMPOS = ['item_buscado', 'cantidad', 'unidad', 'producto', 'tienda', 'precio_unit', 'enlace', 'observaciones']

function FilaItem({ it }) {
  const { actualizarCot, borrarCot } = useDatos()
  const aviso = useAviso()
  const desde = () => Object.fromEntries(CAMPOS.map((k) => [k, it[k] ?? '']))
  const [b, setB] = useState(desde)
  useEffect(() => { setB(desde()) }, [it]) // eslint-disable-line react-hooks/exhaustive-deps

  const guardarCampo = async (k) => {
    let v = typeof b[k] === 'string' ? b[k].trim() : b[k]
    if (k === 'cantidad') {
      v = aNumero(v)
      if (!(v > 0)) { aviso.error('La cantidad debe ser mayor que 0'); setB(desde()); return }
    } else if (k === 'precio_unit') {
      v = v === '' ? null : aNumero(v)
      if (v !== null && !(v >= 0)) { aviso.error('Precio no válido'); setB(desde()); return }
    } else if (k === 'producto' && !v) {
      aviso.error('Falta el producto'); setB(desde()); return
    } else if (v === '') v = null
    const antes = it[k] ?? null
    if (String(antes ?? '') === String(v ?? '')) return
    try { await actualizarCot(it.id, { [k]: v }); aviso.ok('Guardado') } catch (e) { aviso.error(e); setB(desde()) }
  }

  const caja = (k, clase, extra = {}) => (
    <input className={clase} value={b[k]} onChange={(e) => setB({ ...b, [k]: e.target.value })} onBlur={() => guardarCampo(k)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} {...extra} />
  )
  const enlace = enlaceDe(it)
  const sinPrecio = !esNum(it.precio_unit)

  return (
    <tr>
      <td>{caja('item_buscado', 'w-med')}</td>
      <td className="num">{caja('cantidad', 'w-num', { inputMode: 'decimal' })}</td>
      <td>{caja('unidad', 'w-num', { list: 'unidades-tabla' })}</td>
      <td>{caja('producto', 'w-lg')}{it.es_manual && <span className="etiqueta azul">Manual</span>}</td>
      <td>{caja('tienda', 'w-med')}</td>
      <td className="num">
        {caja('precio_unit', 'w-num', { inputMode: 'decimal', placeholder: '—' })}
        {sinPrecio && <div><span className="etiqueta ambar">Pendiente de precio</span>{it.motivo_sin_precio && <div className="muted">{it.motivo_sin_precio}</div>}</div>}
      </td>
      <td className="num">{sinPrecio ? '—' : lempiras(subtotal(it))}</td>
      <td>
        {enlace && <a href={enlace} target="_blank" rel="noopener noreferrer">{it.enlace ? 'Abrir' : 'Buscar'} ↗</a>}
        {caja('enlace', 'w-med', { placeholder: 'https://…', type: 'url' })}
      </td>
      <td>{caja('observaciones', 'w-lg')}</td>
      <td>
        <Interruptor checked={it.comprar} etiqueta=""
          onChange={async (v) => { try { await actualizarCot(it.id, { comprar: v }); aviso.ok(v ? 'Agregado al carrito' : 'Quitado del carrito') } catch (e) { aviso.error(e) } }} />
      </td>
      <td>
        <button className="btn peligro chico" title="Borrar"
          onClick={async () => {
            if (!window.confirm(`¿Borrar "${it.producto || it.item_buscado}"? Esto no se puede deshacer.`)) return
            try { await borrarCot(it.id); aviso.ok('Borrado') } catch (e) { aviso.error(e) }
          }}>Borrar</button>
      </td>
    </tr>
  )
}
