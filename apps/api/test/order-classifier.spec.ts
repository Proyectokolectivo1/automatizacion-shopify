import { describe, expect, it } from 'vitest';

import { DEFAULT_ORDER_CLASSIFICATION_POLICY } from '../src/orders/order-classification-policy';
import { OrderClassifier } from '../src/orders/order-classifier';

describe('OrderClassifier', () => {
  const classifier = new OrderClassifier();

  it('classifies paid evidence as prepaid', () => {
    expect(
      classifier.classify(DEFAULT_ORDER_CLASSIFICATION_POLICY, {
        financial_status: 'PAID',
        payment_gateway_names: ['Synthetic_Gateway'],
        tags: [],
      }),
    ).toEqual({ paymentMode: 'PREPAID', policyRuleId: 'prepaid-paid', priority: 100 });
  });

  it('classifies a configurable tag as cash on delivery', () => {
    expect(
      classifier.classify(DEFAULT_ORDER_CLASSIFICATION_POLICY, {
        financial_status: 'pending',
        tags: 'campaign, ContraEntrega',
      }),
    ).toEqual({ paymentMode: 'COD', policyRuleId: 'cod-tag', priority: 90 });
  });

  it('fails closed when no rule matches', () => {
    expect(() =>
      classifier.classify(DEFAULT_ORDER_CLASSIFICATION_POLICY, {
        financial_status: 'pending',
        tags: [],
      }),
    ).toThrowError(expect.objectContaining({ code: 'NO_MATCH' }));
  });

  it('fails closed for contradictory rules at the same priority', () => {
    expect(() =>
      classifier.classify(
        {
          rules: [
            {
              financialStatuses: ['paid'],
              id: 'prepaid',
              paymentMode: 'prepaid',
              priority: 100,
            },
            {
              financialStatuses: ['paid'],
              id: 'cod',
              paymentMode: 'cod',
              priority: 100,
            },
          ],
          schemaVersion: 1,
        },
        { financial_status: 'paid' },
      ),
    ).toThrowError(expect.objectContaining({ code: 'AMBIGUOUS_MATCH' }));
  });

  it('rejects invalid policy and snapshot contracts with bounded error codes', () => {
    expect(() => classifier.classify({ rules: [], schemaVersion: 1 }, {})).toThrowError(
      expect.objectContaining({ code: 'INVALID_POLICY' }),
    );
    expect(() => classifier.classify(DEFAULT_ORDER_CLASSIFICATION_POLICY, {})).toThrowError(
      expect.objectContaining({ code: 'INVALID_SNAPSHOT' }),
    );
  });
});
