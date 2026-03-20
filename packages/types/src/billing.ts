export enum PlanTier {
  FREE = "FREE",
  PRO = "PRO",
  ENTERPRISE = "ENTERPRISE",
}

export enum SubscriptionStatus {
  ACTIVE = "active",
  PAST_DUE = "past_due",
  CANCELED = "canceled",
  TRIALING = "trialing",
}

export type StripeWebhookEventType =
  | "checkout.session.completed"
  | "customer.subscription.updated"
  | "invoice.payment_failed"
  | "invoice.payment_succeeded";

export interface StripeWebhookEvent {
  readonly id: string;
  readonly type: StripeWebhookEventType;
  readonly created: number;
  readonly data: {
    readonly object: Record<string, unknown>;
  };
}

export interface CheckoutSessionRequest {
  readonly organizationId: string;
  readonly planTier: PlanTier;
  readonly successUrl: string;
  readonly cancelUrl: string;
}

export interface CheckoutSessionResponse {
  readonly sessionId: string;
  readonly url: string;
}

export interface BillingPortalRequest {
  readonly organizationId: string;
  readonly returnUrl: string;
}

export interface BillingPortalResponse {
  readonly url: string;
}
