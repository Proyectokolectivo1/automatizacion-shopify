# Pruebas E1-H1A

`pnpm shopify:verify` crea una base PostgreSQL aleatoria, aplica todas las migraciones, levanta la API
y elimina la base al finalizar.

Cobertura funcional:

- registro concurrente y replay con snapshot;
- dominio canónico, duplicado y entradas SSRF;
- RBAC owner/admin, read-only y tenant ajeno;
- ciphertext sin token y AAD que impide trasplante;
- contrato mock determinista, explícitamente simulado y fallo controlado;
- prueba saludable obligatoria antes de activar;
- activar, desactivar y rotar bajo transacción serializable;
- rotación de versión de clave conservando lectura de sobres anteriores;
- auditoría/métricas acotadas sin dominio completo, token ni clave idempotente;
- flags, simulación y kill switch fail-closed.

No se llama Shopify ni otro proveedor. E1-H2 webhooks queda fuera de alcance.
