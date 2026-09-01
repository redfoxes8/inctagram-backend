ALTER TABLE "payment_transactions"
DROP CONSTRAINT "payment_transactions_lifecycle_facts_check";

ALTER TABLE "payment_transactions"
ADD CONSTRAINT "payment_transactions_lifecycle_facts_check" CHECK (
  ("status" IN ('PENDING', 'PROCESSING') AND "subscription_id" IS NULL AND "paid_at" IS NULL AND "refunded_at" IS NULL AND "failure_code" IS NULL AND "failure_message" IS NULL)
  OR ("status" = 'SUCCEEDED' AND "subscription_id" IS NOT NULL AND ("provider_transaction_id" IS NOT NULL OR "provider_invoice_id" IS NOT NULL) AND "paid_at" IS NOT NULL AND "refunded_at" IS NULL AND "failure_code" IS NULL AND "failure_message" IS NULL)
  OR ("status" = 'FAILED' AND "subscription_id" IS NULL AND "paid_at" IS NULL AND "refunded_at" IS NULL AND "failure_code" IS NOT NULL)
  OR ("status" IN ('REFUNDED', 'PARTIALLY_REFUNDED') AND "subscription_id" IS NOT NULL AND "provider_transaction_id" IS NOT NULL AND "paid_at" IS NOT NULL AND "refunded_at" IS NOT NULL AND "failure_code" IS NULL AND "failure_message" IS NULL)
);
