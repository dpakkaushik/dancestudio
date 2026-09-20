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
#   * are the four PUBLIC pages public - a studio, an organization, a crew, an
#     artist - and does each carry the thing that makes it that page?
#   * is a PLAIN USER's page still NOT public (Step 1's line, held since 18 Sep)?
#   * does a stranger read the two things 20 Sep widened, and NOT the one it
#     deliberately did not (an artist's account number - 20260919090000)?
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
    return [pscustomobject]@{ code = [int]$r.StatusCode; body = [string]$r.Content }
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $code = [int]$resp.StatusCode
      $body = ""
      try { $s = $resp.GetResponseStream(); $s.Position = 0; $body = (New-Object System.IO.StreamReader($s)).ReadToEnd() } catch {}
      return [pscustomobject]@{ code = $code; body = $body }
    }
    return [pscustomobject]@{ code = -1; body = $_.Exception.Message }
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
$org = Rows "profiles?select=id,full_name&role=eq.org&deleted_at=is.null&verified_at=not.is.null&limit=1"
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

# ---- 4. a public organization's page ---------------------------------------
if ($org.Count) {
  $p = Get-Page "/org/$($org[0].id)"
  Check 4 "A public organization's page is public ($($p.code))" ($p.code -eq 200)
} else { Check 4 "A public organization's page - none verified, nothing smoked" $false }

# ---- 5. a crew's page -------------------------------------------------------
if ($crew.Count) {
  $p = Get-Page "/crew/$($crew[0].id)"
  Check 5 "A crew's page is public ($($p.code)) and names the crew" ($p.code -eq 200 -and $p.body -match [regex]::Escape($crew[0].name))
} else { Check 5 "A crew's page - no crew on this database, nothing smoked" $false }

# ---- 6. an ARTIST is their profile, and a PLAIN USER is not public ---------
# R24 (18 Sep 2026) and the line Step 1 has held since the beginning. These two
# are one check on purpose: what makes the rule a rule is the pair.
if ($artistId -and $plain) {
  $a = Get-Page "/person/$artistId"
  $u = Get-Page "/person/$($plain.id)"
  Check 6 "An artist's profile is public ($($a.code)); a plain user's is not ($($u.code))" ($a.code -eq 200 -and $u.code -ne 200)
} else { Check 6 "An artist and a plain user - could not find both, nothing smoked" $false }

# ---- 7. !! AND WHAT A STRANGER STILL MAY NOT READ --------------------------
# 20260919090000 took the account number and the age OUT of an artist's public
# face on purpose. 20 Sep gave a BUSINESS a number and deliberately did not give
# one back to a person. This is the check that keeps that true.
if ($artistId) {
  $face = Rpc-Anon "public_artist" @{ p_user_id = $artistId }
  $hasNo = $face.text -match '"member_no"'
  $hasAge = $face.text -match '"age"'
  Check 7 "An artist's public face carries no account number and no age (19 Sep privacy, kept)" ((-not $hasNo) -and (-not $hasAge)) "code $($face.code)"
} else { Check 7 "An artist's public face - no live artist, nothing smoked" $false }

# ---- 8. what 20 Sep 2026 widened, as a stranger ----------------------------
if ($org.Count) {
  $team = Rpc-Anon "public_organization_team" @{ p_org_id = $org[0].id }
  $page = Rpc-Anon "public_organization" @{ p_org_id = $org[0].id }
  Check 8 "A stranger reads a public organization's team ($($team.code)) and its page WITH its number ($($page.code))" (
    $team.code -eq 200 -and $page.code -eq 200 -and $page.text -match '"member_no"')
} else { Check 8 "The two organization reads - none verified, nothing smoked" $false }

# ---- 9. a person's seats answer a stranger for an ARTIST only --------------
if ($artistId -and $plain) {
  $mine = Rpc-Anon "person_associations" @{ p_user_id = $artistId }
  $theirs = Rpc-Anon "person_associations" @{ p_user_id = $plain.id }
  Check 9 "person_associations answers a stranger for an artist and hands back nothing for a plain user" (
    $mine.code -eq 200 -and $theirs.code -eq 200 -and $theirs.text.Trim() -eq "[]")
} else { Check 9 "person_associations - could not find both, nothing smoked" $false }

# ---- 10. the tables behind all of it are still shut ------------------------
$shut = $true
$detail = @()
foreach ($t in @("business_members", "membership_passes", "payments", "leads", "class_bookings")) {
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
Check 10 "A stranger reads no row of business_members, membership_passes, payments, leads or class_bookings" $shut ($detail -join "; ")

# ---- 11. !! AND A FRONT-DESK SEAT IS NOT PUBLIC, AT THE CEILING TOO ---------
# !! `organization_members` is DELIBERATELY readable by a stranger for a public
# organization's PUBLISHED team - that is what `public_organization_team` serves,
# and check 8 proves it answers. What must never come back is a `member` row:
# R36 is "Other team members do not appear on somebody's public profile", and
# until 20260920150000 the definer read honoured it while the table policy did
# not. This is the check that found that, and the one that keeps it closed.
$leak = "?"
try {
  $r = Invoke-WebRequest -Uri "$base/rest/v1/organization_members?select=role&role=eq.member&limit=5" -Headers $anonH -UseBasicParsing
  $leak = [string]$r.Content
} catch { $leak = "refused" }
Check 11 "A stranger reads the published team and NOT a front-desk seat (member rows: $leak)" (
  $leak -eq "refused" -or $leak.Trim() -eq "[]")

""
if ($pass) { "ALL STRANGER SMOKE CHECKS PASSED" } else { "-- FAIL: see above" }
