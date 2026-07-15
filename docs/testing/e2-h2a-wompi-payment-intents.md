# Evidencia E2-H2A: intención Wompi simulada

`pnpm wompi:verify` ejecuta dos pruebas del contrato criptográfico y cuatro pruebas HTTP/PostgreSQL.

Se verifica orden de firma, parámetros oficiales, host `.invalid`, monto COP, expiración, fixture
sintético, rechazo de monto enviado por cliente, RBAC, tenant isolation, concurrencia, respuesta
perdida, replay con nueva clave, una sola intención y un solo evento outbox.

`pnpm database:verify` comprueba 14 migraciones y constraints de ownership, proveedor Wompi, importe
positivo, COP, intento positivo y expiración posterior a creación. No existe tráfico externo, PII ni
credenciales reales.
