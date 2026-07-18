# Seguridad — dashboard web E6-H3A

Actualizado: 2026-07-17

- Access/refresh solo en cookies HttpOnly; no existe uso de localStorage/sessionStorage.
- Cookies `SameSite=Lax`, `Secure` en producción, expiración alineada al token y sin `Domain`.
- Token CSRF CSPRNG separado, double-submit y comparación constante; `Origin` debe ser exacto.
- `WEB_ORIGIN` es obligatorio en producción; NestJS conserva CORS deshabilitado/default-deny.
- Login solo muestra membresías después de verificar credenciales con respuesta uniforme/rate limit.
- Cada request deriva tenant de `/auth/me`; el BFF rechaza IDs de organización en filtros.
- Switch valida membresía en BFF y API, y revoca la sesión anterior antes de crear la nueva.
- CSP, `frame-ancestors 'none'`, nosniff, no-referrer, COOP y Permissions-Policy reducen superficie.
- `unsafe-eval` se habilita únicamente en desarrollo para React Refresh; el build productivo no lo usa.
- Cola web elimina IDs internos/externos, relaciones, email y contenido; los cursores siguen opacos.
- Detalle usa referencias AES-256-GCM de 15 minutos ligadas al tenant; producción exige clave propia.
- Timeout/errores fallan cerrados y nunca copian cuerpos upstream al cliente.

Pendiente antes de piloto: HTTPS/TLS real, proxy confiable, MFA, secret manager y pruebas de carga.
