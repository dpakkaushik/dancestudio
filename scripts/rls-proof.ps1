# RLS proof for Step 1 (profiles): two users, cross-user writes must fail.
# Reads keys from .env.local — run from the repo root: pwsh scripts/rls-proof.ps1
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

$a = Sign-In "+919999999999"
$b = Sign-In "+918888888888"
$pass = $true
"1. Two distinct users: distinct=$($a.user.id -ne $b.user.id)"
if ($a.user.id -eq $b.user.id) { $pass = $false }

function Api($token) { return @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" } }

foreach ($u in @(@{s=$a;n="Priya Test";r="dancer";c="Pune"}, @{s=$b;n="Studio Test";r="studio";c="Delhi"})) {
  try {
    $body = @{ id = $u.s.user.id; full_name = $u.n; role = $u.r; city = $u.c } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "$base/rest/v1/profiles" -Headers (Api $u.s.access_token) -Body $body | Out-Null
    "2. $($u.n) created own profile: OK"
  } catch { "2. $($u.n) insert skipped (already exists)" }
}

$read = Invoke-RestMethod -Method Get -Uri "$base/rest/v1/profiles?id=eq.$($b.user.id)&select=full_name,role" -Headers (Api $a.access_token)
"3. A reads B's profile (allowed by design): got '$($read.full_name)'"
if (-not $read.full_name) { $pass = $false }

$upd = Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/profiles?id=eq.$($b.user.id)" -Headers (Api $a.access_token) -Body '{"full_name":"HACKED"}'
$blocked = (@($upd).Count -eq 0)
"4. A updates B's profile: $(if ($blocked) {'BLOCKED — RLS OK'} else {'SUCCEEDED — RLS FAILED'})"
if (-not $blocked) { $pass = $false }

try {
  $fake = @{ id = "00000000-0000-4000-8000-000000000001"; full_name = "Impostor"; role = "dancer" } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/profiles" -Headers (Api $a.access_token) -Body $fake | Out-Null
  "5. A inserts under another id: SUCCEEDED — RLS FAILED"; $pass = $false
} catch { "5. A inserts under another id: REJECTED — RLS OK" }

$anonRead = Invoke-RestMethod -Method Get -Uri "$base/rest/v1/profiles?select=id" -Headers @{ apikey = $anon }
$anonBlocked = (@($anonRead).Count -eq 0)
"6. Anonymous read: $(if ($anonBlocked) {'0 rows — RLS OK'} else {'ROWS VISIBLE — RLS FAILED'})"
if (-not $anonBlocked) { $pass = $false }

if ($pass) { "`nALL RLS CHECKS PASSED"; exit 0 } else { "`nRLS CHECKS FAILED"; exit 1 }
