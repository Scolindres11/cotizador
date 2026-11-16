import { useState } from 'react'
import { supabase, urlRetorno, azureActivo } from '../supabase.js'
import { useAviso } from './comun.jsx'

const BASE = import.meta.env.BASE_URL

// Si el enlace del correo ya se usó o venció, Supabase vuelve con #error=... en la dirección
const errorEnlace = (() => {
  const h = new URLSearchParams(window.location.hash.slice(1))
  if (!h.get('error')) return ''
  window.history.replaceState(null, '', window.location.pathname)
  return h.get('error_code') === 'otp_expired'
    ? 'Ese enlace ya se usó o venció. Cada enlace sirve una sola vez: pide uno nuevo y ábrelo en este navegador.'
    : `No se pudo entrar con el enlace: ${h.get('error_description') || h.get('error')}`
})()

export default function Login() {
  const aviso = useAviso()
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [enviado, setEnviado] = useState('')

  const correo = email.trim().toLowerCase()
  const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)

  const entrar = async (e) => {
    e.preventDefault()
    if (!correoValido) { aviso.error('Escribe un correo válido'); return }
    if (!clave) { aviso.error('Escribe tu contraseña, o usa el enlace mágico'); return }
    setOcupado(true)
    const { error } = await supabase.auth.signInWithPassword({ email: correo, password: clave })
    setOcupado(false)
    if (error) aviso.error(/invalid login/i.test(error.message) ? 'Correo o contraseña incorrectos' : error)
  }

  const enlaceMagico = async () => {
    if (!correoValido) { aviso.error('Escribe tu correo primero'); return }
    setOcupado(true)
    const { error } = await supabase.auth.signInWithOtp({ email: correo, options: { emailRedirectTo: urlRetorno() } })
    setOcupado(false)
    if (error) aviso.error(error); else setEnviado(`Te enviamos un enlace a ${correo}. Ábrelo en este mismo teléfono o computadora.`)
  }

  const olvide = async () => {
    if (!correoValido) { aviso.error('Escribe tu correo primero'); return }
    setOcupado(true)
    const { error } = await supabase.auth.resetPasswordForEmail(correo, { redirectTo: urlRetorno() })
    setOcupado(false)
    if (error) aviso.error(error); else setEnviado(`Te enviamos un correo a ${correo} para crear una contraseña nueva.`)
  }

  const microsoft = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { scopes: 'email openid profile', redirectTo: urlRetorno() },
    })
    if (error) aviso.error(error)
  }

  return (
    <div className="login">
      <div className="tarjeta">
        <div className="logo">
          <img src={`${BASE}logo.svg`} alt="GOAL" />
          <div><h2 style={{ margin: 0 }}>Cotizador COMRURAL</h2><span className="muted">GOAL Honduras</span></div>
        </div>

        {enviado ? <div className="aviso azul">{enviado}</div> : errorEnlace && <div className="aviso rojo">{errorEnlace}</div>}

        <form onSubmit={entrar}>
          <div className="campo">
            <label htmlFor="email">Correo</label>
            <input id="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="clave">Contraseña</label>
            <input id="clave" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
          </div>
          <button className="btn bloque" disabled={ocupado}>Entrar</button>
        </form>
        <button className="btn sec bloque" style={{ marginTop: 8 }} disabled={ocupado} onClick={enlaceMagico}>
          Enviarme un enlace mágico
        </button>
        <p style={{ textAlign: 'center', margin: '10px 0 0' }}>
          <button className="btn sec chico" style={{ border: 0 }} onClick={olvide} disabled={ocupado}>¿Olvidaste o no tienes contraseña?</button>
        </p>

        <div className="separador">o</div>
        <button className="btn sec bloque" onClick={microsoft} disabled={!azureActivo}>
          Entrar con cuenta GOAL (Microsoft)
        </button>
        {!azureActivo && <p className="muted" style={{ textAlign: 'center' }}>Disponible cuando TI active la cuenta Microsoft.</p>}
      </div>
    </div>
  )
}

export function NuevaContrasena({ onListo }) {
  const aviso = useAviso()
  const [clave, setClave] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const guardar = async (e) => {
    e.preventDefault()
    if (clave.length < 8) { aviso.error('Mínimo 8 caracteres'); return }
    setOcupado(true)
    const { error } = await supabase.auth.updateUser({ password: clave })
    setOcupado(false)
    if (error) aviso.error(error); else { aviso.ok('Contraseña guardada'); onListo() }
  }
  return (
    <div className="login"><form className="tarjeta" onSubmit={guardar}>
      <h2>Nueva contraseña</h2>
      <div className="campo"><label>Contraseña</label>
        <input type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} />
      </div>
      <button className="btn bloque" disabled={ocupado}>Guardar</button>
    </form></div>
  )
}
