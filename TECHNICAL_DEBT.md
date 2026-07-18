# Deuda técnica

Actualizado: 2026-07-15

No se registra como deuda lo que pertenece a una vertical futura; se registra como backlog.

La publicación en GitHub no añadió deuda técnica. La revocación del PAT expuesto se registra como
riesgo R-023 y trabajo de seguridad SEC-001, no como deuda de código.

| ID     | Deuda                                                  | Impacto | Plan                                                        |
| ------ | ------------------------------------------------------ | ------- | ----------------------------------------------------------- |
| TD-002 | La web no tiene pruebas de componente/E2E todavía      | Bajo    | Añadir Playwright con el primer flujo de usuario            |
| TD-003 | No hay enforcement automático de fronteras modulares   | Medio   | Añadir reglas al crear paquetes de dominio/aplicación       |
| TD-004 | Node local 22.16.0 difiere del parche fijado 22.23.1   | Medio   | Actualizar toolchain y repetir validación                   |
| TD-005 | PostCSS requiere override de seguridad transitivo      | Bajo    | Retirar cuando Next.js incluya PostCSS seguro               |
| TD-006 | MinIO comunitario ya no recibe parches                 | Alto    | Sustituir antes de piloto tras decisión de proveedor        |
| TD-007 | Prisma tooling requiere override de Hono 1.19.13       | Bajo    | Retirar cuando Prisma lo resuelva transitivamente           |
| TD-008 | Sesiones expiradas/revocadas aún no se archivan        | Bajo    | Definir retención y limpieza con la política legal          |
| TD-009 | Tokens de cuenta terminales aún no se purgan           | Bajo    | Añadir job tras aprobar retención legal DP-003              |
| TD-010 | Checks ownership legacy aún están `NOT VALID`          | Medio   | Verificar cero nulos y validar en migración contract        |
| TD-011 | Claves idempotentes expiradas aún no se purgan         | Bajo    | Añadir job tras aprobar retención legal DP-003              |
| TD-012 | Re-cifrado masivo de keyring aún no tiene job          | Medio   | Añadir job auditado antes de conectar tiendas reales        |
| TD-013 | Normalizador monetario asume dos decimales             | Bajo    | Generalizar por moneda antes de admitir tiendas no COP      |
| TD-014 | Políticas de clasificación no tienen API/UI segura     | Medio   | Añadir gestión RBAC, preview y activación auditada          |
| TD-015 | Conciliación solo se ejecuta manualmente               | Medio   | Añadir scheduler con solape, rate limit y alertas           |
| TD-016 | Consulta de incidencias no tiene cursor                | Bajo    | Añadir paginación por cursor al construir la consola        |
| TD-017 | Políticas de tarifa no tienen listado ni consola UI    | Medio   | Añadir consulta paginada y flujo de aprobación seguro       |
| TD-018 | Prisma/pg avisa sobre query concurrente en tests       | Bajo    | Revalidar adaptador antes de actualizar a pg 9              |
| TD-019 | Schedulers de pago viven dentro del proceso API        | Medio   | Moverlos al worker-payments conservando locks y gates       |
| TD-020 | Estado authoritative del mock Wompi vive en memoria    | Medio   | Usar sandbox o fixture durable antes de pruebas largas      |
| TD-021 | Servicios de mutación repiten el protocolo idempotente | Medio   | Extraer una primitiva común sin alterar scopes ni snapshots |
| TD-022 | El mock WhatsApp se invoca dentro de la transacción DB | Medio   | Mover el adaptador real a worker/outbox antes de Meta       |
| TD-023 | Contenido inbound vencido aún no tiene job de purga    | Alto    | Implementar purga auditable antes de aceptar tráfico real   |

## Deuda resuelta

- TD-001: el health check que solo comprobaba proceso fue reemplazado en E0-H3 por liveness y
  readiness reales para PostgreSQL, Redis y MinIO.
- E0-H4A no deja cliente generado versionado: `prisma generate` forma parte obligatoria de build y
  pruebas, evitando artefactos derivados obsoletos en Git.
- E0-H4B eliminó el pool PostgreSQL paralelo del readiness; API y health comparten el lifecycle Prisma.
- E0-H4C eliminó la colisión de replay BullMQ mediante versiones de entrega independientes.
- E0-H5C eliminó la ausencia de bootstrap y la administración manual insegura de membresías.
- E1-H1A evita deuda de proveedor al mantener contrato y mock detrás de `ShopifyProvider`.
- E1-H2A no persiste cuerpos webhook ni secretos en claro; la consulta/normalización del pedido es
  trabajo funcional E1-H3A y permanece en backlog, no se registra como deuda.
- E1-H3A resolvió la ausencia de pedido durable sin acoplarlo al payload webhook y con protección de
  snapshots tardíos.
- E1-H5A resolvió el reproceso ad hoc mediante incidencias durables y outbox sin mutación manual.
- E3-H1A usa el registro genérico y un límite de proveedor explícito; el adaptador Meta, plantillas y
  mensajes son trabajo funcional pendiente y no se presentan como deuda ni como integración real.
- E3-H3A mantiene la llamada dentro de la transacción solo porque el proveedor vinculado es local,
  determinista y sin red; conectar Meta exige resolver TD-022.
- E3-H4A resolvió la ausencia de evidencia durable de estados simulados con dedupe, historial
  inmutable y transiciones monotónicas; el payload/firma Meta real sigue siendo trabajo funcional.
