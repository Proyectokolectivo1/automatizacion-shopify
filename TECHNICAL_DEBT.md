# Deuda técnica

Actualizado: 2026-07-14

No se registra como deuda lo que pertenece a una vertical futura; se registra como backlog.

La publicación en GitHub no añadió deuda técnica. La revocación del PAT expuesto se registra como
riesgo R-023 y trabajo de seguridad SEC-001, no como deuda de código.

| ID     | Deuda                                                | Impacto | Plan                                                  |
| ------ | ---------------------------------------------------- | ------- | ----------------------------------------------------- |
| TD-002 | La web no tiene pruebas de componente/E2E todavía    | Bajo    | Añadir Playwright con el primer flujo de usuario      |
| TD-003 | No hay enforcement automático de fronteras modulares | Medio   | Añadir reglas al crear paquetes de dominio/aplicación |
| TD-004 | Node local 22.16.0 difiere del parche fijado 22.23.1 | Medio   | Actualizar toolchain y repetir validación             |
| TD-005 | PostCSS requiere override de seguridad transitivo    | Bajo    | Retirar cuando Next.js incluya PostCSS seguro         |
| TD-006 | MinIO comunitario ya no recibe parches               | Alto    | Sustituir antes de piloto tras decisión de proveedor  |
| TD-007 | Prisma tooling requiere override de Hono 1.19.13     | Bajo    | Retirar cuando Prisma lo resuelva transitivamente     |
| TD-008 | Sesiones expiradas/revocadas aún no se archivan      | Bajo    | Definir retención y limpieza con la política legal    |
| TD-009 | Tokens de cuenta terminales aún no se purgan         | Bajo    | Añadir job tras aprobar retención legal DP-003        |
| TD-010 | Checks ownership legacy aún están `NOT VALID`        | Medio   | Verificar cero nulos y validar en migración contract  |
| TD-011 | Claves idempotentes expiradas aún no se purgan       | Bajo    | Añadir job tras aprobar retención legal DP-003        |
| TD-012 | Re-cifrado masivo de keyring aún no tiene job        | Medio   | Añadir job auditado antes de conectar tiendas reales  |

## Deuda resuelta

- TD-001: el health check que solo comprobaba proceso fue reemplazado en E0-H3 por liveness y
  readiness reales para PostgreSQL, Redis y MinIO.
- E0-H4A no deja cliente generado versionado: `prisma generate` forma parte obligatoria de build y
  pruebas, evitando artefactos derivados obsoletos en Git.
- E0-H4B eliminó el pool PostgreSQL paralelo del readiness; API y health comparten el lifecycle Prisma.
- E0-H4C eliminó la colisión de replay BullMQ mediante versiones de entrega independientes.
- E0-H5C eliminó la ausencia de bootstrap y la administración manual insegura de membresías.
- E1-H1A evita deuda de proveedor al mantener contrato y mock detrás de `ShopifyProvider`.
