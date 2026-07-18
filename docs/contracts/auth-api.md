# Contrato HTTP de autenticación E0-H5

Actualizado: 2026-07-17

## Sesiones

- `POST /auth/login`: correo, contraseña y `organizationId`; devuelve access/refresh y expiraciones.
- `POST /auth/refresh`: rota ambos tokens usando el refresh vigente.
- `POST /auth/logout`: exige Bearer access, revoca la sesión y responde 204.
- `GET /auth/me`: devuelve usuario, organización, rol y sesión autenticados.
- `POST /auth/login-options`: valida correo/contraseña y devuelve únicamente membresías activas,
  nombre, rol y capacidad de dashboard; no crea sesión ni devuelve tokens.
- `GET /auth/organizations`: exige Bearer y devuelve las membresías activas del usuario autenticado.
- `POST /auth/switch-organization`: exige Bearer y membresía activa en el destino; revoca la sesión
  actual y devuelve un par nuevo ligado a la organización seleccionada.
- `GET /auth/organizations/:organizationId/admin-check`: exige `organization.manage` y coincidencia de tenant.

## Invitaciones

- `POST /auth/organizations/:organizationId/invitations`: exige sesión owner/admin, recibe correo y rol, responde 202 sin devolver token. Owner no puede invitar otro owner; admin no puede asignar owner/admin.
- `POST /auth/invitations/accept`: recibe token y contraseña. Crea usuario nuevo o vincula uno existente sin reemplazar su contraseña ni cambiar una membresía activa. Responde 200 una sola vez.

## Recuperación

- `POST /auth/password-recovery/request`: recibe correo y siempre responde 202 con el mismo cuerpo, exista o no una cuenta, esté bloqueado el control o falle la entrega.
- `POST /auth/password-recovery/complete`: recibe token y contraseña nueva; actualiza Argon2id, desbloquea la cuenta, revoca todas sus sesiones y consume el token.

Las respuestas sensibles usan `Cache-Control: no-store`. Los tokens no se aceptan en URL ni se devuelven al crear una invitación/solicitud. Token inválido, vencido, revocado o repetido recibe el mismo 400. Los controles `AUTH_ACCOUNT_ACTIONS_ENABLED` y `AUTH_ACCOUNT_ACTIONS_KILL_SWITCH` bloquean creación/consumo; la solicitud de recuperación conserva su 202 uniforme.

No existe registro público ni administración genérica de roles. La UI consume estas rutas solo desde
su BFF y nunca devuelve los tokens al JavaScript del navegador.
