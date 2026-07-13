-- PostgreSQL requires a commit before a newly added enum value may be referenced.
ALTER TYPE "outbox_status" ADD VALUE 'dead_letter';
