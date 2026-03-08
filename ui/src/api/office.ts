import { api } from "@/api/client";
import type { TiledMap } from "@/components/office/types";

export interface OfficeSeat {
  id: string;
  officeId: string;
  agentId: string;
  seatId: string;
  charSprite: string;
  createdAt: string;
}

export interface Office {
  id: string;
  companyId: string;
  name: string;
  mapData: TiledMap;
  seats: OfficeSeat[];
  createdAt: string;
  updatedAt: string;
}

export const officeApi = {
  get: (companyId: string) => api.get<Office>(`/companies/${companyId}/office`),

  create: (companyId: string, data: { name?: string; mapData: Record<string, unknown> }) =>
    api.post<Office>(`/companies/${companyId}/office`, data),

  update: (companyId: string, data: Partial<Pick<Office, "name" | "mapData">>) =>
    api.patch<Office>(`/companies/${companyId}/office`, data),

  assignSeat: (companyId: string, agentId: string, data: { seatId: string; charSprite: string }) =>
    api.put<OfficeSeat>(`/companies/${companyId}/office/seats/${agentId}`, data),

  unassignSeat: (companyId: string, agentId: string) =>
    api.delete<{ ok: true }>(`/companies/${companyId}/office/seats/${agentId}`),
};
