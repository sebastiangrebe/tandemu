import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBody,
  UseGuards,
} from '@nestjs/common';
import { BillingService } from './billing.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import type {
  CheckoutSessionRequest,
  CheckoutSessionResponse,
  BillingPortalRequest,
  BillingPortalResponse,
} from '@tandem/types';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async createCheckoutSession(
    @Body() dto: CheckoutSessionRequest,
  ): Promise<CheckoutSessionResponse> {
    return this.billingService.createCheckoutSession(dto);
  }

  @Post('portal')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async createBillingPortal(
    @Body() dto: BillingPortalRequest,
  ): Promise<BillingPortalResponse> {
    return this.billingService.createBillingPortal(dto);
  }

  @Post('webhooks/stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @RawBody() rawBody: Buffer,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: boolean }> {
    const event = this.billingService.verifyWebhookSignature(rawBody, signature);
    await this.billingService.handleWebhookEvent(event);
    return { received: true };
  }
}
