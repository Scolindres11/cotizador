import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabase.js'
import { useDatos, useAviso } from '../components/comun.jsx'
import { lempiras, esNum, aNumero, sinTildes, subtotal, orgDeCotizacion, descargarExcel } from '../util.js'

const SECCIONES = [['usuarios', 'Usuarios'], ['orgs', 'Organizaciones y tasas'], ['catalogo', 'Catálogo'], ['manuales', 'Productos manuales'], ['exportar', 'Exportar']]

export default function Admin() {
  const [sec, setSec] = useState('usuarios')
  return (
    <>
      <div className="pestanas" style={{ flexWrap: 'wrap' }}>
        {SECCIONES.map(([k, t]) => <button key={k} className={sec === k ? 'activo' : ''} onClick={() => setSec(k)}>{t}</button>)}
      </div>
      {sec === 'usuarios' && <Usuarios />}
      {sec === 'orgs' && <Organizaciones />}
      {sec === 'catalogo' && <Catalogo />}
      {sec === 'manuales' && <Manuales />}
      {sec === 'exportar' && <Exportar />}
    </>
  )
}

/* ---------------- Usuarios ---------------- */
function Usuarios() {
  const { email: yo } = useDatos()
  const aviso = useAviso()
  const [lista, setLista] = useState([])
  const [nuevo, setNuevo] = useState({ email: '', nombre: '', rol: 'tecnico' })

  const cargar = async () => {
    const { data, error } = await supabase.from('usuarios').select('*').order('nombre')
    if (error) aviso.error(error); else setLista(data)
  }
  useEffect(() => { cargar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const agregar = async (e) => {
    e.preventDefault()
    const email = nuevo.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { aviso.error('Correo no válido'); return }
    if (!nuevo.nombre.trim()) { aviso.error('Falta el nombre'); return }
    const { error } = await supabase.from('usuarios').insert({ email, nombre: nuevo.nombre.trim(), rol: nuevo.rol })
    if (error) { aviso.error(/duplicate/i.test(error.message) ? 'Ese correo ya existe' : error); return }
    aviso.ok('Usuario agregado'); setNuevo({ email: '', nombre: '', rol: 'tecnico' }); cargar()
  }
  const cambiarRol = async (u, rol) => {
    if (u.email.toLowerCase() === yo.toLowerCase() && rol !== 'admin' && !window.confirm('Te quitarás el rol de admin a ti misma/o. ¿Seguir?')) return
    const { error } = await supabase.from('usuarios').update({ rol }).eq('email', u.email)
    if (error) aviso.error(error); else { aviso.ok('Guardado'); cargar() }
  }
  const quitar = async (u) => {
    if (u.email.toLowerCase() === yo.toLowerCase()) { aviso.error('No puedes quitarte a ti misma/o'); return }
    if (!window.confirm(`¿Quitar el acceso de ${u.nombre || u.email}?`)) return
    const { error } = await supabase.from('usuarios').delete().eq('email', u.email)
    if (error) aviso.error(error); else { aviso.ok('Acceso quitado'); cargar() }
  }

  return (
    <div className="tarjeta">
      <h2>Usuarios con acceso ({lista.length})</h2>
      <form className="fila" onSubmit={agregar}>
        <div className="campo"><label>Correo</label><input type="email" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} /></div>
        <div className="campo"><label>Nombre</label><input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></div>
        <div className="campo"><label>Rol</label><select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}><option value="tecnico">Técnico</option><option value="admin">Admin</option></select></div>
        <button className="btn" style={{ flex: '0 0 auto', marginBottom: 8 }}>Agregar</button>
      </form>
      <div className="tabla-cont">
        <table>
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th></th></tr></thead>
          <tbody>{lista.map((u) => (
            <tr key={u.email}>
              <td>{u.nombre}</td><td>{u.email}</td>
              <td><select value={u.rol} onChange={(e) => cambiarRol(u, e.target.value)}><option value="tecnico">Técnico</option><option value="admin">Admin</option></select></td>
              <td><button className="btn peligro chico" onClick={() => quitar(u)}>Quitar</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

/* ---------------- Organizaciones y tasas ---------------- */
const COLS_ORG = [
  ['organizacion', 'Organización', 'w-lg'], ['lote', 'Lote', 'w-num'], ['n_pn', 'N.º PN', 'w-num'], ['municipio', 'Municipio', 'w-med'],
  ['comunidad', 'Comunidad', 'w-med'], ['cadena_valor', 'Cadena de valor', 'w-med'], ['subproyecto', 'Subproyecto', 'w-lg'],
  ['tecnico_1', 'Técnico 1', 'w-med'], ['tecnico_2', 'Técnico 2', 'w-med'], ['formulador', 'Formulador', 'w-med'],
  ['flete_pct', 'Flete %', 'w-num'], ['seguro_pct', 'Seguro %', 'w-num'], ['observacion', 'Observación', 'w-lg'],
]
const sinTasa = (o) => !esNum(o.flete_pct) || !esNum(o.seguro_pct)

function Organizaciones() {
  const { orgs, setOrgs } = useDatos()
  const aviso = useAviso()
  const [q, setQ] = useState('')
  const [soloFaltan, setSoloFaltan] = useState(false)
  const faltan = orgs.filter(sinTasa).length
  const vista = orgs.filter((o) => (!soloFaltan || sinTasa(o)) &&
    (!q || sinTildes(`${o.organizacion} ${o.lote} ${o.municipio}`).includes(sinTildes(q))))

  const guardar = async (o, k, valor) => {
    const { data, error } = await supabase.from('organizaciones').update({ [k]: valor }).eq('id', o.id).select().single()
    if (error) { aviso.error(error); return false }
    setOrgs((l) => l.map((x) => (x.id === o.id ? data : x)))
    aviso.ok('Guardado'); return true
  }
  const nueva = async () => {
    const nombre = window.prompt('Nombre de la organización nueva:')
    if (!nombre || !nombre.trim()) return
    const { data, error } = await supabase.from('organizaciones').insert({ organizacion: nombre.trim() }).select().single()
    if (error) { aviso.error(error); return }
    setOrgs((l) => [data, ...l]); setQ(nombre.trim()); aviso.ok('Organización creada')
  }

  return (
    <div className="tarjeta">
      <h2>Organizaciones y tasas ({orgs.length})</h2>
      {faltan > 0 && <div className="aviso rojo">{faltan} organización(es) sin tasa de flete o de seguro. Aparecen en rojo.</div>}
      <p className="muted">Escribe las tasas como porcentaje: 30 = 30 %. Se guarda al salir de la casilla.</p>
      <div className="fila" style={{ alignItems: 'center' }}>
        <div className="campo"><label>Buscar</label><input value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label style={{ flex: '0 0 auto' }}><input type="checkbox" style={{ width: 'auto', minHeight: 0 }} checked={soloFaltan} onChange={(e) => setSoloFaltan(e.target.checked)} /> Solo sin tasa</label>
        <button className="btn sec" style={{ flex: '0 0 auto' }} onClick={nueva}>+ Organización</button>
      </div>
      <ImportarOrgs />
      <div className="tabla-cont" style={{ maxHeight: 520 }}>
        <table>
          <thead><tr>{COLS_ORG.map(([k, t]) => <th key={k}>{t}</th>)}</tr></thead>
          <tbody>{vista.map((o) => <FilaOrg key={o.id} o={o} guardar={guardar} />)}</tbody>
        </table>
      </div>
    </div>
  )
}

/* Importar organizaciones desde Excel: actualiza por Lote + N.º PN (o por nombre) y agrega las nuevas. No borra. */
const ALIAS_ORG = {
  organizacion: ['organizacion', 'organización', 'nombre de la organizacion', 'nombre organizacion', 'op'],
  lote: ['lote'], n_pn: ['n_pn', 'n.º pn', 'n° pn', 'no. pn', 'n pn', 'pn', 'numero pn', 'nº pn'],
  municipio: ['municipio'], comunidad: ['comunidad'], cadena_valor: ['cadena_valor', 'cadena de valor', 'rubro'],
  subproyecto: ['subproyecto', 'nombre del subproyecto'], tecnico_1: ['tecnico_1', 'tecnico 1', 'técnico 1'],
  tecnico_2: ['tecnico_2', 'tecnico 2', 'técnico 2'], formulador: ['formulador'],
  flete_pct: ['flete_pct', 'flete', 'flete %', '% flete', 'tasa flete'], seguro_pct: ['seguro_pct', 'seguro', 'seguro %', '% seguro', 'tasa seguro'],
  observacion: ['observacion', 'observación', 'observaciones', 'estado'],
}
const normEnc = (h) => sinTildes(h).replace(/[º°]/g, 'º').replace(/\s+/g, ' ').trim()
const clave = (o) => (o.lote && o.n_pn ? `pn|${sinTildes(o.lote).trim()}|${String(o.n_pn).trim()}` : null)
const claveNombre = (o) => `nom|${sinTildes(o.organizacion).replace(/\s+/g, ' ').trim()}`
const tasa = (v) => {
  if (v === '' || v === null || v === undefined) return null
  const n = aNumero(String(v).replace('%', ''))
  if (n === null || n < 0) return null
  return n > 1 ? Math.round(n * 100) / 10000 : n
}
const igual = (a, b) => String(a ?? '') === String(b ?? '')

function ImportarOrgs() {
  const { orgs, setOrgs } = useDatos()
  const aviso = useAviso()
  const [plan, setPlan] = useState(null) // {nuevas, cambios, iguales, hoja}
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const leer = async (archivo) => {
    setError(''); setPlan(null)
    if (!archivo) return
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await archivo.arrayBuffer())
      const nombres = wb.SheetNames
      const hoja = nombres.find((n) => /^web_organizaciones$/i.test(n)) || nombres.find((n) => /organizacion/i.test(sinTildes(n))) || nombres[0]
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { defval: '' })
      if (!filas.length) { setError(`La hoja "${hoja}" está vacía.`); return }
      const encs = Object.keys(filas[0])
      const mapa = {}
      for (const [campo, alias] of Object.entries(ALIAS_ORG)) {
        const h = encs.find((e) => alias.includes(normEnc(e)))
        if (h) mapa[campo] = h
      }
      if (!mapa.organizacion) { setError(`No encontré la columna "organizacion" en la hoja "${hoja}".`); return }
      const existentes = new Map()
      for (const o of orgs) { const k = clave(o); if (k) existentes.set(k, o); existentes.set(claveNombre(o), existentes.get(claveNombre(o)) || o) }
      const nuevas = [], cambios = [], vistos = new Set()
      let iguales = 0
      for (const r of filas) {
        const f = {}
        for (const [campo, h] of Object.entries(mapa)) {
          const v = r[h]
          f[campo] = campo.endsWith('_pct') ? tasa(v) : (String(v ?? '').trim() || null)
        }
        if (!f.organizacion) continue
        const k = clave(f) || claveNombre(f)
        if (vistos.has(k)) continue
        vistos.add(k)
        const o = (clave(f) && existentes.get(clave(f))) || existentes.get(claveNombre(f))
        if (!o) { nuevas.push(f); continue }
        // Solo se actualizan las columnas que vienen en el Excel; una celda vacía no borra lo que ya hay
        const dif = {}
        for (const campo of Object.keys(mapa)) if (f[campo] !== null && !igual(f[campo], o[campo])) dif[campo] = f[campo]
        if (Object.keys(dif).length) cambios.push({ o, dif }); else iguales++
      }
      setPlan({ nuevas, cambios, iguales, hoja })
    } catch (e) { setError(`No se pudo leer el archivo: ${e.message || e}`) }
  }

  const aplicar = async () => {
    setOcupado(true)
    try {
      const actualizadas = []
      for (const { o, dif } of plan.cambios) {
        const { data, error: e } = await supabase.from('organizaciones').update(dif).eq('id', o.id).select().single()
        if (e) throw e
        actualizadas.push(data)
      }
      let creadas = []
      if (plan.nuevas.length) {
        const { data, error: e } = await supabase.from('organizaciones').insert(plan.nuevas).select()
        if (e) throw e
        creadas = data
      }
      const porId = new Map(actualizadas.map((x) => [x.id, x]))
      setOrgs((l) => [...creadas, ...l.map((x) => porId.get(x.id) || x)])
      aviso.ok(`Listo: ${creadas.length} nuevas, ${actualizadas.length} actualizadas`)
      setPlan(null)
    } catch (e) { aviso.error(e) } finally { setOcupado(false) }
  }

  const nombresDif = (dif) => Object.keys(dif).map((k) => COLS_ORG.find(([c]) => c === k)?.[1] || k).join(', ')

  return (
    <details style={{ margin: '8px 0 12px' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Actualizar desde Excel</summary>
      <p className="muted">Sube el Excel con la lista de organizaciones (hoja <code>web_organizaciones</code> u otra con columna “organizacion”).
        Se busca cada fila por Lote + N.º PN, o por nombre. Las nuevas se agregan, las que cambiaron se actualizan.
        No se borra nada y una celda vacía no borra lo que ya está guardado.</p>
      <div className="campo"><label>Archivo Excel</label><input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => leer(e.target.files?.[0])} /></div>
      {error && <div className="aviso rojo">{error}</div>}
      {plan && (
        <>
          <div className="aviso azul">Hoja “{plan.hoja}”: {plan.nuevas.length} nuevas · {plan.cambios.length} con cambios · {plan.iguales} sin cambios.</div>
          {(plan.nuevas.length > 0 || plan.cambios.length > 0) && (
            <ul className="muted" style={{ maxHeight: 180, overflow: 'auto' }}>
              {plan.nuevas.map((f, i) => <li key={`n${i}`}>Nueva: {f.organizacion}{f.lote ? ` (${f.lote})` : ''}</li>)}
              {plan.cambios.map(({ o, dif }) => <li key={o.id}>{o.organizacion}: {nombresDif(dif)}</li>)}
            </ul>
          )}
          <button className="btn" disabled={ocupado || (!plan.nuevas.length && !plan.cambios.length)} onClick={aplicar}>
            {ocupado ? 'Guardando…' : 'Aplicar cambios'}
          </button>
        </>
      )}
    </details>
  )
}

function FilaOrg({ o, guardar }) {
  const aviso = useAviso()
  const inicial = () => Object.fromEntries(COLS_ORG.map(([k]) => [k,
    k.endsWith('_pct') ? (esNum(o[k]) ? String(Math.round(Number(o[k]) * 10000) / 100) : '') : (o[k] ?? '')]))
  const [b, setB] = useState(inicial)
  useEffect(() => { setB(inicial()) }, [o]) // eslint-disable-line react-hooks/exhaustive-deps

  const salir = async (k) => {
    let v = typeof b[k] === 'string' ? b[k].trim() : b[k]
    if (k.endsWith('_pct')) {
      if (v === '') v = null
      else {
        const n = aNumero(String(v).replace('%', ''))
        if (n === null || n < 0 || n > 100) { aviso.error('Escribe un porcentaje entre 0 y 100'); setB(inicial()); return }
        v = Math.round(n * 100) / 10000
      }
    } else if (v === '') v = null
    if (k === 'organizacion' && !v) { aviso.error('El nombre no puede quedar vacío'); setB(inicial()); return }
    if (String(o[k] ?? '') === String(v ?? '')) return
    const ok = await guardar(o, k, v)
    if (!ok) setB(inicial())
  }
  return (
    <tr className={sinTasa(o) ? 'falta' : ''}>
      {COLS_ORG.map(([k, , clase]) => (
        <td key={k}><input className={clase + (k.endsWith('_pct') && !esNum(o[k]) ? ' error' : '')} value={b[k]}
          inputMode={k.endsWith('_pct') ? 'decimal' : undefined}
          onChange={(e) => setB({ ...b, [k]: e.target.value })} onBlur={() => salir(k)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} /></td>
      ))}
    </tr>
  )
}

/* ---------------- Catálogo (CSV) ---------------- */
function parsearCSV(texto) {
  texto = texto.replace(/^﻿/, '')
  const primera = texto.slice(0, texto.indexOf('\n') === -1 ? texto.length : texto.indexOf('\n'))
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : primera.includes('\t') && !primera.includes(',') ? '\t' : ','
  const filas = []
  let fila = [], campo = '', comillas = false
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (comillas) {
      if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++ } else comillas = false }
      else campo += ch
    } else if (ch === '"') comillas = true
    else if (ch === sep) { fila.push(campo); campo = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo); campo = ''
      if (fila.some((c) => c.trim() !== '')) filas.push(fila)
      fila = []
    } else campo += ch
  }
  fila.push(campo)
  if (fila.some((c) => c.trim() !== '')) filas.push(fila)
  return filas
}

