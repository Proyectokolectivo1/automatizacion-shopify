import { Injectable } from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { MetricsService } from '../observability/metrics.service';
import { OrderClassifier } from './order-classifier';

export interface OrderClassificationCommand {
  readonly correlationId: string;
  readonly eventId: string;
  readonly orderId: string;
  readonly organizationId: string;
}

export interface OrderClassificationResult {
  readonly orderId: string;
  readonly outcome: 'classified' | 'replayed';
  readonly paymentMode: 'COD' | 'PREPAID';
  readonly state: 'PENDING_TRANSPORT_PAYMENT' | 'READY_FOR_LOGISTICS';
}

@Injectable()
export class OrderClassificationService {
  public constructor(
    private readonly classifier: OrderClassifier,
    private readonly environment: EnvironmentService,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  public async classify(command: OrderClassificationCommand): Promise<OrderClassificationResult> {
    this.assertEnabled();
    try {
      const result = await this.withSerializableRetry(() =>
        this.prisma.$transaction(
          async (transaction): Promise<OrderClassificationResult> => {
            await transaction.$executeRaw`
              SELECT pg_advisory_xact_lock(
                hashtextextended(${'order.classification:' + command.organizationId + ':' + command.orderId}, 0)
              )
            `;
            const order = await transaction.order.findFirst({
              where: { id: command.orderId, organizationId: command.organizationId },
            });
            if (order === null) throw new Error('Order to classify was not found in its tenant');
            if (order.paymentMode !== 'UNCLASSIFIED') {
              const expectedState =
                order.paymentMode === 'PREPAID'
                  ? 'READY_FOR_LOGISTICS'
                  : 'PENDING_TRANSPORT_PAYMENT';
              if (order.currentState !== expectedState) {
                throw new Error('Classified order has an inconsistent workflow state');
              }
              return {
                orderId: order.id,
                outcome: 'replayed',
                paymentMode: order.paymentMode,
                state: expectedState,
              };
            }
            if (order.currentState !== 'RECEIVED') {
              throw new Error(`Order transition denied from state ${order.currentState}`);
            }
            const policy = await transaction.orderClassificationPolicy.findFirst({
              orderBy: { version: 'desc' },
              where: {
                active: true,
                organizationId: command.organizationId,
                storeId: order.storeId,
              },
            });
            if (policy === null) throw new Error('No active order classification policy was found');
            const decision = this.classifier.classify(policy.rulesJson, order.rawSnapshotJson);
            const state =
              decision.paymentMode === 'PREPAID'
                ? 'READY_FOR_LOGISTICS'
                : 'PENDING_TRANSPORT_PAYMENT';
            const transitionMetadata = {
              actorType: 'system',
              correlationId: command.correlationId,
              mode: 'simulation',
              permission: 'orders.classify',
              policyId: policy.id,
              policyRuleId: decision.policyRuleId,
              policyVersion: policy.version,
            };
            await transaction.orderStateHistory.createMany({
              data: [
                {
                  fromState: 'RECEIVED',
                  metadataJson: transitionMetadata,
                  orderId: order.id,
                  organizationId: command.organizationId,
                  reason: 'classification_validation_started',
                  storeId: order.storeId,
                  toState: 'VALIDATING',
                  triggerId: command.eventId,
                  triggerType: 'system_event',
                },
                {
                  fromState: 'VALIDATING',
                  metadataJson: transitionMetadata,
                  orderId: order.id,
                  organizationId: command.organizationId,
                  reason: 'classification_evidence_validated',
                  storeId: order.storeId,
                  toState: 'READY_FOR_PAYMENT_CLASSIFICATION',
                  triggerId: command.eventId,
                  triggerType: 'system_event',
                },
                {
                  fromState: 'READY_FOR_PAYMENT_CLASSIFICATION',
                  metadataJson: transitionMetadata,
                  orderId: order.id,
                  organizationId: command.organizationId,
                  reason: `classification_rule_${decision.policyRuleId}`,
                  storeId: order.storeId,
                  toState: state,
                  triggerId: command.eventId,
                  triggerType: 'system_event',
                },
              ],
            });
            await transaction.order.update({
              data: {
                currentState: state,
                paymentMode: decision.paymentMode,
                version: { increment: 1 },
              },
              where: { id: order.id },
            });
            await transaction.outboxEvent.create({
              data: {
                aggregateId: order.id,
                aggregateType: 'order',
                causationId: command.eventId,
                correlationId: command.correlationId,
                eventType: 'order.classified.v1',
                eventVersion: 1,
                organizationId: command.organizationId,
                payloadJson: {
                  mode: 'simulation',
                  orderId: order.id,
                  paymentMode: decision.paymentMode.toLowerCase(),
                  policyRuleId: decision.policyRuleId,
                  policyVersion: policy.version,
                  state: state.toLowerCase(),
                  storeId: order.storeId,
                },
              },
            });
            await transaction.auditLog.create({
              data: {
                action: 'order.payment.classified',
                correlationId: command.correlationId,
                metadataJson: {
                  ...transitionMetadata,
                  paymentMode: decision.paymentMode.toLowerCase(),
                  state: state.toLowerCase(),
                },
                organizationId: command.organizationId,
                outcome: 'SUCCESS',
                resourceId: order.id,
                resourceType: 'order',
              },
            });
            return {
              orderId: order.id,
              outcome: 'classified',
              paymentMode: decision.paymentMode,
              state,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
      this.metrics.recordOrderClassification(result.outcome);
      return result;
    } catch (error) {
      this.metrics.recordOrderClassification('failed');
      await this.prisma.auditLog.create({
        data: {
          action: 'order.payment.classification_failed',
          correlationId: command.correlationId,
          metadataJson: {
            errorCode:
              error !== null && typeof error === 'object' && 'code' in error
                ? String(error.code)
                : 'CLASSIFICATION_FAILED',
            mode: 'simulation',
          },
          organizationId: command.organizationId,
          outcome: 'FAILURE',
          resourceId: command.orderId,
          resourceType: 'order',
        },
      });
      throw error;
    }
  }

  private assertEnabled(): void {
    const controls = this.environment.orderClassification;
    if (!controls.enabled || controls.killSwitch || !controls.simulationMode) {
      throw new Error('Order classification simulation is disabled');
    }
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
    throw new Error('Serializable order classification retry limit reached');
  }

  private isSerializationConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2002' || error.code === 'P2034') return true;
    const metadata = error.meta as { code?: string } | undefined;
    return error.code === 'P2010' && metadata?.code === '40001';
  }
}
