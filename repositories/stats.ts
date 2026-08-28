import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_STATS, type ChartRow, type ChartSegment, type DanceStats, type HistoryRow, type Side } from "@/types/stats";

/** Step 25's reads. All four are database functions, because a figure and the
 *  list behind it must be the same number (prototype 9950) and a leaderboard has
 *  to see across people RLS rightly hides from each other. Nothing is added up
 *  in TypeScript. */

interface StatsRow {
  sessions_conducted: number;
  sessions_assisted: number;
  sessions_attended: number;
  hours_conducted: number;
  hours_assisted: number;
  hours_attended: number;
  points: number;
  styles: number;
  studios: number;
  artists: number;
  first_session: string | null;
  last_session: string | null;
}

interface HistRow {
  session_id: string;
  side: Side;
  class_id: string;
  share_slug: string | null;
  title: string;
  style: string;
  room: string | null;
  city: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  artist_name: string | null;
  starts_at: string;
  ends_at: string;
  minutes: number;
}

interface ChartRawRow {
  place: number;
  kind: ChartSegment;
  id: string;
  name: string;
  city: string | null;
  style: string | null;
  conducted: number;
  assisted: number;
  attended: number;
  hours: number;
  extra: number;
  points: number;
  population: number;
}

/** The signed-in person's record. */
export async function findMyStats(supabase: SupabaseClient): Promise<DanceStats> {
  const { data, error } = await supabase.rpc("my_dance_stats");
  if (error) {
    throw new Error(`stats.mine failed: ${error.message}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as StatsRow | undefined;
  if (!row) {
    return EMPTY_STATS;
  }
  return {
    sessionsConducted: Number(row.sessions_conducted ?? 0),
    sessionsAssisted: Number(row.sessions_assisted ?? 0),
    sessionsAttended: Number(row.sessions_attended ?? 0),
    hoursConducted: Number(row.hours_conducted ?? 0),
    hoursAssisted: Number(row.hours_assisted ?? 0),
    hoursAttended: Number(row.hours_attended ?? 0),
    points: Number(row.points ?? 0),
    styles: Number(row.styles ?? 0),
    studios: Number(row.studios ?? 0),
    artists: Number(row.artists ?? 0),
    firstSession: row.first_session,
    lastSession: row.last_session,
  };
}

/** The library the figures open into — one row per side of every past session. */
export async function findMyHistory(supabase: SupabaseClient, limit = 200): Promise<HistoryRow[]> {
  const { data, error } = await supabase.rpc("my_session_history", { p_limit: limit });
  if (error) {
    throw new Error(`stats.history failed: ${error.message}`);
  }
  return ((data ?? []) as HistRow[]).map((r) => ({
    sessionId: r.session_id,
    side: r.side,
    classId: r.class_id,
    shareSlug: r.share_slug,
    title: r.title,
    style: r.style,
    room: r.room,
    city: r.city,
    tenantId: r.tenant_id,
    tenantName: r.tenant_name,
    artistName: r.artist_name,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    minutes: Number(r.minutes ?? 0),
  }));
}

/** One board. Every row carries the population it was ranked out of. */
export async function findChart(
  supabase: SupabaseClient,
  input: { segment: ChartSegment; city?: string | null; style?: string | null; limit?: number }
): Promise<ChartRow[]> {
  const { data, error } = await supabase.rpc("dance_chart", {
    p_segment: input.segment,
    p_city: input.city ?? null,
    p_style: input.style ?? null,
    p_limit: input.limit ?? 20,
  });
  if (error) {
    throw new Error(`stats.chart failed: ${error.message}`);
  }
  return ((data ?? []) as ChartRawRow[]).map((r) => ({
    place: Number(r.place),
    kind: r.kind,
    id: r.id,
    name: r.name,
    city: r.city,
    style: r.style,
    conducted: Number(r.conducted ?? 0),
    assisted: Number(r.assisted ?? 0),
    attended: Number(r.attended ?? 0),
    hours: Number(r.hours ?? 0),
    extra: Number(r.extra ?? 0),
    points: Number(r.points ?? 0),
    population: Number(r.population ?? 0),
  }));
}

/** Where the caller stands on a people board — null when they are not on it yet,
 *  which is the honest answer rather than "#0". */
export async function findMyPlace(
  supabase: SupabaseClient,
  segment: "dancer" | "artist",
  city?: string | null
): Promise<{ place: number; population: number; points: number } | null> {
  const { data, error } = await supabase.rpc("my_chart_place", { p_segment: segment, p_city: city ?? null });
  if (error) {
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as { place: number; population: number; points: number } | undefined;
  return row ? { place: Number(row.place), population: Number(row.population), points: Number(row.points) } : null;
}
