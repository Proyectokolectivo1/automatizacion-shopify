# Identidad, sesiones y autorización

Actualizado: 2026-07-14

La autenticación usa Argon2id y sesiones opacas conservadas en PostgreSQL. El cliente recibe access
corto y refresh rotativo; la base guarda únicamente SHA-256 del componente secreto. Reutilizar un
refresh anterior revoca la sesión. Logout, expiración, usuario deshabilitado o membresía revocada
invalidan el acceso en backend.

La membresía une usuario y organización con un rol. Los guards aplican default-deny y exigen que el
`organizationId` de la ruta coincida con la sesión. Owner/admin administran; una invitación nunca
puede crear otro owner y un admin tampoco puede asignar admin.

`account_action_tokens` modela invitación y password reset con propósito explícito, hash único,
vencimiento y estados consumido/revocado. La forma de cada propósito se protege con constraints SQL.
El consumo usa bloqueo de fila; la emisión concurrente para el mismo sujeto usa advisory lock
transaccional. Así, replay o consumidores concurrentes solo producen un efecto.

Una invitación crea una cuenta con el password recibido o vincula una cuenta existente sin cambiar
su password. Una recuperación rota el hash Argon2id y revoca todas las sesiones dentro de la misma
transacción. El rate limit durable separa login y recuperación mediante scopes hashados.

E0-H5C añade un bootstrap local serializable y una frontera administrativa de membresías. El
bootstrap toma credenciales solo del entorno, se bloquea globalmente y no admite argumentos. Las
mutaciones se serializan por organización, persisten snapshots idempotentes y revocan sesiones del
usuario afectado en la misma transacción. La API aplica tenant y `identity.manage`; owner administra
terceros y admin no puede gestionar ni asignar owner/admin. El último owner y toda auto-mutación
quedan protegidos.

Flags y kill switches están cerrados por defecto. El correo se ejecuta solo en simulación mientras
DP-001 siga pendiente. Auditoría y métricas registran outcomes y UUID internos, nunca correo, IP,
password, token, secreto o clave idempotente cruda.
