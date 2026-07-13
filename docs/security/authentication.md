# Seguridad de autenticación

Actualizado: 2026-07-12

- Argon2id v1: 19 MiB, 2 iteraciones, paralelismo 1 y salida de 32 bytes; parámetros versionados por usuario.
- Contraseña admitida por la API: 12 a 128 caracteres; hash con salt generado por Argon2.
- Verificación dummy para reducir enumeración temporal de cuentas.
- Tokens opacos con 256 bits CSPRNG; solo hashes SHA-256 en PostgreSQL.
- Access 15 minutos y refresh 30 días por defecto; expiración y revocación se validan server-side.
- Refresh rotativo con detección de replay y revocación de la sesión.
- Rate limit durable y bloqueo temporal después de intentos fallidos.
- RBAC default-deny y tenant validado en backend.
- Auditoría y métricas sin contraseña, correo, IP, Authorization ni token.

La API presupone HTTPS en despliegue y hoy recibe Bearer tokens. La UI futura deberá evitar
`localStorage`; el mecanismo final cookie/CSRF se decidirá antes del piloto. MFA queda fuera del MVP,
pero usuario, sesión y auditoría permiten incorporarlo.
