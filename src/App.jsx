import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { supabase, configurado, traerTodo } from './supabase.js'
import { DatosCtx, useAviso } from './components/comun.jsx'
import { sinTildes } from './util.js'
import Login, { NuevaContrasena } from './components/Login.jsx'
import Cotizar from './pages/Cotizar.jsx'
import Carrito from './pages/Carrito.jsx'

const Orden = lazy(() => import('./pages/Orden.jsx'))
const Resumenes = lazy(() => import('./pages/Resumenes.jsx'))
const Admin = lazy(() => import('./pages/Admin.jsx'))

const BASE = import.meta.env.BASE_URL

function leer(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def } catch { return def } }
function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sin espacio */ } }

export default function App() {
  const aviso = useAviso()
  const [sesion, setSesion] = useState(undefined) // undefined = cargando
  const [recuperando, setRecuperando] = useState(false)
  const [permiso, setPermiso] = useState(null) // null | {autorizado, admin, nombre}

  useEffect(() => {
    if (!configurado) { setSesion(null); return }
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true)
      if (evento === 'SIGNED_OUT') {
        try { ['cz_orgs', 'cz_cots', 'cz_org', 'cz_pantalla'].forEach((k) => localStorage.removeItem(k)) } catch { /* nada */ }
      }
      setSesion(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const email = sesion?.user?.email
  useEffect(() => {
    if (!email) { setPermiso(null); return }
    let vivo = true
    ;(async () => {
      const { data: aut, error } = await supabase.rpc('es_autorizado')
      if (!vivo) return
      if (error) { aviso.error(error); setPermiso({ error: true }); return }
      if (!aut) { setPermiso({ autorizado: false }); return }
      const [{ data: adm }, { data: u }] = await Promise.all([
        supabase.rpc('es_admin'),
        supabase.from('usuarios').select('nombre, rol').ilike('email', email).maybeSingle(),
      ])
      if (vivo) setPermiso({ autorizado: true, admin: !!adm, nombre: u?.nombre || email })
    })()
    return () => { vivo = false }
  }, [email, aviso])

  if (!configurado) {
    return <div className="login"><div className="aviso rojo">Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.</div></div>
  }
  if (sesion === undefined) return <div className="cargando">Cargando…</div>
  if (recuperando && sesion) return <NuevaContrasena onListo={() => setRecuperando(false)} />
  if (!sesion) return <Login />
  if (!permiso) return <div className="cargando">Verificando acceso…</div>
  if (permiso.error) {
    return (
      <div className="login"><div className="tarjeta">
        <div className="aviso rojo">No se pudo verificar tu acceso. Revisa tu conexión.</div>
        <button className="btn bloque" onClick={() => window.location.reload()}>Intentar de nuevo</button>
      </div></div>
    )
  }
  if (!permiso.autorizado) {
    return (
      <div className="login"><div className="tarjeta">
        <div className="logo"><img src={`${BASE}logo.svg`} alt="" /><h2>Cotizador COMRURAL</h2></div>
        <div className="aviso rojo">Tu correo no está autorizado. Pide acceso a la administradora.</div>
        <p className="muted">{email}</p>
        <button className="btn sec bloque" onClick={() => supabase.auth.signOut()}>Salir</button>
      </div></div>
    )
  }
  return <Principal email={email} permiso={permiso} />
}

const PANTALLAS = [
  ['cotizar', 'Cotizar'],
  ['carrito', 'Carrito'],
  ['orden', 'Orden de compra'],
  ['resumenes', 'Resúmenes'],
  ['admin', 'Administración'],
]

function Principal({ email, permiso }) {
  const aviso = useAviso()
  const [pantalla, setPantalla] = useState(() => leer('cz_pantalla', 'cotizar'))
  const [orgs, setOrgs] = useState(() => leer('cz_orgs', []))
  const [cots, setCots] = useState(() => leer('cz_cots', []))
  const [cargando, setCargando] = useState(true)
  const [enLinea, setEnLinea] = useState(navigator.onLine)
  const [orgElegidaId, setOrgElegidaIdState] = useState(() => leer('cz_org', null))
  const [cuenta, setCuenta] = useState(false)
  const ultimaCarga = useRef(0)

  const setOrgElegidaId = (id) => { setOrgElegidaIdState(id); guardar('cz_org', id) }
  const irA = (p) => { setPantalla(p); guardar('cz_pantalla', p); window.scrollTo(0, 0) }

  const recargar = useCallback(async (silencioso) => {
    try {
      const [o, c] = await Promise.all([
        traerTodo('organizaciones'),
        traerTodo('cotizaciones'),
      ])
      o.sort((a, b) => String(a.organizacion ?? '').localeCompare(String(b.organizacion ?? ''), 'es'))
      setOrgs(o); setCots(c)
      guardar('cz_orgs', o); guardar('cz_cots', c)
      ultimaCarga.current = Date.now()
    } catch (e) {
      if (!silencioso) aviso.error(e)
    } finally {
      setCargando(false)
    }
  }, [aviso])

  useEffect(() => { recargar() }, [recargar])

  // Varias personas a la vez: cambios en vivo + recarga al volver a la pestaña
  useEffect(() => {
    const canal = supabase
      .channel('cotizaciones-cambios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cotizaciones' }, (p) => {
        setCots((lista) => {
          if (p.eventType === 'DELETE') return lista.filter((x) => x.id !== p.old.id)
          const i = lista.findIndex((x) => x.id === p.new.id)
          if (i === -1) return [...lista, p.new]
          const copia = lista.slice(); copia[i] = { ...copia[i], ...p.new }; return copia
        })
      })
      .subscribe()
    const alVolver = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultimaCarga.current > 20000) recargar(true)
    }
    const on = () => { setEnLinea(true); recargar(true) }
    const off = () => setEnLinea(false)
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      supabase.removeChannel(canal)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [recargar])

  useEffect(() => { guardar('cz_cots', cots) }, [cots])

  const porId = useMemo(() => new Map(orgs.map((o) => [String(o.id), o])), [orgs])
  const porNombre = useMemo(() => new Map(orgs.map((o) => [sinTildes(o.organizacion).trim(), o])), [orgs])

  const cotsDeOrg = useCallback((org, fuente) => {
    if (!org) return []
    const nom = sinTildes(org.organizacion).trim()
    return cots.filter((c) =>
      (fuente ? c.fuente === fuente : true) &&
      (c.organizacion_id != null ? String(c.organizacion_id) === String(org.id) : sinTildes(c.organizacion).trim() === nom)
    )
  }, [cots])

  const agregarCot = useCallback(async (fila) => {
    const { data, error } = await supabase.from('cotizaciones').insert({ ...fila, creado_por: email }).select().single()
    if (error) throw error
    setCots((l) => (l.some((x) => x.id === data.id) ? l : [...l, data]))
    return data
  }, [email])

  const actualizarCot = useCallback(async (id, cambios) => {
    let previo
    setCots((l) => l.map((x) => (x.id === id ? ((previo = x), { ...x, ...cambios }) : x)))
    const { data, error } = await supabase.from('cotizaciones').update(cambios).eq('id', id).select().single()
    if (error) {
      if (previo) setCots((l) => l.map((x) => (x.id === id ? previo : x)))
      throw error
    }
    setCots((l) => l.map((x) => (x.id === id ? data : x)))
    return data
  }, [])

  const borrarCot = useCallback(async (id) => {
    const { error } = await supabase.from('cotizaciones').delete().eq('id', id)
    if (error) throw error
    setCots((l) => l.filter((x) => x.id !== id))
  }, [])

  const ctx = {
    email, permiso, orgs, setOrgs, cots, setCots, cargando, recargar, porId, porNombre,
    cotsDeOrg, agregarCot, actualizarCot, borrarCot, orgElegidaId, setOrgElegidaId,
  }

  const visibles = PANTALLAS.filter(([k]) => k !== 'admin' || permiso.admin)
  const actual = visibles.some(([k]) => k === pantalla) ? pantalla : 'cotizar'

  return (
    <DatosCtx.Provider value={ctx}>
      <header className="barra no-imprimir">
        <div className="barra-sup">
          <img src={`${BASE}logo.svg`} alt="GOAL" />
          <div className="titulo">Cotizador COMRURAL<small>{permiso.nombre}{permiso.admin ? ' · admin' : ''}</small></div>
          <button onClick={() => setCuenta((v) => !v)}>Cuenta</button>
        </div>
        <nav className="menu">
          {visibles.map(([k, t]) => (
            <button key={k} className={actual === k ? 'activo' : ''} onClick={() => irA(k)}>{t}</button>
          ))}
        </nav>
      </header>
      {!enLinea && <div className="estado-red no-imprimir">Sin conexión. Los cambios no se guardarán hasta que vuelva el internet.</div>}
      <main>
        {cuenta && <MiCuenta email={email} onCerrar={() => setCuenta(false)} />}
        {cargando && cots.length === 0 && orgs.length === 0 ? (
          <div className="cargando">Cargando datos…</div>
        ) : (
          <Suspense fallback={<div className="cargando">Cargando…</div>}>
            {actual === 'cotizar' && <Cotizar />}
            {actual === 'carrito' && <Carrito />}
            {actual === 'orden' && <Orden />}
            {actual === 'resumenes' && <Resumenes />}
            {actual === 'admin' && permiso.admin && <Admin />}
          </Suspense>
        )}
      </main>
    </DatosCtx.Provider>
  )
}

function MiCuenta({ email, onCerrar }) {
  const aviso = useAviso()
  const [clave, setClave] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const cambiar = async (e) => {
    e.preventDefault()
    if (clave.length < 8) { aviso.error('La contraseña debe tener al menos 8 caracteres'); return }
    setOcupado(true)
    const { error } = await supabase.auth.updateUser({ password: clave })
    setOcupado(false)
    if (error) aviso.error(error); else { aviso.ok('Contraseña guardada'); setClave(''); onCerrar() }
  }
  return (
    <div className="tarjeta no-imprimir">
      <h3>Mi cuenta</h3>
      <p className="muted">{email}</p>
      <form onSubmit={cambiar} className="fila">
        <div className="campo"><label>Crear o cambiar contraseña</label>
          <input type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Mínimo 8 caracteres" />
        </div>
        <button className="btn" disabled={ocupado} style={{ flex: '0 0 auto', marginBottom: 8 }}>Guardar</button>
      </form>
      <div className="fila">
        <button className="btn sec" onClick={onCerrar}>Cerrar</button>
        <button className="btn peligro" onClick={() => supabase.auth.signOut()}>Salir</button>
      </div>
    </div>
  )
}
