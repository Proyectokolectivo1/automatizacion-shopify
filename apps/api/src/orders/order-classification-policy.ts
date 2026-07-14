export const DEFAULT_ORDER_CLASSIFICATION_POLICY = {
  rules: [
    {
      financialStatuses: ['paid'],
      id: 'prepaid-paid',
      paymentMode: 'prepaid',
      priority: 100,
    },
    {
      id: 'cod-tag',
      paymentMode: 'cod',
      priority: 90,
      tagsAny: ['contraentrega', 'cod'],
    },
  ],
  schemaVersion: 1,
} as const;
