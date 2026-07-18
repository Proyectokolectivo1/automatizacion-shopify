# Seguridad de export operativo E6-H7A

- Solo OWNER/ADMIN; OPERATIONS y demás roles no poseen el permiso masivo.
- Tenant siempre deriva de sesión y se aplica dentro de cada rama SQL del read model.
- Máximo 7 días, 1.000 filas y cinco columnas operativas sin UUID/PII/relaciones.
- Rate limit durable: cinco solicitudes por ventana para usuario+tenant+IP; exceder devuelve `429`.
- El serializador antepone `'` si el primer carácter significativo es `=`, `+`, `-` o `@`, o ante
  tab/retorno; duplica comillas y encierra todas las celdas.
- No se persiste el CSV ni se envía a proveedores, correo, WhatsApp, S3/MinIO o jobs.
- Auditoría guarda filtros/conteo/truncado, nunca filas; métrica usa solo `outcome`.
- Flag y kill switch independientes fallan cerrados.
