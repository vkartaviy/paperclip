import { pgTable, uuid, text, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const offices = pgTable(
  "offices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    name: text("name").notNull().default("Main Office"),
    mapData: jsonb("map_data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUniq: uniqueIndex("offices_company_id_uniq").on(table.companyId),
  })
);

export const officeSeats = pgTable(
  "office_seats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    officeId: uuid("office_id")
      .notNull()
      .references(() => offices.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    seatId: text("seat_id").notNull(),
    charSprite: text("char_sprite").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    officeAgentUniq: uniqueIndex("office_seats_office_agent_uniq").on(
      table.officeId,
      table.agentId
    ),
    officeSeatUniq: uniqueIndex("office_seats_office_seat_uniq").on(table.officeId, table.seatId),
  })
);
