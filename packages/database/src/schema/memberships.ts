import {
  pgTable,
  pgEnum,
  uuid,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { organizations } from "./organizations.js";

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "admin",
  "member",
]);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    role: membershipRoleEnum("role").default("member").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique("memberships_user_org_unique").on(table.userId, table.organizationId)],
);
