import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";

export const planTierEnum = pgEnum("plan_tier", [
  "free",
  "pro",
  "enterprise",
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
