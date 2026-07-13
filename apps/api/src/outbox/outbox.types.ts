import type { JsonValue } from '../generated/prisma/internal/prismaNamespace';

export interface OutboxJobData {
  readonly aggregateId: string;
  readonly correlationId: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly payload: JsonValue;
}

export interface ClaimedOutboxEvent {
  readonly aggregate_id: string;
  readonly attempt_count: number;
  readonly correlation_id: string;
  readonly event_type: string;
  readonly id: string;
  readonly payload_json: JsonValue;
}
