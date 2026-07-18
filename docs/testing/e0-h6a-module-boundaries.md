# Evidencia E0-H6A — fronteras modulares

Actualizado: 2026-07-18.

## Comandos

```powershell
pnpm architecture:verify
pnpm validate
```

## Cobertura observable

El gate actual inspecciona 123 archivos TypeScript fuente y 529 imports relativos. Confirma las cinco
colaboraciones dominio-dominio declaradas y ejecuta ocho fixtures internos:

- permitidos: raíz de composición a dominio, dominio a auth, observabilidad a foundation y outbox a
  Shopify;
- prohibidos: config a Shopify, observabilidad a health, payments a WhatsApp y módulo no registrado.

También falla si un import relativo escapa `apps/api/src`, si aparece un directorio no registrado o si
queda una excepción dominio-dominio sin uso. La salida solo contiene rutas, líneas y nombres de
módulos; no procesa variables de entorno, payloads, datos ni secretos.

## Resultado

`architecture:verify` pasa con cinco colaboraciones explícitas y los ocho fixtures allow/deny. El tipo
compartido de dependencia se movió a `foundation` y ya no existe el borde inverso
`observability -> health`. El gate está incluido en `validate` y, por transitividad, en GitHub Actions.
