# Evidencia E2-H1A: tarifas de transporte

`pnpm transport-rates:verify` genera Prisma y ejecuta cinco pruebas unitarias del resolvedor y tres
pruebas HTTP/PostgreSQL sobre una base temporal migrada desde cero.

La cobertura funcional verifica prioridad, especificidad, alcance de tienda, vigencia, normalización,
ausencia y contradicción fail-closed; además prueba creación/activación, RBAC, tenant isolation,
concurrencia, replay de respuesta perdida, una sola decisión y un solo evento outbox.

`pnpm database:verify` comprueba 13 migraciones, reaplicación no-op, ausencia de drift, una única
política activa por alcance, moneda COP, importes positivos y ventanas temporales válidas.

No se usan PII ni proveedores reales. Los pedidos, usuarios, direcciones y productos son sintéticos.
