import type { JsonValue } from '../generated/prisma/internal/prismaNamespace';

export interface OutboxJobData {
  readonly aggregateId: string;
  readonly correlationId: string;
  readonly deliveryId: string;
  readonly deliveryVersion: number;
  readonly eventId: string;
  readonly eventType: string;
  readonly organizationId: string;
  readonly payload: JsonValue;
}

export interface ClaimedOutboxEvent {
  readonly aggregate_id: string;
  readonly attempt_count: number;
  readonly correlation_id: string;
  readonly delivery_version: number;
  readonly event_type: string;
  readonly id: string;
  readonly organization_id: string;
  readonly payload_json: JsonValue;
}

export function outboxDeliveryId(eventId: string, deliveryVersion: number): string {
  return `${eventId}-v${deliveryVersion}`;
}
