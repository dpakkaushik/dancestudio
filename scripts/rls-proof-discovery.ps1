# RLS proof for Step 5 (discovery): nearby search respects visibility.
# Reads keys from .env.local — run from the repo root: powershell -File scripts/rls-proof-discovery.ps1
$ErrorActionPreference = "Stop"

$envFile = Join-Path $PSScriptRoot "..\.env.local"
$vars = @{}
Get-Content $envFile | Where-Object { $_ -match "^\s*[A-Z_]+=" } | ForEach-Object {
  $name, $value = $_ -split "=", 2
  $vars[$name.Trim()] = $value.Trim()
}
$base = $vars["NEXT_PUBLIC_SUPABASE_URL"]
$anon = $vars["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
if (-not $base -or -not $anon) { throw "NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY missing from .env.local" }

function Sign-In($phone) {
  $h = @{ apikey = $anon; "Content-Type" = "application/json" }
  Invoke-RestMethod -Method Post -Uri "$base/auth/v1/otp" -Headers $h -Body ("{`"phone`":`"$phone`"}") | Out-Null
  return Invoke-RestMethod -Method Post -Uri "$base/auth/v1/verify" -Headers $h -Body ("{`"type`":`"sms`",`"phone`":`"$phone`",`"token`":`"123456`"}")
}
function Api($token) { return @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" } }
function Nearby($headers, $type) {
  $body = @{ p_lat = 18.5204; p_lng = 73.8567; p_radius_km = 25 }
  if ($type) { $body["p_type"] = $type }
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/nearby_tenants" -Headers $headers -Body ($body | ConvertTo-Json)
}

$a = Sign-In "+919999999999"
$pass = $true
$stamp = Get-Date -Format "HHmmss"

# A creates a Pune studio — the RPC must have stamped centroid coordinates on it
$ta = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_tenant_with_owner" -Headers (Api $a.access_token) -Body (@{ p_name = "Near Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" } | ConvertTo-Json)
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
$trainerIds = & $idsOf (Nearby $anonH "trainer_business")
$typeOk = -not ($trainerIds -contains $tid)
"3. Type filter excludes it from 'artists': $(if ($typeOk) {'-- OK'} else {'-- !!! FAILED !!!'})"
if (-not $typeOk) { $pass = $false }

# owner unlists the studio -> gone from anonymous discovery, still visible to the owner
Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers (Api $a.access_token) -Body '{"visibility":"unlisted"}' | Out-Null
$anonSees = (& $idsOf (Nearby $anonH "studio")) -contains $tid
$ownerSees = (& $idsOf (Nearby (Api $a.access_token) "studio")) -contains $tid
$hideOk = (-not $anonSees) -and $ownerSees
"4. Unlisted: anonymous sees it=$anonSees, owner sees it=$ownerSees $(if ($hideOk) {'-- VISIBILITY RESPECTED'} else {'-- !!! FAILED !!!'})"
if (-not $hideOk) { $pass = $false }

# far away: search from New Delhi must not contain the Pune studio (re-list first)
Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers (Api $a.access_token) -Body '{"visibility":"listed"}' | Out-Null
$delhi = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/nearby_tenants" -Headers $anonH -Body (@{ p_lat = 28.6139; p_lng = 77.2090; p_radius_km = 25; p_type = "studio" } | ConvertTo-Json)
$farOk = -not ((& $idsOf $delhi) -contains $tid)
"5. Search from New Delhi (25 km) excludes the Pune studio: $(if ($farOk) {'-- RADIUS OK'} else {'-- !!! FAILED !!!'})"
if (-not $farOk) { $pass = $false }

if ($pass) { "`nALL DISCOVERY CHECKS PASSED"; exit 0 } else { "`nDISCOVERY CHECKS FAILED"; exit 1 }
