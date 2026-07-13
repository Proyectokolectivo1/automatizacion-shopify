# Deuda técnica

Actualizado: 2026-07-12

No se registra como deuda lo que pertenece a una vertical futura; se registra como backlog.

| ID     | Deuda                                                | Impacto | Plan                                                  |
| ------ | ---------------------------------------------------- | ------- | ----------------------------------------------------- |
| TD-002 | La web no tiene pruebas de componente/E2E todavía    | Bajo    | Añadir Playwright con el primer flujo de usuario      |
| TD-003 | No hay enforcement automático de fronteras modulares | Medio   | Añadir reglas al crear paquetes de dominio/aplicación |
| TD-004 | Node local 22.16.0 difiere del parche fijado 22.23.1 | Medio   | Actualizar toolchain y repetir validación             |
| TD-005 | PostCSS requiere override de seguridad transitivo    | Bajo    | Retirar cuando Next.js incluya PostCSS seguro         |
| TD-006 | MinIO comunitario ya no recibe parches               | Alto    | Sustituir antes de piloto tras decisión de proveedor  |
| TD-007 | Prisma tooling requiere override de Hono 1.19.13     | Bajo    | Retirar cuando Prisma lo resuelva transitivamente     |

## Deuda resuelta

- TD-001: el health check que solo comprobaba proceso fue reemplazado en E0-H3 por liveness y
  readiness reales para PostgreSQL, Redis y MinIO.
- E0-H4A no deja cliente generado versionado: `prisma generate` forma parte obligatoria de build y
  pruebas, evitando artefactos derivados obsoletos en Git.
