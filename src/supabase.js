import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configurado = Boolean(url && key)
export const azureActivo = import.meta.env.VITE_AZURE_ENABLED === 'true'

export const supabase = configurado
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null

// Dirección a la que vuelven el enlace mágico y Microsoft
export const urlRetorno = () => window.location.origin + import.meta.env.BASE_URL

// Descarga una tabla completa en páginas de 1000 filas (límite de Supabase)
export async function traerTodo(tabla, columnas = '*', ajustar) {
  const filas = []
  const paso = 1000
  for (let desde = 0; ; desde += paso) {
    let q = supabase.from(tabla).select(columnas).order('id', { ascending: true }).range(desde, desde + paso - 1)
    if (ajustar) q = ajustar(q)
    const { data, error } = await q
    if (error) throw error
    filas.push(...data)
    if (data.length < paso) break
  }
  return filas
}
