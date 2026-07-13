# Estrategia de pruebas E0-H4A

`pnpm database:verify` usa PostgreSQL real y una base temporal independiente. Verifica:

1. migración desde base vacía y segunda aplicación no-op;
2. estado actualizado y ausencia de drift Prisma/SQL;
3. conexión y consulta mediante Prisma + adapter-pg;
4. cuatro tablas y un único registro de migración;
5. FK organización-tienda;
6. dominio Shopify y moneda canónicos;
7. unicidad `(scope, key)`;
8. consistencia de intentos y estado publicado del outbox;
9. eliminación final de la base temporal.

La evidencia histórica de esta suite no valida publicación, locks, reintentos ni DLQ; esos casos se
validan por separado en `e0-h4b-outbox.md`.
