import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FollowsScreen } from "@/features/follows/components/FollowsScreen";
import { loadFollowPage, type FollowSubjectKind } from "@/features/follows/server/loadFollowPage";

/** /follows/{person|business|crew}/{id}?tab=followers|following — a follow list
 *  as a page of its own, Instagram's (12 Oct 2026). Every Followers and
 *  Following figure in the app opens it. Signed-in only: the reads behind it
 *  are, and a stranger is sent to sign in rather than shown nobody. */
const params = z.object({ kind: z.enum(["person", "business", "crew"]), id: z.string().uuid() });

export default async function FollowsPage({
  params: p,
  searchParams,
}: {
  params: Promise<{ kind: string; id: string }>;
  searchParams: Promise<{ tab?: string; show?: string }>;
}) {
  const parsed = params.safeParse(await p);
  if (!parsed.success) notFound();
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const data = await loadFollowPage(supabase, user.id, parsed.data.kind as FollowSubjectKind, parsed.data.id);
  if (!data) notFound();

  return <FollowsScreen data={data} initialTab={sp.tab === "following" ? "following" : "followers"} initialShow={sp.show ?? "all"} />;
}
