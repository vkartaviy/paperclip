import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { offices, officeSeats } from "@paperclipai/db/office/schema";
import type { TiledMap } from "@paperclipai/db/office/types";

export function officeService(db: Db) {
  return {
    get: async (companyId: string) => {
      return db
        .select()
        .from(offices)
        .where(eq(offices.companyId, companyId))
        .then((rows) => rows[0] ?? null);
    },

    create: async (companyId: string, data: { name?: string; mapData: TiledMap }) => {
      const [office] = await db
        .insert(offices)
        .values({
          companyId,
          name: data.name ?? "Main Office",
          mapData: data.mapData,
        })
        .returning();

      return office!;
    },

    update: async (companyId: string, data: { name?: string; mapData?: TiledMap }) => {
      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (data.name !== undefined) {
        updates.name = data.name;
      }
      if (data.mapData !== undefined) {
        updates.mapData = data.mapData;
      }

      const [office] = await db
        .update(offices)
        .set(updates)
        .where(eq(offices.companyId, companyId))
        .returning();

      return office ?? null;
    },

    getSeats: async (officeId: string) => {
      return db.select().from(officeSeats).where(eq(officeSeats.officeId, officeId));
    },

    assignSeat: async (officeId: string, agentId: string, seatId: string, charSprite: string) => {
      const [seat] = await db
        .insert(officeSeats)
        .values({ officeId, agentId, seatId, charSprite })
        .onConflictDoUpdate({
          target: [officeSeats.officeId, officeSeats.agentId],
          set: { seatId, charSprite },
        })
        .returning();

      return seat!;
    },

    removeSeat: async (officeId: string, agentId: string) => {
      await db
        .delete(officeSeats)
        .where(and(eq(officeSeats.officeId, officeId), eq(officeSeats.agentId, agentId)));
    },
  };
}
