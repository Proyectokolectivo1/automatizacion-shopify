import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { MetricsService } from '../observability/metrics.service';
import { ShopifyCredentialCipher } from './shopify-credential-cipher';
import { ShopifyOrderNormalizer } from './shopify-order-normalizer';
import { SHOPIFY_PROVIDER, type ShopifyProvider } from './shopify-provider';

export interface ShopifyOrderSyncCommand {
  readonly correlationId: string;
  readonly organizationId: string;
  readonly webhookEventId: string;
}

export interface ShopifyOrderSyncResult {
  readonly orderId: string;
  readonly outcome: 'created' | 'ignored_stale' | 'replayed' | 'updated';
}

@Injectable()
export class ShopifyOrderSyncService {
  public constructor(
    private readonly cipher: ShopifyCredentialCipher,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly normalizer: ShopifyOrderNormalizer,
    private readonly prisma: PrismaService,
    @Inject(SHOPIFY_PROVIDER) private readonly provider: ShopifyProvider,
  ) {}

  public async syncFromWebhook(command: ShopifyOrderSyncCommand): Promise<ShopifyOrderSyncResult> {
    this.assertEnabled();
    try {
      const webhook = await this.prisma.webhookEvent.findFirst({
        include: { store: true },
        where: {
          eventType: 'orders/create',
          id: command.webhookEventId,
          organizationId: command.organizationId,
          provider: 'SHOPIFY',
          signatureValid: true,
        },
      });
      if (webhook?.providerResourceId === null || webhook?.providerResourceId === undefined) {
        throw new Error('Verified webhook has no Shopify order resource identifier');
      }
      const connection = await this.prisma.integrationConnection.findFirst({
        where: {
          organizationId: command.organizationId,
          provider: 'SHOPIFY',
          status: 'ACTIVE',
          storeId: webhook.storeId,
        },
      });
      if (connection === null) throw new Error('Active Shopify connection was not found');
      const accessToken = this.cipher.decrypt(
        connection.encryptedCredentialsJson,
        command.organizationId,
        webhook.storeId,
      );
      const providerPayload = await this.provider.fetchOrder({
        accessToken,
        orderId: webhook.providerResourceId,
        shopDomain: webhook.store.shopifyShopDomain,
      });
      const snapshot = this.normalizer.normalize(providerPayload);
      if (snapshot.id !== webhook.providerResourceId) {
        throw new Error('Shopify provider returned a different order identifier');
      }
      if (snapshot.currency !== webhook.store.currency) {
        throw new Error('Shopify order currency does not match its store');
      }

      const result = await this.withSerializableRetry(() =>
        this.prisma.$transaction(
          async (transaction) => {
            await transaction.$executeRaw`
              SELECT pg_advisory_xact_lock(
                hashtextextended(${'shopify.order:' + command.organizationId + ':' + webhook.storeId + ':' + snapshot.id}, 0)
              )
            `;
            const existing = await transaction.order.findUnique({
              where: {
                storeId_shopifyOrderId: {
                  shopifyOrderId: snapshot.id,
                  storeId: webhook.storeId,
                },
              },
            });
            if (existing?.sourceWebhookEventId === webhook.id) {
              return { orderId: existing.id, outcome: 'replayed' } as const;
            }
            if (existing !== null && existing.sourceUpdatedAt >= snapshot.sourceUpdatedAt) {
              await this.writeAudit(
                transaction,
                command,
                existing.id,
                'shopify.order.stale_ignored',
              );
              return { orderId: existing.id, outcome: 'ignored_stale' } as const;
            }

            const customer = await transaction.customer.upsert({
              create: {
                dataProcessingConsent: false,
                email: snapshot.customer.email,
                firstName: snapshot.customer.firstName,
                lastName: snapshot.customer.lastName,
                marketingConsent: snapshot.customer.acceptsMarketing,
                organizationId: command.organizationId,
                phoneE164: snapshot.customer.phoneE164,
                shopifyCustomerId: snapshot.customer.id,
                storeId: webhook.storeId,
              },
              update: {
                email: snapshot.customer.email,
                firstName: snapshot.customer.firstName,
                lastName: snapshot.customer.lastName,
                marketingConsent: snapshot.customer.acceptsMarketing,
                phoneE164: snapshot.customer.phoneE164,
              },
              where: {
                storeId_shopifyCustomerId: {
                  shopifyCustomerId: snapshot.customer.id,
                  storeId: webhook.storeId,
                },
              },
            });
            const address = await transaction.customerAddress.upsert({
              create: {
                address1: snapshot.address.address1,
                address2: snapshot.address.address2,
                city: snapshot.address.city,
                countryCode: snapshot.address.countryCode,
                customerId: customer.id,
                department: snapshot.address.department,
                normalizedAddress: snapshot.address.normalizedAddress,
                organizationId: command.organizationId,
                postalCode: snapshot.address.postalCode,
                shopifyAddressId: snapshot.address.id,
                storeId: webhook.storeId,
                validationDetailsJson: {
                  fixtureVersion: snapshot.fixtureVersion,
                  mode: 'simulation',
                },
              },
              update: {
                address1: snapshot.address.address1,
                address2: snapshot.address.address2,
                city: snapshot.address.city,
                countryCode: snapshot.address.countryCode,
                department: snapshot.address.department,
                normalizedAddress: snapshot.address.normalizedAddress,
                postalCode: snapshot.address.postalCode,
              },
              where: {
                customerId_shopifyAddressId: {
                  customerId: customer.id,
                  shopifyAddressId: snapshot.address.id,
                },
              },
            });
            const orderId = existing?.id ?? randomUUID();
            const orderData = {
              currency: snapshot.currency,
              customerId: customer.id,
              discountAmount: snapshot.discountAmount,
              rawSnapshotJson: snapshot.rawSnapshot as Prisma.InputJsonValue,
              shippingAddressId: address.id,
              shopifyCheckoutId: snapshot.checkoutId,
              shopifyOrderName: snapshot.name,
              sourceCreatedAt: snapshot.sourceCreatedAt,
              sourceUpdatedAt: snapshot.sourceUpdatedAt,
              sourceWebhookEventId: webhook.id,
              subtotalAmount: snapshot.subtotalAmount,
              taxAmount: snapshot.taxAmount,
              totalAmount: snapshot.totalAmount,
              transportChargeAmount: snapshot.transportChargeAmount,
            };
            if (existing === null) {
              await transaction.order.create({
                data: {
                  ...orderData,
                  id: orderId,
                  organizationId: command.organizationId,
                  shopifyOrderId: snapshot.id,
                  storeId: webhook.storeId,
                },
              });
            } else {
              await transaction.order.update({
                data: { ...orderData, version: { increment: 1 } },
                where: { id: orderId },
              });
            }

            const currentLineIds = snapshot.items.map((item) => item.id);
            await transaction.orderItem.deleteMany({
              where: { orderId, shopifyLineItemId: { notIn: currentLineIds } },
            });
            for (const item of snapshot.items) {
              await transaction.orderItem.upsert({
                create: {
                  orderId,
                  organizationId: command.organizationId,
                  productName: item.productName,
                  quantity: item.quantity,
                  shopifyLineItemId: item.id,
                  shopifyProductId: item.productId,
                  shopifyVariantId: item.variantId,
                  sku: item.sku,
                  snapshotJson: item.snapshot,
                  storeId: webhook.storeId,
                  totalPriceAmount: item.totalPriceAmount,
                  unitPriceAmount: item.unitPriceAmount,
                  variantName: item.variantName,
                },
                update: {
                  productName: item.productName,
                  quantity: item.quantity,
                  shopifyProductId: item.productId,
                  shopifyVariantId: item.variantId,
                  sku: item.sku,
                  snapshotJson: item.snapshot,
                  totalPriceAmount: item.totalPriceAmount,
                  unitPriceAmount: item.unitPriceAmount,
                  variantName: item.variantName,
                },
                where: {
                  orderId_shopifyLineItemId: {
                    orderId,
                    shopifyLineItemId: item.id,
                  },
                },
              });
            }
            await transaction.outboxEvent.create({
              data: {
                aggregateId: orderId,
                aggregateType: 'order',
                causationId: webhook.id,
                correlationId: command.correlationId,
                eventType: 'shopify.order.synchronized.v1',
                eventVersion: 1,
                organizationId: command.organizationId,
                payloadJson: {
                  fixtureVersion: snapshot.fixtureVersion,
                  mode: 'simulation',
                  orderId,
                  provider: 'shopify',
                  storeId: webhook.storeId,
                },
              },
            });
            await this.writeAudit(transaction, command, orderId, 'shopify.order.synchronized');
            return { orderId, outcome: existing === null ? 'created' : 'updated' } as const;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
      this.metrics.recordShopifyOrderSync(result.outcome);
      return result;
    } catch (error) {
      this.metrics.recordShopifyOrderSync('failed');
      await this.prisma.auditLog.create({
        data: {
          action: 'shopify.order.sync_failed',
          correlationId: command.correlationId,
          metadataJson: { mode: 'simulation' },
          organizationId: command.organizationId,
          outcome: 'FAILURE',
          resourceId: command.webhookEventId,
          resourceType: 'webhook_event',
        },
      });
      throw error;
    }
  }

  private assertEnabled(): void {
    const controls = this.environment.shopifyOrderSync;
    if (!controls.enabled || controls.killSwitch || !controls.simulationMode) {
      throw new Error('Shopify order synchronization simulation is disabled');
    }
  }

  private async writeAudit(
    transaction: Prisma.TransactionClient,
    command: ShopifyOrderSyncCommand,
    orderId: string,
    action: string,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action,
        correlationId: command.correlationId,
        metadataJson: { mode: 'simulation' },
        organizationId: command.organizationId,
        outcome: 'SUCCESS',
        resourceId: orderId,
        resourceType: 'order',
      },
    });
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let retry = 0; retry < 3; retry += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!this.isSerializationConflict(error) || retry === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 25 * (retry + 1)));
      }
    }
    throw new Error('Serializable Shopify order sync retry limit reached');
  }

  private isSerializationConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2034') return true;
    const metadata = error.meta as { code?: string } | undefined;
    return error.code === 'P2010' && metadata?.code === '40001';
  }
}
