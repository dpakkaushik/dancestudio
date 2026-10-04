# THE LIVE SMOKE, AS A STRANGER (written 20 Sep 2026).
#
# !! THIS SCRIPT DID NOT EXIST UNTIL TODAY, and two go-live runbooks in CLAUDE.md
# named it (NEXT TO DO #0s and #0r, from 19 Sep). A command in a runbook that is
# not there is worse than no runbook: the next person reads the sequence, runs
# the line, gets "not recognized", and either skips the smoke or invents one.
#
# What it answers, with no session at all - which is the whole point, because
# every other net in this repo runs as somebody:
#   * does the site answer, and does a signed-out visitor get sent to sign in?
#   * are the three PUBLIC pages public - a studio, a crew, an artist - and does
#     each carry the thing that makes it that page?
#   * is a PLAIN USER's page still NOT public (Step 1's line, held since 18 Sep)?
#   * does a stranger read what 20 Sep widened, and NOT the thing it deliberately
#     did not (an artist's account number - 20260919090000)?
#
# !! THREE CHECKS WENT WITH ORGANIZATIONS (29 Sep 2026) and are named here rather
# than quietly missing: a public organization's PAGE (old 4), the two reads
# `public_organization_team` / `public_organization` (old 8), and the
# `organization_members` ceiling that proved a front-desk seat never reaches a
# stranger (old 11). All three smoked a surface that no longer exists; the four
# survivors after them are renumbered, so 11/11 becomes 8/8.
#
# Check 9 joined on 5 Oct 2026: every removed address still forwards (Rule 14),
# because once a page is deleted nothing else in the repo opens its old address.
#
#   powershell -File scripts/stranger-smoke.ps1
#   powershell -File scripts/stranger-smoke.ps1 -Site https://dancestudio-orcin.vercel.app
#
# ASCII ONLY (the 11 Sep 2026 lesson: PowerShell 5.1 decodes a BOM-less file as
# ANSI, and a UTF-8 em dash becomes a quote that ends a string early).
param([string]$Site = "http://localhost:3100")

$ErrorActionPreference = "Stop"
$PSDefaultParameterValues = @{ "Invoke-RestMethod:UserAgent" = "danceos-smoke"; "Invoke-WebRequest:UserAgent" = "danceos-smoke" }

$envFile = Join-Path $PSScriptRoot "..\.env.local"
$vars = @{}
Get-Content $envFile | Where-Object { $_ -match "^\s*[A-Z_]+\s*=" } | ForEach-Object {
  $name, $value = $_ -split "=", 2
  $vars[$name.Trim()] = $value.Trim()
}
$base = $vars["NEXT_PUBLIC_SUPABASE_URL"]
$anon = $vars["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
$service = $vars["SUPABASE_SERVICE_ROLE_KEY"]
if (-not $base -or -not $anon -or -not $service) { throw "Supabase keys missing from .env.local" }

$svcH = @{ apikey = $service; Authorization = "Bearer $service"; "Content-Type" = "application/json" }
$anonH = @{ apikey = $anon; "Content-Type" = "application/json" }

$pass = $true
function Check($n, $label, $ok, $extra = "") {
  "$n. $label $(if ($ok) {'-- OK'} else {'-- !!! FAILED !!!'})$(if ($extra) { "  $extra" })"
  if (-not $ok) { $script:pass = $false }
}

# a signed-out GET: the status, and the body when there is one. A redirect is
# NOT followed - a 307 to /login is the answer, not a step on the way to one.
function Get-Page($path) {
  try {
    $r = Invoke-WebRequest -Uri "$Site$path" -MaximumRedirection 0 -UseBasicParsing -TimeoutSec 45
    return [pscustomobject]@{ code = [int]$r.StatusCode; body = [string]$r.Content; loc = [string]$r.Headers["Location"] }
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $code = [int]$resp.StatusCode
      $body = ""
      try { $s = $resp.GetResponseStream(); $s.Position = 0; $body = (New-Object System.IO.StreamReader($s)).ReadToEnd() } catch {}
      $loc = ""
      try { $loc = [string]$resp.Headers["Location"] } catch {}
      return [pscustomobject]@{ code = $code; body = $body; loc = $loc }
    }
    return [pscustomobject]@{ code = -1; body = $_.Exception.Message; loc = "" }
  }
}

# !! ROWS ARE COUNTED OFF THE RAW BODY, never through Invoke-RestMethod.
# PowerShell 5.1 reads a parsed JSON array as ONE item, so @(Invoke-RestMethod ...).Count
# is 1 whatever came back and $row.user_id hands back EVERY id joined together -
# which is how this script's first run decided there was no live artist while
# there was one (the trap this file has recorded since 24 Aug 2026).
function Rows($path) {
  $res = Invoke-WebRequest -Method Get -Uri "$base/rest/v1/$path" -Headers $svcH -UseBasicParsing
  if ($res.Content.Trim() -eq "[]") { return ,@() }
  return ,@(($res.Content | ConvertFrom-Json) | Where-Object { $null -ne $_ })
}

