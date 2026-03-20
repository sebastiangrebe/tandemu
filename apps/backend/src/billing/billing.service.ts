import { Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  CheckoutSessionRequest,
  CheckoutSessionResponse,
  BillingPortalRequest,
  BillingPortalResponse,
  PlanTier,
  SubscriptionStatus,
} from '@tandem/types';
import type Stripe from 'stripe';

@Injectable()
export class BillingService {
  private readonly stripeSecretKey: string;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.stripeSecretKey = this.configService.get<string>('stripe.secretKey', '');
    this.webhookSecret = this.configService.get<string>('stripe.webhookSecret', '');
  }

  async createCheckoutSession(
    dto: CheckoutSessionRequest,
  ): Promise<CheckoutSessionResponse> {
    if (!this.stripeSecretKey) {
      throw new ServiceUnavailableException(
        'Stripe is not configured. Set the STRIPE_SECRET_KEY environment variable.',
      );
    }

    // TODO: Initialize Stripe client with this.stripeSecretKey and create a checkout session
    void dto;
    return {
      sessionId: 'stub-session-id',
      url: 'https://checkout.stripe.com/stub',
    };
  }

  async createBillingPortal(
    dto: BillingPortalRequest,
  ): Promise<BillingPortalResponse> {
    if (!this.stripeSecretKey) {
      throw new ServiceUnavailableException(
        'Stripe is not configured. Set the STRIPE_SECRET_KEY environment variable.',
      );
    }

    // TODO: Initialize Stripe client and create a billing portal session
    void dto;
    return {
      url: 'https://billing.stripe.com/stub',
    };
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): Stripe.Event {
    if (!this.webhookSecret) {
      throw new BadRequestException('Stripe webhook secret is not configured');
    }

    // TODO: Use Stripe SDK to verify signature
    void signature;
    const event = JSON.parse(rawBody.toString()) as Stripe.Event;
    return event;
  }

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as unknown as Record<string, unknown>;
        const organizationId = (session['metadata'] as Record<string, string>)?.['organizationId'];
        const planTier = (session['metadata'] as Record<string, string>)?.['planTier'] as PlanTier;
        const stripeCustomerId = session['customer'] as string;
        const stripeSubscriptionId = session['subscription'] as string;

        // TODO: Update organization in database
        void organizationId;
        void planTier;
        void stripeCustomerId;
        void stripeSubscriptionId;
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as unknown as Record<string, unknown>;
        const status = subscription['status'] as SubscriptionStatus;
        const stripeSubscriptionId = subscription['id'] as string;

        // TODO: Update organization in database
        void status;
        void stripeSubscriptionId;
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as unknown as Record<string, unknown>;
        const stripeCustomerId = invoice['customer'] as string;

        // TODO: Update organization subscription_status to 'past_due'
        void stripeCustomerId;
        break;
      }

      default:
        break;
    }
  }
}
