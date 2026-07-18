import { describe, expect, it, vi } from 'vitest';

import type { EnvironmentService } from '../src/config/environment.service';
import type { PrismaService } from '../src/database/prisma.service';
import type { ShopifyCredentialCipher } from '../src/shopify/shopify-credential-cipher';
import { ShopifyOrderActionService } from '../src/shopify/shopify-order-action.service';
import type { ShopifyProvider } from '../src/shopify/shopify-provider';

const organizationId = '00000000-0000-4000-8000-000000000001';
const storeId = '00000000-0000-4000-8000-000000000002';
const orderId = '00000000-0000-4000-8000-000000000003';
const intentId = '00000000-0000-4000-8000-000000000004';
const eventId = '00000000-0000-4000-8000-000000000005';

const createSubject = (action: 'cancel' | 'mark', cancelEnabled: boolean) => {
  const order = {
    currentState: 'ABANDONO_PAGO_TRANSPORTE',
    id: orderId,
    shopifyOrderId: '987654321',
    store: { shopifyShopDomain: 'example.myshopify.com' },
  };
  const transaction = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    order: {
      findFirst: vi.fn().mockResolvedValue(order),
      update: vi.fn().mockResolvedValue({}),
    },
    orderStateHistory: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    $transaction: vi.fn(async (operation: (client: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
    ),
    integrationConnection: {
      findFirst: vi.fn().mockResolvedValue({ encryptedCredentialsJson: { redacted: true } }),
    },
    order: { findFirst: vi.fn().mockResolvedValue(order) },
    outboxEvent: {
      findFirst: vi.fn().mockResolvedValue({
        aggregateId: orderId,
        causationId: intentId,
        payloadJson: { action, orderId, paymentIntentId: intentId, storeId },
      }),
    },
    paymentIntent: {
      findFirst: vi.fn().mockResolvedValue({ abandonmentAction: action.toUpperCase() }),
    },
  } as unknown as PrismaService;
  const applyOrderAction = vi.fn().mockResolvedValue({
    alreadyApplied: false,
    mode: 'live',
    remoteJobId: action === 'cancel' ? 'gid://shopify/Job/1' : null,
  });
  const provider = { applyOrderAction } as unknown as ShopifyProvider;
  const cipher = {
    decrypt: vi.fn().mockReturnValue('secret-token'),
  } as unknown as ShopifyCredentialCipher;
  const environment = {
    shopifyOrderActions: { cancelEnabled, enabled: true, killSwitch: false },
  } as EnvironmentService;
  return {
    applyOrderAction,
    service: new ShopifyOrderActionService(cipher, environment, prisma, provider),
    transaction,
  };
};

describe('ShopifyOrderActionService', () => {
  it('validates and applies a mark action without changing the local order state', async () => {
    const subject = createSubject('mark', false);
    await expect(
      subject.service.apply({ correlationId: 'correlation-1', eventId, organizationId }),
    ).resolves.toBeUndefined();
    expect(subject.applyOrderAction).toHaveBeenCalledWith({
      accessToken: 'secret-token',
      action: 'mark',
      orderId: '987654321',
      shopDomain: 'example.myshopify.com',
    });
    expect(subject.transaction.order.update).not.toHaveBeenCalled();
    expect(subject.transaction.auditLog.create).toHaveBeenCalledOnce();
  });

  it('blocks cancellation unless explicitly enabled and records the terminal state when enabled', async () => {
    const blocked = createSubject('cancel', false);
    await expect(
      blocked.service.apply({ correlationId: 'correlation-2', eventId, organizationId }),
    ).rejects.toThrow('cancellation is disabled');
    expect(blocked.applyOrderAction).not.toHaveBeenCalled();

    const enabled = createSubject('cancel', true);
    await expect(
      enabled.service.apply({ correlationId: 'correlation-3', eventId, organizationId }),
    ).resolves.toBeUndefined();
    expect(enabled.transaction.orderStateHistory.createMany).toHaveBeenCalledOnce();
    expect(enabled.transaction.order.update).toHaveBeenCalledOnce();
    const update = enabled.transaction.order.update.mock.calls[0]?.[0] as unknown as {
      data: { cancelledAt: Date; currentState: string; version: { increment: number } };
      where: { id: string };
    };
    expect(update).toMatchObject({
      data: { currentState: 'CANCELLED', version: { increment: 1 } },
      where: { id: orderId },
    });
    expect(update.data.cancelledAt).toBeInstanceOf(Date);
  });
});
