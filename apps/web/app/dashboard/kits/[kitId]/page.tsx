import { KitBuilder } from "@/components/kit-builder";

export const metadata = { title: "Preparation kit" };

export default async function KitPage({ params }: { params: Promise<{ kitId: string }> }) {
  const { kitId } = await params;
  return <KitBuilder kitId={kitId} />;
}
