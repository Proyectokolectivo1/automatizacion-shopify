-- Expand the explicit simulation-only WhatsApp message lifecycle.
-- Kept separate because PostgreSQL cannot safely consume new enum values in the same transaction.
ALTER TYPE "whatsapp_message_status" ADD VALUE 'simulated_sent';
ALTER TYPE "whatsapp_message_status" ADD VALUE 'simulated_delivered';
ALTER TYPE "whatsapp_message_status" ADD VALUE 'simulated_read';
ALTER TYPE "whatsapp_message_status" ADD VALUE 'simulated_failed';
