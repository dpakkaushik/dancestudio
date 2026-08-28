# RLS proof for Step 3 (classes): tenant writes own; public reads published only.
# Reads keys from .env.local — run from the repo root: powershell -File scripts/rls-proof-classes.ps1
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

function Sign-In($phone) {
  $h = @{ apikey = $anon; "Content-Type" = "application/json" }
  Invoke-RestMethod -Method Post -Uri "$base/auth/v1/otp" -Headers $h -Body ("{`"phone`":`"$phone`"}") | Out-Null
  return Invoke-RestMethod -Method Post -Uri "$base/auth/v1/verify" -Headers $h -Body ("{`"type`":`"sms`",`"phone`":`"$phone`",`"token`":`"123456`"}")
}
function Api($token) { return @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" } }

$a = Sign-In "+919999999999"
$b = Sign-In "+918888888888"
$pass = $true
$stamp = Get-Date -Format "HHmmss"

# A owns a fresh studio; a draft class goes on it via the atomic RPC
$ta = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_tenant_with_owner" -Headers (Api $a.access_token) -Body (@{ p_name = "Class Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" } | ConvertTo-Json)
$clsBody = @{ p_tenant_id = $ta.id; p_title = "Hip-Hop - Beginner $stamp"; p_style = "Hip-Hop"; p_level = "beginner"; p_room = "Studio A"; p_price_inr = 300; p_capacity = 20; p_status = "draft"; p_starts_at = "2026-09-01T19:00:00+05:30"; p_ends_at = "2026-09-01T20:00:00+05:30" }
$cls = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_class_with_session" -Headers (Api $a.access_token) -Body ($clsBody | ConvertTo-Json)
"1. A created draft class '$($cls.title)' on '$($ta.name)'"
if (-not $cls.id) { $pass = $false }

# B (not a member) must NOT see A's draft
$bDraft = Invoke-RestMethod -Uri "$base/rest/v1/classes?id=eq.$($cls.id)&select=id" -Headers (Api $b.access_token)
$draftHidden = (@($bDraft).Count -eq 0)
"2. B reads A's DRAFT class: $(if ($draftHidden) {'0 rows -- HIDDEN, RLS OK'} else {'VISIBLE -- !!! FAILED !!!'})"
if (-not $draftHidden) { $pass = $false }

# B must not be able to publish/rename A's class
$bUpd = Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/classes?id=eq.$($cls.id)" -Headers (Api $b.access_token) -Body '{"title":"HACKED"}'
$updBlocked = (@($bUpd).Count -eq 0)
"3. B updates A's class: $(if ($updBlocked) {'0 rows -- BLOCKED, RLS OK'} else {'SUCCEEDED -- !!! FAILED !!!'})"
if (-not $updBlocked) { $pass = $false }

# B must not be able to create a class in A's tenant (RPC checks membership)
try {
  $steal = $clsBody.Clone(); $steal["p_title"] = "Intruder class"
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_class_with_session" -Headers (Api $b.access_token) -Body ($steal | ConvertTo-Json) | Out-Null
  "4. B creates a class in A's tenant: SUCCEEDED -- !!! FAILED !!!"; $pass = $false
} catch { "4. B creates a class in A's tenant: REJECTED -- RLS OK" }

# A publishes; now B and even ANONYMOUS must see it (public read of published classes)
Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/classes?id=eq.$($cls.id)" -Headers (Api $a.access_token) -Body '{"status":"published"}' | Out-Null
$bPub = Invoke-RestMethod -Uri "$base/rest/v1/classes?id=eq.$($cls.id)&select=id,title,tenants(name)" -Headers (Api $b.access_token)
$bSees = (@($bPub).Count -eq 1) -and $bPub[0].tenants.name
"5. B reads the PUBLISHED class (+ studio name): $(if ($bSees) {'VISIBLE -- PUBLIC READ OK'} else {'HIDDEN -- !!! FAILED !!!'})"
if (-not $bSees) { $pass = $false }

$anonPub = Invoke-RestMethod -Uri "$base/rest/v1/classes?id=eq.$($cls.id)&select=id,class_sessions(starts_at)" -Headers @{ apikey = $anon }
$anonSees = (@($anonPub).Count -eq 1) -and (@($anonPub[0].class_sessions).Count -ge 1)
"6. Anonymous reads the published class + its session: $(if ($anonSees) {'VISIBLE -- OK'} else {'HIDDEN -- !!! FAILED !!!'})"
if (-not $anonSees) { $pass = $false }

# anonymous must never write
$anonUpd = Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/classes?id=eq.$($cls.id)" -Headers @{ apikey = $anon; "Content-Type" = "application/json"; Prefer = "return=representation" } -Body '{"title":"ANON HACK"}'
$anonBlocked = (@($anonUpd).Count -eq 0)
"7. Anonymous updates the class: $(if ($anonBlocked) {'0 rows -- BLOCKED, RLS OK'} else {'SUCCEEDED -- !!! FAILED !!!'})"
if (-not $anonBlocked) { $pass = $false }

# soft delete takes it off the public listing (return=minimal: a deleted row is no
# longer selectable, so asking for it back would be refused by design)
$minimal = @{ apikey = $anon; Authorization = "Bearer $($a.access_token)"; "Content-Type" = "application/json"; Prefer = "return=minimal" }
Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/classes?id=eq.$($cls.id)" -Headers $minimal -Body ("{`"deleted_at`":`"" + (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ") + "`"}") | Out-Null
$goneRead = Invoke-RestMethod -Uri "$base/rest/v1/classes?id=eq.$($cls.id)&select=id" -Headers (Api $b.access_token)
$gone = (@($goneRead).Count -eq 0)
"8. After soft delete, B reads it: $(if ($gone) {'0 rows -- OK'} else {'STILL VISIBLE -- !!! FAILED !!!'})"
if (-not $gone) { $pass = $false }

if ($pass) { "`nALL CLASS RLS CHECKS PASSED"; exit 0 } else { "`nCLASS RLS CHECKS FAILED"; exit 1 }
