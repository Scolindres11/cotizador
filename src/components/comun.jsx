import { createContext, useContext, useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { sinTildes, mensajeError } from '../util.js'

/* ---------- Avisos breves ---------- */
const ToastCtx = createContext(() => {})
export const useAviso = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [lista, setLista] = useState([])
  const n = useRef(0)
  const avisar = useCallback((texto, tipo = 'ok', ms = 2600) => {
    const id = ++n.current
    setLista((l) => [...l.slice(-2), { id, texto, tipo }])
    setTimeout(() => setLista((l) => l.filter((t) => t.id !== id)), ms)
  }, [])
  const api = useMemo(() => {
    const f = (t, tipo, ms) => avisar(t, tipo, ms)
    f.ok = (t = 'Guardado') => avisar(t, 'ok')
    f.error = (e) => avisar(typeof e === 'string' ? e : mensajeError(e), 'error', 5000)
    f.info = (t) => avisar(t, 'info')
    return f
  }, [avisar])
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {lista.map((t) => <div key={t.id} className={`toast ${t.tipo}`}>{t.texto}</div>)}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- Datos compartidos ---------- */
export const DatosCtx = createContext(null)
export const useDatos = () => useContext(DatosCtx)

/* ---------- Interruptor "Comprar" ---------- */
export function Interruptor({ checked, onChange, etiqueta = '🛒 Comprar', disabled }) {
  return (
    <label className="interruptor" title={etiqueta}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="pista" />
      {etiqueta && <span>{etiqueta}</span>}
    </label>
  )
}

/* ---------- Pestañas de fuente ---------- */
export const FUENTES = ['COMRURAL', 'Aporte GP']
export function PestanasFuente({ valor, onChange }) {
  return (
    <div className="pestanas no-imprimir">
      {FUENTES.map((f) => (
        <button key={f} className={valor === f ? 'activo' : ''} onClick={() => onChange(f)}>{f}</button>
      ))}
    </div>
  )
}

/* ---------- Buscador de organización ---------- */
export function BuscadorOrg({ orgs, valor, onChange }) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const caja = useRef(null)

  useEffect(() => {
    const cerrar = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false) }
    document.addEventListener('pointerdown', cerrar)
    return () => document.removeEventListener('pointerdown', cerrar)
  }, [])

  const opciones = useMemo(() => {
    const q = sinTildes(texto).trim()
    const palabras = q.split(/\s+/).filter(Boolean)
    const lista = !palabras.length ? orgs : orgs.filter((o) => {
      const hay = sinTildes(`${o.organizacion} ${o.lote ?? ''} ${o.municipio ?? ''} ${o.comunidad ?? ''} ${o.n_pn ?? ''}`)
      return palabras.every((p) => hay.includes(p))
    })
    return lista.slice(0, 50)
  }, [orgs, texto])

  return (
    <div className="campo buscador no-imprimir" ref={caja}>
      <label htmlFor="buscar-org">Organización</label>
      <input
        id="buscar-org"
        placeholder={valor ? valor.organizacion : 'Escribe el nombre, lote o municipio…'}
        value={texto}
        onFocus={() => setAbierto(true)}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true) }}
        autoComplete="off"
      />
      {abierto && (
        <div className="lista-opciones">
          {opciones.length === 0 && <div className="muted" style={{ padding: 10 }}>Sin coincidencias</div>}
          {opciones.map((o) => (
            <button key={o.id} onClick={() => { onChange(o); setTexto(''); setAbierto(false) }}>
              <strong>{o.organizacion}</strong>
              <div className="muted">Lote {o.lote ?? '—'} · {o.municipio ?? ''}{o.comunidad ? `, ${o.comunidad}` : ''}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function DatosOrg({ org }) {
  if (!org) return null
  const d = [
    ['Lote', org.lote], ['N.º PN', org.n_pn], ['Municipio', org.municipio], ['Comunidad', org.comunidad],
    ['Cadena de valor', org.cadena_valor], ['Subproyecto', org.subproyecto],
    ['Técnico 1', org.tecnico_1], ['Técnico 2', org.tecnico_2], ['Formulador', org.formulador],
  ]
  return (
    <div>
      <h3 style={{ marginTop: 4 }}>{org.organizacion}</h3>
      <div className="datos-org">
        {d.map(([k, v]) => <div key={k}><b>{k}</b>{v || '—'}</div>)}
      </div>
    </div>
  )
}

export function Kpi({ etiqueta, valor, tipo }) {
  return <div className={`kpi ${tipo || ''}`}><span>{etiqueta}</span><strong>{valor}</strong></div>
}

// Organización elegida, compartida entre pantallas
export function useOrgElegida() {
  const { orgs, orgElegidaId, setOrgElegidaId } = useDatos()
  const org = orgs.find((o) => String(o.id) === String(orgElegidaId)) || null
  return [org, (o) => setOrgElegidaId(o ? o.id : null)]
}
