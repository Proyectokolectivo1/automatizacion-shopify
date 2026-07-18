# Arquitectura — dashboard web seguro

Actualizado: 2026-07-17

## Flujo

E6-H3A convierte Next.js en BFF. El navegador solo llama rutas `/api/*` del mismo origen y nunca
recibe el access/refresh token de NestJS. El BFF mantiene ambos tokens en cookies HttpOnly,
`SameSite=Lax`, `Secure` en producción y `Path=/`.

El inicio de sesión tiene dos pasos lógicos:

1. `/auth/login-options` verifica correo/contraseña y devuelve membresías activas autorizadas.
2. El BFF elige la única opción o presenta esa lista; antes de `/auth/login` vuelve a verificar que el
   UUID elegido pertenece a la respuesta del backend.

Después del login, `/api/dashboard` consulta `/auth/me`, deriva `organizationId` del principal y solo
entonces solicita organizaciones, resumen y cola. No acepta un tenant desde query/cookie/storage. El
cambio de organización valida la lista actual y NestJS vuelve a comprobar la membresía dentro de una
rotación atómica de sesión.

## Proyección web

El BFF conserva conteos, enums, fechas y cursor opaco. Elimina `itemId`, `storeId`, relaciones, email,
user/session IDs y cualquier identificador de recurso antes de responder al navegador. No persiste
datos, suma páginas parciales ni redefine la política de atención v1.

## Límites

El dashboard es solo lectura. No existen mutaciones operativas, alertas, exports ni conexiones a
proveedores reales. El timeout interno es 5 segundos por defecto y está acotado a 0,5–30 segundos.
