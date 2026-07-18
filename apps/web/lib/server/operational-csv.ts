import type { OperationalExport } from '../contracts';

const HEADERS = [
  'occurred_at',
  'type',
  'status',
  'requires_attention',
  'attention_reason',
] as const;

function csvCell(value: boolean | string | null): string {
  const raw = value === null ? '' : String(value);
  const first = raw.codePointAt(0);
  const firstSignificant = raw.trimStart()[0];
  const protectedValue =
    (firstSignificant !== undefined && '=+-@'.includes(firstSignificant)) ||
    first === 9 ||
    first === 13
      ? `'${raw}`
      : raw;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function operationalExportCsv(value: OperationalExport): string {
  const lines = [
    HEADERS.map(csvCell).join(','),
    ...value.rows.map((row) =>
      [row.occurredAt, row.type, row.status, row.requiresAttention, row.attentionReason]
        .map(csvCell)
        .join(','),
    ),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