const COLS_CAT = ['tienda', 'producto', 'precio', 'enlace', 'especificacion', 'motivo_sin_precio']

function Catalogo() {
  const aviso = useAviso()
  const [total, setTotal] = useState(null)
  const [filas, setFilas] = useState(null)
  const [modo, setModo] = useState('agregar')
  const [prog, setProg] = useState(null) // {hechas, total}
  const [errorArchivo, setErrorArchivo] = useState('')

  const contar = async () => {
    const { count, error } = await supabase.from('catalogo').select('id', { count: 'exact', head: true })
    if (!error) setTotal(count)
  }
  useEffect(() => { contar() }, [])

  const leerArchivo = async (archivo) => {
    setErrorArchivo(''); setFilas(null)
    if (!archivo) return
    const texto = await archivo.text()
    const datos = parsearCSV(texto)
    if (datos.length < 2) { setErrorArchivo('El archivo está vacío.'); return }
    const enc = datos[0].map((h) => sinTildes(h).trim().replace(/\s+/g, '_'))
    const idx = Object.fromEntries(COLS_CAT.map((c) => [c, enc.indexOf(c)]))
    const faltan = ['tienda', 'producto'].filter((c) => idx[c] === -1)
    if (faltan.length) { setErrorArchivo(`Faltan columnas: ${faltan.join(', ')}. Encabezados esperados: ${COLS_CAT.join(', ')}`); return }
    const lista = []
    for (const r of datos.slice(1)) {
      const v = (c) => (idx[c] === -1 ? '' : (r[idx[c]] ?? '').trim())
      if (!v('producto')) continue
      lista.push({ tienda: v('tienda') || null, producto: v('producto'), precio: aNumero(v('precio')),
        enlace: v('enlace') || null, especificacion: v('especificacion') || null, motivo_sin_precio: v('motivo_sin_precio') || null })
    }
    setFilas(lista)
  }

  const subir = async () => {
    if (!filas?.length) return
    if (modo === 'reemplazar' && !window.confirm(`Se BORRARÁ todo el catálogo actual (${total ?? '?'} filas) y se cargarán ${filas.length}. ¿Seguir?`)) return
    try {
      if (modo === 'reemplazar') {
        const { error } = await supabase.rpc('vaciar_catalogo')
        if (error) throw error
      }
      const T = 1000
      setProg({ hechas: 0, total: filas.length })
      for (let i = 0; i < filas.length; i += T) {
        const lote = filas.slice(i, i + T)
        let intento = 0
        for (;;) {
          const { error } = await supabase.from('catalogo').insert(lote)
          if (!error) break
          if (++intento >= 3) throw error
          await new Promise((r) => setTimeout(r, 1500 * intento))
        }
        setProg({ hechas: Math.min(i + T, filas.length), total: filas.length })
      }
      aviso.ok(`Catálogo cargado: ${filas.length.toLocaleString('en-US')} filas`)
      setFilas(null); contar()
    } catch (e) {
      aviso.error(e)
      setErrorArchivo(`Se detuvo la carga: ${e.message || e}. Filas cargadas: ${prog?.hechas ?? 0}.`)
    }
  }

  return (
    <div className="tarjeta">
      <h2>Catálogo</h2>
      <p className="muted">Filas actuales: {total === null ? '…' : total.toLocaleString('en-US')}</p>
      <p className="muted">CSV con encabezados: <code>{COLS_CAT.join(', ')}</code>. Se sube en tandas de 1000 filas.</p>
      <div className="campo"><label>Archivo CSV</label><input type="file" accept=".csv,text/csv" onChange={(e) => leerArchivo(e.target.files?.[0])} /></div>
      {errorArchivo && <div className="aviso rojo">{errorArchivo}</div>}
      {filas && (
        <>
          <div className="aviso azul">{filas.length.toLocaleString('en-US')} filas listas para subir. Ejemplo: {filas[0]?.producto} — {filas[0]?.tienda} — {lempiras(filas[0]?.precio)}</div>
          <div className="fila">
            <label><input type="radio" style={{ width: 'auto', minHeight: 0 }} checked={modo === 'agregar'} onChange={() => setModo('agregar')} /> Agregar al catálogo</label>
            <label><input type="radio" style={{ width: 'auto', minHeight: 0 }} checked={modo === 'reemplazar'} onChange={() => setModo('reemplazar')} /> Reemplazar todo</label>
          </div>
          <button className="btn" onClick={subir} disabled={prog && prog.hechas < prog.total}>Subir catálogo</button>
        </>
      )}
      {prog && (
        <>
          <div className="barra-prog"><div style={{ width: `${(prog.hechas / prog.total) * 100}%` }} /></div>
          <p className="muted">{prog.hechas.toLocaleString('en-US')} de {prog.total.toLocaleString('en-US')}</p>
        </>
      )}
    </div>
  )
}

