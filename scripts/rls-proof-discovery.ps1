# RLS proof for Step 5 (discovery): nearby search respects visibility.
# Reads keys from .env.local — run from the repo root: powershell -File scripts/rls-proof-discovery.ps1
$ErrorActionPreference = "Stop"
# Supabase refuses a secret (sb_secret_...) key from anything that looks like a
# browser, and PowerShell's default user agent starts with "Mozilla/5.0". Name
# ourselves honestly so the admin and service-role calls are accepted.
$PSDefaultParameterValues = @{ "Invoke-RestMethod:UserAgent" = "danceos-proof"; "Invoke-WebRequest:UserAgent" = "danceos-proof" }

$envFile = Join-Path $PSScriptRoot "..\.env.local"
$vars = @{}
Get-Content $envFile | Where-Object { $_ -match "^\s*[A-Z_]+=" } | ForEach-Object {
  $name, $value = $_ -split "=", 2
  $vars[$name.Trim()] = $value.Trim()
}
$base = $vars["NEXT_PUBLIC_SUPABASE_URL"]
$anon = $vars["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
if (-not $base -or -not $anon) { throw "NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY missing from .env.local" }
$service = $vars["SUPABASE_SERVICE_ROLE_KEY"]
if (-not $service) { throw "SUPABASE_SERVICE_ROLE_KEY missing from .env.local" }
$svcH = @{ apikey = $service; Authorization = "Bearer $service"; "Content-Type" = "application/json"; Prefer = "return=representation" }

function Sign-In($phone) {
  $h = @{ apikey = $anon; "Content-Type" = "application/json" }
  Invoke-RestMethod -Method Post -Uri "$base/auth/v1/otp" -Headers $h -Body ("{`"phone`":`"$phone`"}") | Out-Null
  return Invoke-RestMethod -Method Post -Uri "$base/auth/v1/verify" -Headers $h -Body ("{`"type`":`"sms`",`"phone`":`"$phone`",`"token`":`"123456`"}")
}
. (Join-Path $PSScriptRoot "proof-lib.ps1")   # New-Studio / Subscribe-Studio / Assert-City / Publish-Class (see that file)

function Api($token) { return @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" } }
# p_limit = 200 (17 Sep 2026): nearby_businesses answers at most p_limit rows, 50 by
# default, and every proof studio sits on Pune's exact centroid at distance 0 — so
# once more than 50 listed studios share that point, which one of them makes the
# first 50 is arbitrary. This proof went red on the day the leftovers of earlier runs
# crossed that line (70+ listed "Near Studio", "Class Studio", "Mandate Proof Studio"
# rows in Pune), for a reason that was not its subject. The cap itself is a real
# limit on Discover (backlog: no cursor on the radius search); this asks for the
# maximum the RPC allows, and the script now deletes its own studio at the end.
function Nearby($headers, $type) {
  $body = @{ p_lat = 18.5204; p_lng = 73.8567; p_radius_km = 25; p_limit = 200 }
  if ($type) { $body["p_type"] = $type }
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/nearby_businesses" -Headers $headers -Body ($body | ConvertTo-Json)
}

$a = Sign-In "+919999999999"
$pass = $true
$stamp = Get-Date -Format "HHmmss"

# A creates a Pune studio — the RPC must have stamped centroid coordinates on it
$ta = New-Studio $a.access_token "Near Studio $stamp" "Kothrud" "Pune"
Subscribe-Studio ([string]$ta.id)
$hasCoords = ($null -ne $ta.lat) -and ($null -ne $ta.lng)
"1. New Pune studio gets coordinates: lat=$($ta.lat) lng=$($ta.lng) $(if ($hasCoords) {'-- OK'} else {'-- !!! FAILED !!!'})"
if (-not $hasCoords) { $pass = $false }

# anonymous finds it near Pune, with a distance
$anonH = @{ apikey = $anon; "Content-Type" = "application/json" }
$tid = [string]$ta.id
$idsOf = { param($rows) @($rows) | ForEach-Object { [string]$_.id } }
$puneIds = & $idsOf (Nearby $anonH "studio")
$foundOk = $puneIds -contains $tid
"2. Anonymous 'near Pune' finds it: $(if ($foundOk) {'-- OK'} else {'-- !!! FAILED !!!'})"
if (-not $foundOk) { $pass = $false }

# type filter: it is not a trainer business
$trainerIds = & $idsOf (Nearby $anonH "artist_page")
$typeOk = -not ($trainerIds -contains $tid)
"3. Type filter excludes it from 'artists': $(if ($typeOk) {'-- OK'} else {'-- !!! FAILED !!!'})"
if (-not $typeOk) { $pass = $false }

# The studio is unlisted -> gone from anonymous discovery, still visible to the owner.
#
# ⚠ THE SERVICE ROLE UNLISTS IT, not the owner (11 Sep 2026). This line used to
# PATCH `businesses` with the OWNER's token, and it stopped working the day
# `20260913100000_doors_that_were_not_doors` dropped the column-less update
# policy that made such a PATCH possible — the same policy that let an owner
# flip `type` and put a business on Discover having paid nothing. So this proof
# was setting itself up THROUGH A SECURITY HOLE, and closing the hole made it
# fail as though discovery were broken.
#
# What this check claims is about READS — an unlisted studio is hidden from a
# stranger and visible to its owner — so how it came to be unlisted is setup,
# not the subject, and ops is the honest hand for it (Subscribe-Studio above
# already lists it the same way). A REAL owner-side List / Unlist control has
# never existed; it is on the UI parity backlog.
Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$($ta.id)" -Headers $svcH -Body '{"visibility":"unlisted"}' | Out-Null
$anonSees = (& $idsOf (Nearby $anonH "studio")) -contains $tid
$ownerSees = (& $idsOf (Nearby (Api $a.access_token) "studio")) -contains $tid
$hideOk = (-not $anonSees) -and $ownerSees
"4. Unlisted: anonymous sees it=$anonSees, owner sees it=$ownerSees $(if ($hideOk) {'-- VISIBILITY RESPECTED'} else {'-- !!! FAILED !!!'})"
if (-not $hideOk) { $pass = $false }

# far away: search from New Delhi must not contain the Pune studio (re-list first,
# through the same ops door for the same reason as above)
Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$($ta.id)" -Headers $svcH -Body '{"visibility":"listed"}' | Out-Null
$delhi = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/nearby_businesses" -Headers $anonH -Body (@{ p_lat = 28.6139; p_lng = 77.2090; p_radius_km = 25; p_type = "studio"; p_limit = 200 } | ConvertTo-Json)
$farOk = -not ((& $idsOf $delhi) -contains $tid)
"5. Search from New Delhi (25 km) excludes the Pune studio: $(if ($farOk) {'-- RADIUS OK'} else {'-- !!! FAILED !!!'})"
if (-not $farOk) { $pass = $false }

# Clean up: this script used to leave one LISTED Pune studio behind on every run
# (found 17 Sep 2026 — a dozen "Near Studio HHMMSS" rows on production Discover).
# Soft-deleted through the service role, the way scripts/cleanup-proof-leftovers.js
# does it: the row and its membership get deleted_at; nothing is erased.
$gone = (Get-Date).ToUniversalTime().ToString("o")
Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/business_members?business_id=eq.$tid&deleted_at=is.null" -Headers $svcH -Body (@{ deleted_at = $gone } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$tid&deleted_at=is.null" -Headers $svcH -Body (@{ deleted_at = $gone } | ConvertTo-Json) | Out-Null

if ($pass) { "`nALL DISCOVERY CHECKS PASSED"; exit 0 } else { "`nDISCOVERY CHECKS FAILED"; exit 1 }
