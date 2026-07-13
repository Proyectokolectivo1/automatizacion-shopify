# Secretos de desarrollo

- `.env.example` contiene nombres y valores no sensibles; las contraseñas quedan vacías.
- `pnpm infra:bootstrap` crea secretos aleatorios de 256 bits en `.env`.
- `.env` está excluido de Git y no debe copiarse a CI ni producción.
- Los servicios solo publican puertos en `127.0.0.1`.
- Las credenciales de desarrollo no son credenciales de proveedores ni son válidas para producción.
- `docker compose config` puede materializar variables; no publique su salida completa.

La configuración productiva deberá usar un gestor de secretos y credenciales distintas. Esa decisión
no pertenece a E0-H2.

## Riesgo MinIO

El repositorio comunitario de MinIO fue archivado en 2026. Su último contenedor público está afectado
por CVE-2026-33322 cuando se configura OIDC y un atacante conoce el client secret. Este entorno no
configura OIDC, solo escucha en localhost y es exclusivamente local. La imagen queda prohibida para
producción; elegir AIStor u otro almacenamiento requiere análisis de licencia, costo y un ADR.
