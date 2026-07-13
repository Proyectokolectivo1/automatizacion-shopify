# Identidad, sesiones y autorización

Actualizado: 2026-07-12

La autenticación usa contraseñas Argon2id y sesiones opacas conservadas en PostgreSQL. El cliente
recibe un access token corto y un refresh token; la base guarda únicamente SHA-256 del componente
secreto. Ambos tokens contienen solo el UUID de sesión y 256 bits aleatorios, sin correo, rol ni PII.

El refresh rota access y refresh en una actualización condicional. Reutilizar un refresh anterior
revoca toda la sesión. Logout, expiración, usuario deshabilitado o membresía revocada invalidan el
acceso en backend de forma inmediata.

La membresía une usuario y organización con un rol. Los guards autentican primero y aplican después
una política default-deny; el `organizationId` de la ruta debe coincidir con la sesión. El frontend no
es autoridad de permisos.

El rate limit se comparte mediante PostgreSQL y persiste únicamente un hash de correo normalizado e
IP. Sus filas vencidas se limpian periódicamente. Login, refresh, logout y denegaciones RBAC se
auditan sin contraseñas ni tokens y alimentan métricas Prometheus de cardinalidad acotada.
