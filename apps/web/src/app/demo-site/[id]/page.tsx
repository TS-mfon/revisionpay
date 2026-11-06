import { notFound } from "next/navigation";
import { getStore } from "@/server/store";
import { Northstar } from "@/components/northstar";
export const dynamic = "force-dynamic";
export default async function DemoSite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const a = await (await getStore()).getAgreement(id);
  if (!a || !a.sourceUrl.endsWith("/demo-site/" + id)) notFound();
  return <Northstar variant={a.demoVariant} />;
}
