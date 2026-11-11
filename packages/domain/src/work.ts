import { z } from "zod";
import { RequirementSchema, type Requirement } from "./index";

export const WorkInput = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(30).max(1600),
    sourceUrl: z.string().url().max(1000),
    amountMinor: z.number().int().min(2500).max(50000),
    requirements: z.array(RequirementSchema).min(3).max(5),
    publishConsent: z.literal(true),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.requirements.map((r) => r.id)).size === v.requirements.length,
    "Requirement IDs must be unique",
  );

export interface WorkApplication {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  message: string;
  portfolioUrl?: string;
  status: "APPLIED" | "INVITED" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";
  createdAt: string;
}
export interface WorkPost {
  id: string;
  version: number;
  clientTenantId: string;
  clientName: string;
  clientEmail: string;
  mode: "sandbox" | "live";
  title: string;
  description: string;
  sourceUrl: string;
  amountMinor: number;
  requirements: Requirement[];
  status: "OPEN" | "INVITED" | "ASSIGNED" | "CLOSED";
  applications: WorkApplication[];
  selectedApplicationId?: string;
  agreementId?: string;
  createdAt: string;
  updatedAt: string;
}
export interface WorkQuery {
  view: "open" | "posts" | "applications";
  tenantId?: string;
  mode: "sandbox" | "live";
  q: string;
  page: number;
}
export function publicWork(post: WorkPost) {
  return {
    id: post.id,
    title: post.title,
    description: post.description,
    clientName: post.clientName,
    sourceUrl: post.sourceUrl,
    amountMinor: post.amountMinor,
    requirements: post.requirements,
    status: post.status,
    mode: post.mode,
    createdAt: post.createdAt,
    applicantCount: post.applications.filter((a) =>
      ["APPLIED", "INVITED", "ACCEPTED"].includes(a.status),
    ).length,
  };
}
export type PublicWork = ReturnType<typeof publicWork>;
