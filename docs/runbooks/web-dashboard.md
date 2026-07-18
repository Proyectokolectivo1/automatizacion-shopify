# Runbook — dashboard web seguro

Actualizado: 2026-07-17

## Configuración

- `API_INTERNAL_BASE_URL=http://127.0.0.1:3001`: solo servidor Next.js.
- `WEB_ORIGIN=http://localhost:3000`: obligatorio y HTTPS en producción.
- `WEB_API_TIMEOUT_MS=5000`: entero entre 500 y 30000.

No crear variables `NEXT_PUBLIC_*` para tokens ni URL con credenciales. En producción comprobar que
`Set-Cookie` incluye `HttpOnly`, `Secure`, `SameSite=Lax` y que CSP no contiene `unsafe-eval`.

## Diagnóstico

- Login 401: credenciales uniformemente inválidas o membresía inactiva.
- Login 403: ninguna membresía activa tiene `operations.queue.read`.
- POST 403: origen o CSRF no coincide; no desactivar el control.
- Dashboard 401: ejecutar refresh protegido; si falla, volver a login.
- Dashboard 403: rol/tenant revocado; la API es la autoridad.
- 502/503: comprobar API, flags de cola y timeout; el botón debe recuperarse y mostrar error seguro.

## Verificación y rollback

Ejecutar `pnpm web:verify`, `pnpm auth:verify`, `pnpm operations:verify` y `pnpm validate`. El rollback
web retira el tráfico al dashboard; no cambia esquema. Si existe sospecha de sesión, revocar
membresía/sesiones en backend, no confiar solo en borrar cookies.
