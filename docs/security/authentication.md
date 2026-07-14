# Seguridad de autenticación

Actualizado: 2026-07-14

- Argon2id v1: 19 MiB, 2 iteraciones, paralelismo 1, salida 32 bytes y parámetros versionados.
- Password de API: 12 a 128 caracteres; salt generado por Argon2.
- Verificación dummy y respuestas uniformes contra enumeración de login/recuperación.
- Tokens opacos CSPRNG de 256 bits; únicamente SHA-256 en PostgreSQL.
- Access 15 minutos, refresh 30 días, invitación 24 horas y reset 30 minutos por defecto.
- Refresh rotativo con detección de replay; invitación/reset con consumo de fila atómico.
- Recuperar password revoca todas las sesiones activas en la misma transacción.
- Rate limit durable separado por scope y bloqueo temporal de login.
- RBAC default-deny, tenant en backend y jerarquía de invitación sin escalamiento.
- Auditoría/métricas sin correo, IP, Authorization, password, token, secreto ni clave cruda.
- Acciones de cuenta y correo desactivados/kill-switch activo; modo real sin proveedor falla cerrado.
- Operaciones DLQ requieren `outbox.manage`, tenant coincidente y controles fail-closed.
- La API DLQ no devuelve payload y guarda la clave idempotente solo como SHA-256.
- E0-H5C prohíbe auto-mutaciones, protege el último owner y evita escalamiento admin→owner.
- El bootstrap es local, no acepta argumentos y su secreto solo existe en el entorno del proceso.
- Administración de identidad requiere `identity.manage`, flag explícito y kill switch desactivado.
- Cambiar rol o revocar membresía invalida todas las sesiones afectadas en la misma transacción.

La API presupone HTTPS en despliegue. La UI futura no debe usar `localStorage`; cookie/CSRF, proxy
confiable y MFA deberán resolverse antes del piloto.
