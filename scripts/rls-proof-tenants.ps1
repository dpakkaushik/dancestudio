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
$b = Sign-In "+918888888888"
$pass = $true
$stamp = Get-Date -Format "HHmmss"

# each owner creates a studio via the RPC (tenant + owner membership, atomic)
$ta = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_tenant_with_owner" -Headers (Api $a.access_token) -Body (@{ p_name = "Studio A $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" } | ConvertTo-Json)
$tb = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_tenant_with_owner" -Headers (Api $b.access_token) -Body (@{ p_name = "Studio B $stamp"; p_type = "studio"; p_area = "Saket"; p_city = "New Delhi" } | ConvertTo-Json)
"1. A created '$($ta.name)'; B created '$($tb.name)'"
if (-not $ta.id -or -not $tb.id) { $pass = $false }

# A lists tenants — must contain A's studio and NEVER B's
$mineA = Invoke-RestMethod -Uri "$base/rest/v1/tenants?select=id,name" -Headers (Api $a.access_token)
$seesOwn = @($mineA | Where-Object { $_.id -eq $ta.id }).Count -eq 1
$seesB = @($mineA | Where-Object { $_.id -eq $tb.id }).Count -gt 0
"2. A sees own studio: $seesOwn; A sees B's studio: $seesB $(if ($seesOwn -and -not $seesB) {'-- ISOLATION OK'} else {'-- !!! FAILED !!!'})"
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

# anonymous sees no tenants
$anonRead = Invoke-RestMethod -Uri "$base/rest/v1/tenants?select=id" -Headers @{ apikey = $anon }
$anonBlocked = (@($anonRead).Count -eq 0)
"6. Anonymous reads tenants: $(if ($anonBlocked) {'0 rows -- RLS OK'} else {'VISIBLE -- !!! FAILED !!!'})"
if (-not $anonBlocked) { $pass = $false }

if ($pass) { "`nALL TENANT RLS CHECKS PASSED"; exit 0 } else { "`nTENANT RLS CHECKS FAILED"; exit 1 }
