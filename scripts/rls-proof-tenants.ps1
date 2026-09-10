# RLS proof for Step 2 (tenants): two owners, each sees ONLY their own tenant.
# Reads keys from .env.local — run from the repo root: pwsh scripts/rls-proof-tenants.ps1
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
$pass = $true
$stamp = Get-Date -Format "HHmmss"

# 8 Sep 2026: only an ORGANIZATION opens a studio, and +918888888888 is the proofs' LEARNER (a user).
# Owner A is the test-number organization (verified - scripts/ensure-test-phone-profiles.js); owner B
# is an email organization made for this run, verified the same way (9 Sep 2026, R14: an unverified
# organization cannot create a studio at all, so B has to be).
#
# 10 Sep 2026: a studio is born UNLISTED and goes public on ITS OWN subscription (one per studio,
# Rs 1,200 a month). A's studio is subscribed - the service role standing in for an admin's grant -
# and B's never is, which is what makes B's studio the private row this proof's isolation claims
# are about. What is proven is unchanged: A never sees a row that is neither public nor A's.
$service = $vars["SUPABASE_SERVICE_ROLE_KEY"]
if (-not $service) { throw "SUPABASE_SERVICE_ROLE_KEY missing from .env.local" }
$svcH = @{ apikey = $service; Authorization = "Bearer $service"; "Content-Type" = "application/json"; Prefer = "return=representation" }
function New-OrgOwner($email, $name) {
  $u = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/admin/users" -Headers $svcH -Body (@{ email = $email; password = "Proof-passw0rd!"; email_confirm = $true } | ConvertTo-Json)
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/profiles" -Headers $svcH -Body (@{ id = $u.id; full_name = $name; role = "org"; city = "New Delhi"; created_by = $u.id; updated_by = $u.id } | ConvertTo-Json) | Out-Null
  # the organization is VERIFIED by the service role here, standing in for the admin
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/profiles?id=eq.$($u.id)" -Headers $svcH -Body (@{ verified_at = [DateTime]::UtcNow.ToString("o") } | ConvertTo-Json) | Out-Null
  return Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers @{ apikey = $anon; "Content-Type" = "application/json" } -Body (@{ email = $email; password = "Proof-passw0rd!" } | ConvertTo-Json)
}
$b = New-OrgOwner "st-ownerb-$stamp@example.com" "Owner B $stamp"

# each owner creates a studio via the RPC (tenant + owner membership, atomic)
# 10 Sep 2026: a studio is born UNLISTED and goes public when ITS OWN subscription is live (one
# per studio, Rs 1,200 a month, renewing on its own through Cashfree). The service role stands in
# for an admin's grant here - a granted, active row at Rs 0 - and lists the studio as the grant would.
function Subscribe-Studio($tenantId) {
  $ownerRows = @(Invoke-RestMethod -Method Get -Uri "$base/rest/v1/tenant_members?tenant_id=eq.$tenantId&member_role=eq.owner&deleted_at=is.null&select=user_id" -Headers $svcH)
  $ownerId = [string]$ownerRows[0].user_id
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/subscriptions" -Headers $svcH -Body (@{
    kind = "studio"; user_id = $ownerId; tenant_id = $tenantId; plan_key = "studio_monthly"; price_inr = 0; period = "monthly"; status = "active"
    current_period_start = (Get-Date).ToString("yyyy-MM-dd"); current_period_end = (Get-Date).AddYears(1).ToString("yyyy-MM-dd"); granted = $true
    note = "Granted by a proof script - nothing charged"; created_by = $ownerId; updated_by = $ownerId } | ConvertTo-Json) | Out-Null
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenants?id=eq.$tenantId" -Headers $svcH -Body (@{ visibility = "listed" } | ConvertTo-Json) | Out-Null
}
$ta = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_tenant_with_owner" -Headers (Api $a.access_token) -Body (@{ p_name = "Studio A $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" } | ConvertTo-Json)
Subscribe-Studio ([string]$ta.id)
$tb = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_tenant_with_owner" -Headers (Api $b.access_token) -Body (@{ p_name = "Studio B $stamp"; p_type = "studio"; p_area = "Saket"; p_city = "New Delhi" } | ConvertTo-Json)
# A's studio is subscribed and listed (Subscribe-Studio above); B's is neither, so it stays the
# private row this proof's isolation claims are about
"1. A created '$($ta.name)' (subscribed, public); B created '$($tb.name)' (unsubscribed, private)"
if (-not $ta.id -or -not $tb.id) { $pass = $false }

# A lists tenants — must contain A's studio and NEVER B's
$mineA = Invoke-RestMethod -Uri "$base/rest/v1/tenants?select=id,name" -Headers (Api $a.access_token)
$seesOwn = @($mineA | Where-Object { $_.id -eq $ta.id }).Count -eq 1
$seesB = @($mineA | Where-Object { $_.id -eq $tb.id }).Count -gt 0
"2. A sees own studio: $seesOwn; A sees B's UNLISTED studio: $seesB $(if ($seesOwn -and -not $seesB) {'-- ISOLATION OK'} else {'-- !!! FAILED !!!'})"
if (-not $seesOwn -or $seesB) { $pass = $false }

# A tries to read B's tenant directly by id — must get 0 rows
$readB = Invoke-RestMethod -Uri "$base/rest/v1/tenants?id=eq.$($tb.id)&select=id" -Headers (Api $a.access_token)
$blockedRead = (@($readB).Count -eq 0)
"3. A reads B's tenant by id: $(if ($blockedRead) {'0 rows -- BLOCKED, RLS OK'} else {'VISIBLE -- !!! FAILED !!!'})"
if (-not $blockedRead) { $pass = $false }

# A tries to rename B's tenant — must affect 0 rows
$upd = Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenants?id=eq.$($tb.id)" -Headers (Api $a.access_token) -Body '{"name":"HACKED"}'
$blockedUpd = (@($upd).Count -eq 0)
"4. A renames B's tenant: $(if ($blockedUpd) {'0 rows -- BLOCKED, RLS OK'} else {'SUCCEEDED -- !!! FAILED !!!'})"
if (-not $blockedUpd) { $pass = $false }

# A tries to add themselves to B's tenant directly — no insert policy, must be rejected
try {
  $body = @{ tenant_id = $tb.id; user_id = $a.user.id; member_role = "owner" } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/tenant_members" -Headers (Api $a.access_token) -Body $body | Out-Null
  "5. A self-invites into B's tenant: SUCCEEDED -- !!! FAILED !!!"; $pass = $false
} catch { "5. A self-invites into B's tenant: REJECTED -- RLS OK" }

# anonymous sees LISTED tenants (Step 5, by design) and never an UNLISTED one
$anonRead = Invoke-RestMethod -Uri "$base/rest/v1/tenants?select=id" -Headers @{ apikey = $anon }
$anonSeesA = @($anonRead | Where-Object { $_.id -eq $ta.id }).Count -eq 1
$anonSeesB = @($anonRead | Where-Object { $_.id -eq $tb.id }).Count -gt 0
"6. Anonymous sees A's listed studio: $anonSeesA; B's unlisted one: $anonSeesB $(if ($anonSeesA -and -not $anonSeesB) {'-- RLS OK'} else {'-- !!! FAILED !!!'})"
if (-not $anonSeesA -or $anonSeesB) { $pass = $false }

# B's owner is this run's; the studio it made stays unlisted and soft-deletable by the cleanup script
Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($b.user.id)" -Headers $svcH | Out-Null

if ($pass) { "`nALL TENANT RLS CHECKS PASSED"; exit 0 } else { "`nTENANT RLS CHECKS FAILED"; exit 1 }
