# Fronteras modulares del API

Actualizado: 2026-07-18.

## Objetivo

`pnpm architecture:verify` impide que infraestructura compartida dependa de dominios funcionales y
que aparezcan colaboraciones entre dominios sin una decisión explícita. El gate inspecciona todos los
imports relativos de `apps/api/src`, falla ante módulos nuevos no registrados y forma parte de
`pnpm validate`, por lo que también se ejecuta en CI.

## Modelo mínimo

- Los archivos directamente bajo `src` son raíces de composición y pueden cablear cualquier módulo.
- Plataforma: `auth`, `config`, `database`, `email`, `foundation`, `generated`, `health` y
  `observability`.
- Dominios: `finance`, `identity`, `operations`, `orders`, `outbox`, `payments`, `rates`,
  `reconciliation`, `shopify` y `whatsapp`.
- Un dominio puede usar plataforma; una colaboración dominio-dominio requiere allowlist exacta.
- Plataforma solo puede apuntar hacia las capacidades inferiores declaradas en el script. Nunca puede
  importar un dominio.
- `generated` no se escanea porque es un artefacto de Prisma, pero sus consumidores sí se verifican.

La dependencia de tipos `observability -> health` fue eliminada: `DependencyStatus` vive ahora en
`foundation`, por lo que el flujo permitido queda `health -> observability -> foundation` sin ciclo.

## Colaboraciones funcionales explícitas

| Origen           | Destino    | Motivo                                                               |
| ---------------- | ---------- | -------------------------------------------------------------------- |
| `outbox`         | `orders`   | El worker despacha clasificación después de sincronizar              |
| `outbox`         | `shopify`  | El worker ejecuta sync y acciones Shopify desde eventos versionados  |
| `reconciliation` | `shopify`  | La conciliación usa el puerto/cifrado del proveedor Shopify          |
| `shopify`        | `orders`   | Alta de tienda instala la política inicial de clasificación          |
| `whatsapp`       | `identity` | Claim y revocación comparten el mismo lock advisory por organización |

El gate exige que cada excepción siga ejercida. Si desaparece su último import, debe retirarse la
entrada para que la allowlist no se convierta en permiso histórico genérico.

## Alcance del analizador

El script usa solo Node y reconoce `import`, `export ... from`, `import()` y `require()` con specifier
literal relativo. Rechaza escapes fuera de `apps/api/src`. El proyecto no usa aliases TypeScript; si
se introducen, el gate debe resolverlos antes de aprobarlos. No reemplaza typecheck ni ESLint: los
complementa con reglas de arquitectura que esas herramientas no expresan actualmente.

## Añadir o dividir un módulo

1. Mantener el código en un módulo existente cuando la responsabilidad coincida.
2. Si el directorio nuevo representa una responsabilidad real, registrarlo como plataforma o dominio.
3. Para una colaboración entre dominios, documentar el flujo y añadir el par exacto; nunca habilitar
   todos los destinos de un dominio.
4. Añadir un fixture de denegación si la nueva regla crea otra clase de borde.
5. Ejecutar `pnpm architecture:verify` y después `pnpm validate`.