/* ---------------- Productos manuales ---------------- */
function Manuales() {
  const { cots, actualizarCot } = useDatos()
  const aviso = useAviso()
  const lista = cots.filter((c) => c.es_manual && !c.pasado_catalogo)
  const [ocupado, setOcupado] = useState(null)

  const pasar = async (c) => {
    setOcupado(c.id)
    try {
      const { error } = await supabase.from('catalogo').insert({
        tienda: c.tienda, producto: c.producto, precio: c.precio_unit, enlace: c.enlace, especificacion: c.especificacion, motivo_sin_precio: c.motivo_sin_precio,
      })
      if (error) throw error
      await actualizarCot(c.id, { pasado_catalogo: true })
      aviso.ok('Pasado al catálogo')
    } catch (e) { aviso.error(e) } finally { setOcupado(null) }
  }

  return (
    <div className="tarjeta">
      <h2>Productos manuales ({lista.length})</h2>
      <p className="muted">Ítems que los técnicos agregaron a mano y que aún no están en el catálogo.</p>
      {lista.length === 0 ? <p className="muted">No hay productos manuales pendientes.</p> : (
        <div className="tabla-cont">
          <table>
            <thead><tr><th>Producto</th><th>Tienda</th><th className="num">Precio</th><th>Especificación</th><th>Enlace</th><th>Organización</th><th>Creado por</th><th></th></tr></thead>
            <tbody>{lista.map((c) => (
              <tr key={c.id}>
                <td>{c.producto}</td><td>{c.tienda}</td><td className="num">{lempiras(c.precio_unit)}</td><td>{c.especificacion}</td>
                <td>{c.enlace && <a href={c.enlace} target="_blank" rel="noopener noreferrer">↗</a>}</td>
                <td>{c.organizacion}</td><td>{c.creado_por}</td>
                <td><button className="btn chico" disabled={ocupado === c.id} onClick={() => pasar(c)}>Pasar al catálogo</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ---------------- Exportar ---------------- */
function Exportar() {
  const { cots, porId, porNombre } = useDatos()
  const aviso = useAviso()
  const total = useMemo(() => cots.reduce((s, c) => s + subtotal(c), 0), [cots])
  const exportar = async () => {
    const filas = cots.map((c) => {
      const o = orgDeCotizacion(c, porId, porNombre)
      return {
        ID: c.id, Fuente: c.fuente, Lote: c.lote, Organización: c.organizacion, Municipio: o?.municipio ?? '', Comunidad: o?.comunidad ?? '',
        'Ítem buscado': c.item_buscado, Cantidad: Number(c.cantidad) || 0, Unidad: c.unidad, Producto: c.producto, Tienda: c.tienda,
        'Precio unit.': esNum(c.precio_unit) ? Number(c.precio_unit) : '', Subtotal: subtotal(c), Enlace: c.enlace ?? '',
        Observaciones: c.observaciones ?? '', Especificación: c.especificacion ?? '', 'Motivo sin precio': c.motivo_sin_precio ?? '',
        Comprar: c.comprar ? 'Sí' : 'No', Manual: c.es_manual ? 'Sí' : 'No', 'Creado por': c.creado_por ?? '',
        'Creado en': c.creado_en ? new Date(c.creado_en).toLocaleString('es-HN') : '',
      }
    })
    try {
      const hoy = new Date().toISOString().slice(0, 10)
      await descargarExcel(`Cotizaciones COMRURAL ${hoy}.xlsx`, [{ nombre: 'Cotizaciones', filas: filas.length ? filas : [{ Aviso: 'Sin datos' }] }])
    } catch (e) { aviso.error(e) }
  }
  return (
    <div className="tarjeta">
      <h2>Exportar cotizaciones</h2>
      <p>{cots.length.toLocaleString('en-US')} cotizaciones · total {lempiras(total)}</p>
      <button className="btn" onClick={exportar}>Descargar Excel con todas las cotizaciones</button>
    </div>
  )
}
