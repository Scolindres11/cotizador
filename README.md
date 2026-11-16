# Cotizador COMRURAL · GOAL Honduras

Aplicación web para cotizar insumos de las organizaciones de COMRURAL. Reemplaza el Excel de cotizaciones.

- Publicada en: https://scolindres11.github.io/cotizador/
- Tecnología: React + Vite + Supabase. Se publica sola con GitHub Actions al subir cambios a `main`.
- Guía para técnicos: [docs/guia-tecnicos.md](docs/guia-tecnicos.md)

## Configuración

### Variables del repositorio (GitHub › Settings › Secrets and variables › Actions › Variables)
| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | Project URL de Supabase |
| `VITE_SUPABASE_ANON_KEY` | anon public key |
| `VITE_AZURE_ENABLED` | `true` cuando TI active Microsoft (si no, déjala vacía) |

### Base de datos
Ejecuta una vez [sql/01_migracion_cotizador.sql](sql/01_migracion_cotizador.sql) en Supabase › SQL Editor. Agrega:
`organizacion_id`, `es_manual` y `pasado_catalogo` en `cotizaciones`; la tabla `ordenes_compra` con la función
`crear_orden_compra`; la función `vaciar_catalogo` (solo admin), y activa Realtime en `cotizaciones`.

### Supabase › Authentication › URL Configuration
- **Site URL:** `https://scolindres11.github.io/cotizador/`
- **Redirect URLs:** `https://scolindres11.github.io/cotizador/**` y, para pruebas locales, `http://localhost:5173/cotizador/**`

### Supabase › Authentication › Sign In / Providers
- **Email:** activado. “Allow new users to sign up” activado para que el enlace mágico cree la cuenta la primera vez
  (solo verán datos los correos de la tabla `usuarios`).
- **Azure (Microsoft):** cuando TI dé los datos, llenar *Client ID*, *Secret* y *Azure Tenant URL*
  (`https://login.microsoftonline.com/<tenant-id>`). En Azure, la Redirect URI es
  `https://<tu-proyecto>.supabase.co/auth/v1/callback`. Luego poner `VITE_AZURE_ENABLED=true` en GitHub y volver a publicar.

## Desarrollo local
```bash
npm install
npm run dev
```
Crea un archivo `.env.local` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
