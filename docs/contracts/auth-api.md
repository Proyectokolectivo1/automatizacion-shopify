# Contrato HTTP de autenticación E0-H5A

Actualizado: 2026-07-12

## Rutas

- `POST /auth/login`: correo, contraseña y `organizationId`; devuelve access/refresh y expiraciones.
- `POST /auth/refresh`: refresh actual; rota ambos tokens.
- `POST /auth/logout`: Bearer access; revoca la sesión y responde 204.
- `GET /auth/me`: devuelve usuario, organización, rol y sesión autenticados.
- `GET /auth/organizations/:organizationId/admin-check`: demostración protegida que exige
  `organization.manage` y coincidencia de tenant.

Las respuestas que contienen sesión usan `Cache-Control: no-store`. Credenciales inválidas devuelven
el mismo 401 para cuentas existentes o inexistentes; abuso repetido devuelve 429. Los tokens se
envían en body solo en login/refresh y como `Authorization: Bearer` para access. No se aceptan por URL.

Esta vertical no ofrece registro público, invitación ni recuperación: serán E0-H5B y usarán el
adaptador de correo. Tampoco incluye UI de login.
