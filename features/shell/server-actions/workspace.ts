"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyTenants } from "@/repositories/tenants";

/** What the shell's "Managing {studio}" strip prints (prototype 19281-19294).
 *  The strip is a client component reading the tenant id off the URL, so it asks
 *  here for the name — and only gets one back for a business the person actually
 *  belongs to. Anything else, including a malformed id, is null: the strip is
 *  decoration on somebody's work, never an error. */
export interface Workspace {
  name: string;
  area: string | null;
  city: string | null;
}

const schema = z.object({ tenantId: z.string().uuid() });

export async function getWorkspaceAction(input: { tenantId: string }): Promise<Workspace | null> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const tenants = await findMyTenants(supabase);
    const tenant = tenants.find((t) => t.id === parsed.data.tenantId);
    return tenant ? { name: tenant.name, area: tenant.area, city: tenant.city } : null;
  } catch {
    return null;
  }
}
