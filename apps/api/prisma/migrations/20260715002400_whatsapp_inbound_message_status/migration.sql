-- PostgreSQL requires newly added enum values to be committed before later migrations use them.
ALTER TYPE "whatsapp_message_status" ADD VALUE 'simulated_received';
