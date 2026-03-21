import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PlanTier } from '@tandemu/types';

export const REQUIRED_PLAN_KEY = 'required_plan';
export const RequirePlan = (...tiers: PlanTier[]) =>
  SetMetadata(REQUIRED_PLAN_KEY, tiers);

const TIER_HIERARCHY: Record<string, number> = {
  FREE: 0,
  PRO: 1,
  ENTERPRISE: 2,
};

@Injectable()
export class PlanTierGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredTiers = this.reflector.getAllAndOverride<PlanTier[] | undefined>(
      REQUIRED_PLAN_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredTiers || requiredTiers.length === 0) {
      return true;
    }

    // TODO: Fetch the organization's current plan_tier from database
    // For now, extract from request context (would be populated by a prior middleware)
    const request = context.switchToHttp().getRequest<{ organizationPlanTier?: PlanTier }>();
    const orgTier = request.organizationPlanTier ?? 'FREE';
    const orgTierLevel = TIER_HIERARCHY[orgTier] ?? 0;

    // Check if the org's tier meets at least one of the required tiers
    const meetsRequirement = requiredTiers.some((tier) => {
      const requiredLevel = TIER_HIERARCHY[tier] ?? 0;
      return orgTierLevel >= requiredLevel;
    });

    if (!meetsRequirement) {
      throw new ForbiddenException(
        `This feature requires one of the following plans: ${requiredTiers.join(', ')}. Current plan: ${orgTier}`,
      );
    }

    return true;
  }
}
