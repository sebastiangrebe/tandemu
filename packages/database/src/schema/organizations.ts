import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";

export const planTierEnum = pgEnum("plan_tier", [
  "free",
  "pro",
  "enterprise",
  "ltd_tier_1",
  "ltd_tier_2",
  "ltd_tier_3",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "canceled",
  "trialing",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).unique().notNull(),
  stripeCustomerId: varchar("stripe_customer_id").unique(),
  stripeSubscriptionId: varchar("stripe_subscription_id").unique(),
  planTier: planTierEnum("plan_tier").default("free").notNull(),
  subscriptionStatus: subscriptionStatusEnum("subscription_status")
    .default("active")
    .notNull(),
  // Generic resource caps. NULL = unlimited (OSS standalone-correct).
  // Written only by the Platform Stripe webhook for LTD workspaces.
  maxSeats: integer("max_seats"),
  maxRepos: integer("max_repos"),
  retentionDays: integer("retention_days"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
