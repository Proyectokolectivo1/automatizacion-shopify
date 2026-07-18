# Seguridad — resumen operativo

Actualizado: 2026-07-17

## Acceso

- Sesión, coincidencia de organización y RBAC default-deny son obligatorios.
- Se comparte `operations.queue.read`: el resumen deriva de la misma fuente y revela menos detalle.
- Support, finance, logistics y read-only permanecen denegados.
- Cada rama SQL conserva su propio filtro `organization_id` antes del agregado.

## Minimización y costo

La salida contiene únicamente enums y números. No selecciona columnas de PII, contenido, payload,
secreto o ID externo/interno de recurso. La ventana obligatoria de máximo 31 días, los filtros
enumerados y los índices por tenant limitan abuso y scans no acotados.

La auditoría guarda tipo, presencia de filtro, duración y total; no almacena UUID de tienda ni rango
crudo. La métrica solo usa `action=summary` y resultado. Feature flag y kill switch fallan cerrados.
