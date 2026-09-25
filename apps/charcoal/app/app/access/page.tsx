import { AppWorkspace } from "@/components/app/AppWorkspace";

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const params = await searchParams;
  return <AppWorkspace accessCode={params.code || ""} />;
}
