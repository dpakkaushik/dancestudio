# Proof for email magic-link sign-in: mints a link server-side (admin API — no
# inbox needed), lands it on the app's /auth/confirm route, and expects to come
# out signed in. Needs the dev server on http://localhost:3000.
# Run from the repo root: powershell -File scripts/auth-proof-email.ps1
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
$service = $vars["SUPABASE_SERVICE_ROLE_KEY"]
if (-not $base -or -not $service) { throw "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local" }

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$email = "pilot$stamp@example.com"

# 1. mint a sign-in link for a brand-new email user. gotrue types a new user's
# link as "signup" (returning users get "magiclink") — verify with what it says.
$adminH = @{ apikey = $service; Authorization = "Bearer $service"; "Content-Type" = "application/json" }
$link = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/admin/generate_link" -Headers $adminH -Body (@{ type = "magiclink"; email = $email } | ConvertTo-Json)
$hash = $link.hashed_token
$vtype = if ($link.verification_type) { $link.verification_type } else { "magiclink" }
"1. Minted sign-in link for $email (type=$vtype) $(if ($hash) {'-- OK'} else {'-- !!! FAILED !!!'})"
if (-not $hash) { $pass = $false }

function Land($url) {
  # PS 5.1 returns the 30x directly under -MaximumRedirection 0 (no exception)
  try {
    $r = Invoke-WebRequest -Uri $url -MaximumRedirection 0 -UseBasicParsing
    return [string]$r.Headers.Location
  } catch {
    return [string]$_.Exception.Response.GetResponseHeader("Location")
  }
}

# 2. land it on the app's confirm route -> expect a redirect to /onboarding (new user)
$landed = Land "http://localhost:3000/auth/confirm?token_hash=$hash&type=$vtype"
$landOk = $landed -like "*/onboarding*"
"2. Link lands signed in at: $landed $(if ($landOk) {'-- ONBOARDING, OK'} else {'-- !!! FAILED !!!'})"
if (-not $landOk) { $pass = $false }

# 3. a reused/expired token must bounce to the sign-in screen with an error
$bounced = Land "http://localhost:3000/auth/confirm?token_hash=$hash&type=$vtype"
$bounceOk = $bounced -like "*/login/phone?error=*"
"3. Reused link bounces to: $bounced $(if ($bounceOk) {'-- REJECTED, OK'} else {'-- !!! FAILED !!!'})"
if (-not $bounceOk) { $pass = $false }

# cleanup: delete the throwaway user so proof runs don't pile up accounts
$uid = $link.user.id
if (-not $uid) {
  $users = Invoke-RestMethod -Uri "$base/auth/v1/admin/users?page=1&per_page=10" -Headers $adminH
  $uid = ($users.users | Where-Object { $_.email -eq $email } | Select-Object -First 1).id
}
if ($uid) { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$uid" -Headers $adminH | Out-Null; "4. Throwaway user deleted" }

if ($pass) { "`nEMAIL SIGN-IN PROOF PASSED"; exit 0 } else { "`nEMAIL SIGN-IN PROOF FAILED"; exit 1 }