function Rpc-Anon($fn, $body) {
  try {
    $r = Invoke-WebRequest -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $anonH -Body ($body | ConvertTo-Json -Depth 8) -UseBasicParsing
    return [pscustomobject]@{ code = [int]$r.StatusCode; text = [string]$r.Content }
  } catch {
    $resp = $_.Exception.Response
    $code = if ($resp) { [int]$resp.StatusCode } else { -1 }
    return [pscustomobject]@{ code = $code; text = "" }
  }
}

"Smoking $Site as a stranger"
""

# ---- who is out there, read with the service role so the smoke is about the
# ---- PAGES rather than about which row happens to be first ------------------
$studio = Rows "businesses?select=id,name&type=eq.studio&visibility=eq.listed&deleted_at=is.null&limit=1"
$crew = Rows "crews?select=id,name&deleted_at=is.null&limit=1"
# !! AN ARTIST IS A LIVE PLAN **ON A LIVE PROFILE** - the first cut took the first
# active artist subscription and got one whose profile is gone, so `/person/{id}`
# answered 307 and the check read as a broken rule rather than a bad pick. A
# smoke that cannot find its subject must SAY so (check 6 does), never guess.
$artistSubs = Rows "subscriptions?select=user_id&kind=eq.artist&status=eq.active&deleted_at=is.null&limit=40"
$artistId = $null
foreach ($s in $artistSubs) {
  $uid = [string]$s.user_id
  # a subscription can carry no user_id, and "id=eq." with nothing after it is a
  # 400 that would kill the whole smoke
  if (-not $uid) { continue }
  $who = Rows "profiles?select=id,role&id=eq.$uid&deleted_at=is.null"
  if ($who.Count -and $who[0].role -eq "user") { $artistId = [string]$who[0].id; break }
}
# a PLAIN user: a live profile with no artist plan at all
$planned = @($artistSubs | ForEach-Object { [string]$_.user_id })
$plain = (Rows "profiles?select=id&role=eq.user&deleted_at=is.null&limit=40") |
  Where-Object { $planned -notcontains [string]$_.id } | Select-Object -First 1

# ---- 1. the front door ------------------------------------------------------
$root = Get-Page "/"
$login = Get-Page "/login"
Check 1 "A stranger is sent to sign in from / ($($root.code)) and /login answers ($($login.code))" (($root.code -eq 307 -or $root.code -eq 302) -and $login.code -eq 200)

# ---- 2. the pages that are meant to be open --------------------------------
$disc = Get-Page "/discover"
$terms = Get-Page "/legal/terms"
$priv = Get-Page "/legal/privacy"
Check 2 "Discover ($($disc.code)), Terms ($($terms.code)) and Privacy ($($priv.code)) are open to anybody" ($disc.code -eq 200 -and $terms.code -eq 200 -and $priv.code -eq 200)

# ---- 3. a listed studio's page ---------------------------------------------
if ($studio.Count) {
  $p = Get-Page "/studio/$($studio[0].id)"
  Check 3 "A listed studio's page is public ($($p.code)) and names the studio" ($p.code -eq 200 -and $p.body -match [regex]::Escape($studio[0].name))
} else { Check 3 "A listed studio's page - NO LISTED STUDIO ON THIS DATABASE, nothing smoked" $false }

# ---- 4. a crew's page -------------------------------------------------------
if ($crew.Count) {
  $p = Get-Page "/crew/$($crew[0].id)"
  Check 4 "A crew's page is public ($($p.code)) and names the crew" ($p.code -eq 200 -and $p.body -match [regex]::Escape($crew[0].name))
} else { Check 4 "A crew's page - no crew on this database, nothing smoked" $false }

# ---- 5. an ARTIST is their profile, and a PLAIN USER is not public ---------
# R24 (18 Sep 2026) and the line Step 1 has held since the beginning. These two
# are one check on purpose: what makes the rule a rule is the pair.
if ($artistId -and $plain) {
  $a = Get-Page "/person/$artistId"
  $u = Get-Page "/person/$($plain.id)"
  Check 5 "An artist's profile is public ($($a.code)); a plain user's is not ($($u.code))" ($a.code -eq 200 -and $u.code -ne 200)
} else { Check 5 "An artist and a plain user - could not find both, nothing smoked" $false }

# ---- 6. !! AND WHAT A STRANGER STILL MAY NOT READ --------------------------
# 20260919090000 took the account number and the age OUT of an artist's public
# face on purpose. 20 Sep gave a BUSINESS a number and deliberately did not give
# one back to a person. This is the check that keeps that true.
if ($artistId) {
  $face = Rpc-Anon "public_artist" @{ p_user_id = $artistId }
  $hasNo = $face.text -match '"member_no"'
  $hasAge = $face.text -match '"age"'
  Check 6 "An artist's public face carries no account number and no age (19 Sep privacy, kept)" ((-not $hasNo) -and (-not $hasAge)) "code $($face.code)"
} else { Check 6 "An artist's public face - no live artist, nothing smoked" $false }

