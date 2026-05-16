export enum PlanTier {
  FREE = "FREE",
  PRO = "PRO",
  ENTERPRISE = "ENTERPRISE",
  LTD_TIER_1 = "LTD_TIER_1",
  LTD_TIER_2 = "LTD_TIER_2",
  LTD_TIER_3 = "LTD_TIER_3",
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
  /**
   * Set for one-time Lifetime Deal checkouts. When present the Platform
   * creates a `mode: 'payment'` session instead of a recurring subscription.
   */
  readonly ltdTier?: PlanTier;
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
