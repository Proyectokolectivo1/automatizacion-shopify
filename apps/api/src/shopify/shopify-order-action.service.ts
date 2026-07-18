import { ConflictException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { ShopifyCredentialCipher } from './shopify-credential-cipher';
import { SHOPIFY_PROVIDER, type ShopifyProvider } from './shopify-provider';

const payloadSchema = z.object({
  action: z.enum(['cancel', 'mark']),
  orderId: z.string().uuid(),
  paymentIntentId: z.string().uuid(),
  storeId: z.string().uuid(),
});

export interface ShopifyOrderActionEvent {
  readonly correlationId: string;
  readonly eventId: string;
  readonly organizationId: string;
}

@Injectable()
export class ShopifyOrderActionService {
  public constructor(
    private readonly cipher: ShopifyCredentialCipher,
    private readonly environment: EnvironmentService,
    private readonly prisma: PrismaService,
    @Inject(SHOPIFY_PROVIDER) private readonly provider: ShopifyProvider,
  ) {}

  public async apply(event: ShopifyOrderActionEvent): Promise<void> {
    this.assertEnabled();
    const outbox = await this.prisma.outboxEvent.findFirst({
      where: {
        eventType: 'shopify.order.abandonment-action.requested.v1',
        id: event.eventId,
        organizationId: event.organizationId,
      },
    });
    if (outbox === null) throw new ConflictException('Shopify order action event was not found');
    const payload = payloadSchema.parse(outbox.payloadJson);
    if (payload.orderId !== outbox.aggregateId || payload.paymentIntentId !== outbox.causationId) {
      throw new ConflictException('Shopify order action event is inconsistent');
    }
    if (payload.action === 'cancel' && !this.environment.shopifyOrderActions.cancelEnabled) {
      throw new ServiceUnavailableException('Shopify order cancellation is disabled');
    }
    const [order, intent, connection] = await Promise.all([
      this.prisma.order.findFirst({
        include: { store: true },
        where: {
          id: payload.orderId,
          organizationId: event.organizationId,
          storeId: payload.storeId,
        },
      }),
      this.prisma.paymentIntent.findFirst({
        where: {
          id: payload.paymentIntentId,
          orderId: payload.orderId,
          organizationId: event.organizationId,
          status: 'EXPIRED',
          storeId: payload.storeId,
        },
      }),
      this.prisma.integrationConnection.findFirst({
        where: {
          organizationId: event.organizationId,
          provider: 'SHOPIFY',
          status: 'ACTIVE',
          storeId: payload.storeId,
        },
      }),
    ]);
    if (order === null || intent === null || connection === null) {
      throw new ConflictException('Shopify order action prerequisites are not satisfied');
    }
    if (intent.abandonmentAction.toLowerCase() !== payload.action) {
      throw new ConflictException('Shopify order action differs from the expiration policy');
    }
    if (
      order.currentState !== 'ABANDONO_PAGO_TRANSPORTE' &&
      !(payload.action === 'cancel' && order.currentState === 'CANCELLED')
    ) {
      throw new ConflictException('Shopify order is not in an actionable state');
    }
    if (payload.action === 'cancel' && order.currentState === 'CANCELLED') return;

    const result = await this.provider.applyOrderAction({
      accessToken: this.cipher.decrypt(
        connection.encryptedCredentialsJson,
        event.organizationId,
        payload.storeId,
      ),
      action: payload.action,
      orderId: order.shopifyOrderId,
      shopDomain: order.store.shopifyShopDomain,
    });

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${'shopify.order-action:' + event.organizationId + ':' + payload.orderId}, 0)
        )
      `;
      const lockedOrder = await transaction.order.findFirst({
        where: { id: payload.orderId, organizationId: event.organizationId },
      });
      if (lockedOrder === null) throw new ConflictException('Shopify order was not found');
      if (payload.action === 'cancel' && lockedOrder.currentState !== 'CANCELLED') {
        if (lockedOrder.currentState !== 'ABANDONO_PAGO_TRANSPORTE') {
          throw new ConflictException('Shopify order changed before cancellation completed');
        }
        await transaction.orderStateHistory.createMany({
          data: [
            {
              fromState: lockedOrder.currentState,
              metadataJson: {
                alreadyApplied: result.alreadyApplied,
                mode: result.mode,
              },
              orderId: lockedOrder.id,
              organizationId: event.organizationId,
              reason: 'shopify_cancellation_completed',
              storeId: payload.storeId,
              toState: 'CANCELLED',
              triggerId: event.eventId,
              triggerType: 'shopify_order_action',
            },
          ],
          skipDuplicates: true,
        });
        await transaction.order.update({
          data: { cancelledAt: new Date(), currentState: 'CANCELLED', version: { increment: 1 } },
          where: { id: lockedOrder.id },
        });
      }
      await transaction.auditLog.create({
        data: {
          action: `shopify.order.${payload.action === 'cancel' ? 'cancelled' : 'marked_abandoned'}`,
          correlationId: event.correlationId,
          metadataJson: {
            alreadyApplied: result.alreadyApplied,
            mode: result.mode,
          },
          organizationId: event.organizationId,
          outcome: 'SUCCESS',
          resourceId: payload.orderId,
          resourceType: 'order',
        },
      });
    });
  }

  private assertEnabled(): void {
    const controls = this.environment.shopifyOrderActions;
    if (!controls.enabled || controls.killSwitch) {
      throw new ServiceUnavailableException('Shopify order actions are disabled');
    }
  }
}
