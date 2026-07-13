# Decisiones y supuestos

Actualizado: 2026-07-12

| ID     | Tipo               | Decisión o supuesto                                                                 | Estado              |
| ------ | ------------------ | ----------------------------------------------------------------------------------- | ------------------- |
| D-001  | DECISIÓN           | Monolito modular con workers separados por proceso                                  | ACEPTADA; ADR-001   |
| D-002  | DECISIÓN           | Node 22.23.1 LTS, pnpm 10.25.0, NestJS 11.1.28, Next.js 15.5.20 y React 19.2.7      | ACEPTADA para E0-H1 |
| D-003  | DECISIÓN           | Forzar PostCSS 8.5.10 mediante override por GHSA-qx2v-qp2m-jg93                     | ACEPTADA temporal   |
| D-004  | DECISIÓN           | PostgreSQL 17.10, Redis 7.4.9 y MinIO 2025-09-07 para desarrollo local              | ACEPTADA para E0-H2 |
| D-005  | DECISIÓN           | MinIO comunitario solo en localhost y prohibido para producción                     | ACEPTADA temporal   |
| D-006  | DECISIÓN           | Puertos host 5433, 6380, 9100 y 9101 para no interferir con servicios existentes    | ACEPTADA local      |
| S-001  | SUPUESTO RESUELTO  | La especificación es fuente principal y el prompt adjunto añade protocolo operativo | CONFIRMADO          |
| S-002  | SUPUESTO           | La rama existente `master` se conserva; no se renombra sin autorización             | ACTIVO              |
| DP-001 | DECISIÓN PENDIENTE | Dominio y proveedor de correo                                                       | PENDIENTE           |
| DP-002 | DECISIÓN PENDIENTE | Cancelar o marcar pedidos COD vencidos                                              | PENDIENTE           |
| DP-003 | DECISIÓN PENDIENTE | Política legal de retención y no reembolso                                          | PENDIENTE           |
| DP-004 | DECISIÓN PENDIENTE | Fórmula de costo de producto y atribución publicitaria                              | PENDIENTE           |
| DP-005 | DECISIÓN PENDIENTE | RPO/RTO aceptados contractualmente                                                  | PENDIENTE           |

Las versiones se fijan sin rangos. Node 22 permanece en LTS y satisface NestJS 11 (Node >=20) y
Next.js 15 (Node >=18.18). Una actualización mayor requiere verificación, ADR cuando cambie la
arquitectura y aprobación conforme a la especificación.