# ---- 7. a person's seats answer a stranger for an ARTIST only --------------
if ($artistId -and $plain) {
  $mine = Rpc-Anon "person_associations" @{ p_user_id = $artistId }
  $theirs = Rpc-Anon "person_associations" @{ p_user_id = $plain.id }
  Check 7 "person_associations answers a stranger for an artist and hands back nothing for a plain user" (
    $mine.code -eq 200 -and $theirs.code -eq 200 -and $theirs.text.Trim() -eq "[]")
} else { Check 7 "person_associations - could not find both, nothing smoked" $false }

# ---- 8. the tables behind all of it are still shut -------------------------
$shut = $true
$detail = @()
# assets joined the list on 21 Sep 2026: what a business owns and what it is
# worth is the OWNER's, and anon is refused at the GRANT rather than by a policy
foreach ($t in @("business_members", "membership_passes", "payments", "leads", "class_bookings", "assets")) {
  try {
    $r = Invoke-WebRequest -Uri "$base/rest/v1/$t`?select=*&limit=1" -Headers $anonH -UseBasicParsing
    $body = [string]$r.Content
    if ($body.Trim() -ne "[]") { $shut = $false; $detail += "$t answered rows" }
  } catch {
    # a 401 is the grants doing their job; anything else is worth reading
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { -1 }
    if ($code -ne 401 -and $code -ne 403 -and $code -ne 404) { $shut = $false; $detail += "$t -> $code" }
  }
}
Check 8 "A stranger reads no row of business_members, membership_passes, payments, leads, class_bookings or assets" $shut ($detail -join "; ")

# ---- 9. every address that was removed still LANDS somewhere ---------------
# Rule 14: a removed route keeps its address as a 307 to the screen that does its
# job now (next.config.ts). The pages themselves are gone, so nothing else in the
# repo would notice if one of these forwards were dropped - the installed TWA, a
# bookmark or a shared link would simply meet a bare 404. This check asks each
# old address for its Location, without following it, and compares the PATH (a
# query string rides along by design). Ids are made up: a forward is decided by
# the address alone, before any page reads a row. Add a line here in the same
# commit as any new forward.
$fake = "00000000-0000-4000-8000-000000000000"
$fake2 = "00000000-0000-4000-8000-000000000001"
$forwards = @(
  # the phone channel (7 Sep 2026)
  @("/login/phone", "/login/email"),
  @("/login/verify?via=whatsapp", "/login/email"),
  # organizations and events (29 Sep 2026)
  @("/organizations", "/"),
  @("/org/$fake", "/discover"),
  @("/org/$fake/stats", "/discover"),
  @("/gst", "/"),
  @("/business/team", "/business"),
  @("/business/earnings", "/business"),
  @("/business/stats", "/business"),
  @("/e/some-event-slug", "/discover"),
  @("/my-events", "/"),
  @("/business/$fake/events", "/business/$fake"),
  @("/business/$fake/events/$fake2/edit", "/business/$fake"),
  @("/business/$fake/gst", "/business/$fake"),
  @("/business/$fake/team", "/business/$fake/staff"),
  @("/crews/$fake/manage/events", "/crews/$fake/manage"),
  # pages nothing in the app opened any more (5 Oct 2026)
  @("/business/$fake/classes/$fake2/roster", "/business/$fake/classes"),
  @("/business/$fake/media", "/business/$fake"),
  @("/business/$fake/classes/new", "/business/$fake/classes"),
  @("/crews/new", "/crews"),
  @("/routines/new", "/routines"),
  @("/memberships/new?business=$fake", "/business/$fake/memberships"),
  @("/memberships/new", "/memberships"),
  # a pointer that is not a uuid must NOT be spliced into a path
  @("/memberships/new?business=not-a-uuid", "/memberships")
)
$lost = @()
foreach ($f in $forwards) {
  $r = Get-Page $f[0]
  $to = $r.loc
  if ($to -match "^https?://[^/]+(/.*)?$") { $to = $Matches[1]; if (-not $to) { $to = "/" } }
  $toPath = ($to -split "\?", 2)[0]
  # 307 exactly: a 308 is cached by the browser for ever, which is the one thing
  # Rule 14 forbids for an address that may come back
  if ($r.code -ne 307 -or $toPath -ne $f[1]) { $lost += "$($f[0]) -> $($r.code) $to (wanted $($f[1]))" }
}
Check 9 "All $($forwards.Count) removed addresses forward (307) to the screen that does their job now" ($lost.Count -eq 0) ($lost -join "; ")

# !! `organization_members` IS DELIBERATELY NOT ON CHECK 8's LIST, and was not before
# either: its policy admits a stranger to a public organization's PUBLISHED team
# on purpose, so "it answers nothing" is a pass for the wrong reason now that no
# organization is public. The old check 11 asserted the half that mattered - that
# a `member` row never comes back - and it went with the feature rather than
# being kept as a check that can only ever pass.

""
if ($pass) { "ALL STRANGER SMOKE CHECKS PASSED" } else { "-- FAIL: see above" }
