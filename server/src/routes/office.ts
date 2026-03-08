import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { officeService } from "../services/office.js";
import { assertCompanyAccess } from "./authz.js";
import { notFound } from "../errors.js";

export function officeRoutes(db: Db) {
  const router = Router();
  const svc = officeService(db);

  router.get("/companies/:companyId/office", async (req, res) => {
    const companyId = req.params.companyId as string;

    assertCompanyAccess(req, companyId);

    const office = await svc.get(companyId);

    if (!office) {
      throw notFound("Office not found");
    }

    const seats = await svc.getSeats(office.id);

    res.json({ ...office, seats });
  });

  router.post("/companies/:companyId/office", async (req, res) => {
    const companyId = req.params.companyId as string;

    assertCompanyAccess(req, companyId);

    const office = await svc.create(companyId, {
      name: req.body.name,
      mapData: req.body.mapData,
    });

    res.status(201).json({ ...office, seats: [] });
  });

  router.patch("/companies/:companyId/office", async (req, res) => {
    const companyId = req.params.companyId as string;

    assertCompanyAccess(req, companyId);

    const office = await svc.update(companyId, req.body);

    if (!office) {
      throw notFound("Office not found");
    }

    const seats = await svc.getSeats(office.id);

    res.json({ ...office, seats });
  });

  router.put("/companies/:companyId/office/seats/:agentId", async (req, res) => {
    const companyId = req.params.companyId as string;

    assertCompanyAccess(req, companyId);

    const office = await svc.get(companyId);

    if (!office) {
      throw notFound("Office not found");
    }

    const seat = await svc.assignSeat(
      office.id,
      req.params.agentId as string,
      req.body.seatId,
      req.body.charSprite
    );

    res.json(seat);
  });

  router.delete("/companies/:companyId/office/seats/:agentId", async (req, res) => {
    const companyId = req.params.companyId as string;

    assertCompanyAccess(req, companyId);

    const office = await svc.get(companyId);

    if (!office) {
      throw notFound("Office not found");
    }

    await svc.removeSeat(office.id, req.params.agentId as string);
    res.json({ ok: true });
  });

  return router;
}
