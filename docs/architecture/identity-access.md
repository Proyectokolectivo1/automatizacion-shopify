# Identidad, sesiones y autorización

Actualizado: 2026-07-13

La autenticación usa Argon2id y sesiones opacas conservadas en PostgreSQL. El cliente recibe access corto y refresh rotativo; la base guarda únicamente SHA-256 del componente secreto. Reutilizar un refresh anterior revoca la sesión. Logout, expiración, usuario deshabilitado o membresía revocada invalidan el acceso en backend.

La membresía une usuario y organización con un rol. Los guards aplican default-deny y exigen que el `organizationId` de la ruta coincida con la sesión. Owner/admin administran; una invitación nunca puede crear otro owner y un admin tampoco puede asignar admin.

`account_action_tokens` modela invitación y password reset con propósito explícito, hash único, vencimiento y estados consumido/revocado. La forma de cada propósito se protege con constraints SQL. El consumo usa bloqueo de fila; la emisión concurrente para el mismo sujeto usa advisory lock transaccional. Así, replay o consumidores concurrentes solo producen un efecto.

Una invitación crea una cuenta con el password recibido o vincula una cuenta existente sin cambiar su password. Una recuperación rota el hash Argon2id y revoca todas las sesiones dentro de la misma transacción. El rate limit durable separa login y recuperación mediante scopes hashados.

Feature flag y kill switch de acciones de cuenta están cerrados por defecto. El correo se ejecuta solo en simulación verificable mientras DP-001 siga pendiente. Auditoría y métricas registran outcomes y UUID internos, nunca correo, IP, password o token.
