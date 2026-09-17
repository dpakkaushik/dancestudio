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
$service = $vars["SUPABASE_SERVICE_ROLE_KEY"]
if (-not $service) { throw "SUPABASE_SERVICE_ROLE_KEY missing from .env.local" }
$svcH = @{ apikey = $service; Authorization = "Bearer $service"; "Content-Type" = "application/json"; Prefer = "return=representation" }

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
# 10 Sep 2026: a studio is born UNLISTED and goes public when ITS OWN subscription is live (one
# per studio, Rs 1,200 a month, renewing on its own through Cashfree). The service role stands in
# for an admin's grant here - a granted, active row at Rs 0 - and lists the studio as the grant would.
function Subscribe-Studio($tenantId) {
  $ownerRows = @(Invoke-RestMethod -Method Get -Uri "$base/rest/v1/business_members?business_id=eq.$tenantId&member_role=eq.owner&deleted_at=is.null&select=user_id" -Headers $svcH)
  $ownerId = [string]$ownerRows[0].user_id
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/subscriptions" -Headers $svcH -Body (@{
    kind = "studio"; user_id = $ownerId; business_id = $tenantId; plan_key = "studio_monthly"; price_inr = 0; period = "monthly"; status = "active"
    current_period_start = (Get-Date).ToString("yyyy-MM-dd"); current_period_end = (Get-Date).AddYears(1).ToString("yyyy-MM-dd"); granted = $true
    note = "Granted by a proof script - nothing charged"; created_by = $ownerId; updated_by = $ownerId } | ConvertTo-Json) | Out-Null
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$tenantId" -Headers $svcH -Body (@{ visibility = "listed" } | ConvertTo-Json) | Out-Null
}
$ta = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_business_with_owner" -Headers (Api $a.access_token) -Body (@{ p_name = "Class Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" } | ConvertTo-Json)
Subscribe-Studio ([string]$ta.id)
$clsBody = @{ p_business_id = $ta.id; p_title = "Hip-Hop - Beginner $stamp"; p_style = "Hip-Hop"; p_level = "beginner"; p_room = "Studio A"; p_price_inr = 300; p_capacity = 20; p_status = "draft"; p_starts_at = "2026-09-01T19:00:00+05:30"; p_ends_at = "2026-09-01T20:00:00+05:30" }
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
$bPub = Invoke-RestMethod -Uri "$base/rest/v1/classes?id=eq.$($cls.id)&select=id,title,businesses(name)" -Headers (Api $b.access_token)
$bSees = (@($bPub).Count -eq 1) -and $bPub[0].businesses.name
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

# 9-10. A CLASS BELONGS TO A STUDIO OR AN ARTIST PAGE, NEVER TO THE ORGANIZATION ITSELF
# (17 Sep 2026, the user: "classes can only be created by users with artist subscription and
# studios"). The organization's hosting row (R15) exists for its events; the database refuses a
# class on it in words (migration 20260917180000), and why_no_class says the same sentence for a
# screen to print before the form is drawn. Both checks are RED until that migration is applied.
function ErrBody($e) {
  if ($e.ErrorDetails -and $e.ErrorDetails.Message) { return [string]$e.ErrorDetails.Message }
  try { $s = $e.Exception.Response.GetResponseStream(); $s.Position = 0; return (New-Object IO.StreamReader($s)).ReadToEnd() } catch { return [string]$e.Exception.Message }
}
# my_org_business() RETURNS THE UUID ITSELF, not a row - reading `.id` off it gave "" and the
# RPC was refused for "invalid input syntax for type uuid", which check 9 rightly called the wrong reason
$hostId = [string](Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/my_org_business" -Headers (Api $a.access_token) -Body "{}")
try {
  $onOrg = $clsBody.Clone(); $onOrg["p_business_id"] = $hostId; $onOrg["p_room"] = $null; $onOrg["p_title"] = "Hip-Hop - Beginner"
  $stray = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_class_with_session" -Headers (Api $a.access_token) -Body ($onOrg | ConvertTo-Json)
  "9. The organization creates a class on its OWN hosting row: SUCCEEDED -- !!! FAILED !!!"; $pass = $false
  # do not leave a class on a production hosting row behind a red check: soft-delete it (service role)
  $gone = (Get-Date).ToUniversalTime().ToString("o")
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/class_sessions?class_id=eq.$($stray.id)&deleted_at=is.null" -Headers $svcH -Body (@{ deleted_at = $gone } | ConvertTo-Json) | Out-Null
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/classes?id=eq.$($stray.id)&deleted_at=is.null" -Headers $svcH -Body (@{ deleted_at = $gone } | ConvertTo-Json) | Out-Null
} catch {
  $why = ErrBody $_
  $orgRefused = $why -match "organization"
  "9. The organization creates a class on its OWN hosting row: REFUSED $(if ($orgRefused) {"in words ('organization') -- OK"} else {"for another reason ($why) -- !!! FAILED !!!"})"
  if (-not $orgRefused) { $pass = $false }
}
try {
  $whyStudio = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/why_no_class" -Headers (Api $a.access_token) -Body (@{ p_business_id = $ta.id } | ConvertTo-Json)
  $whyHost = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/why_no_class" -Headers (Api $a.access_token) -Body (@{ p_business_id = $hostId } | ConvertTo-Json)
} catch {
  # before 20260917180000 the function does not exist (PostgREST 404) - a clean FAIL line, not a crash
  $whyStudio = "(why_no_class missing: $(ErrBody $_))"; $whyHost = $whyStudio
}
# PostgREST's bare null reaches PowerShell 5.1 as the STRING "null" (the 14 Sep lesson)
$studioClear = ($null -eq $whyStudio) -or ("$whyStudio" -eq "null") -or ("$whyStudio" -eq "")
$hostNamed = "$whyHost" -match "organization"
"10. why_no_class: a studio -> nothing ($studioClear); the hosting row -> '$whyHost' $(if ($studioClear -and $hostNamed) {'-- OK'} else {'-- !!! FAILED !!!'})"
if (-not ($studioClear -and $hostNamed)) { $pass = $false }

if ($pass) { "`nALL CLASS RLS CHECKS PASSED"; exit 0 } else { "`nCLASS RLS CHECKS FAILED"; exit 1 }
