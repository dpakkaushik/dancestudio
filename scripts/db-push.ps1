# Apply pending migrations to the hosted project over the SESSION POOLER.
#
# The CLI is not linked on this machine, so the connection string is built here
# from .env.local rather than kept in a shell history: the password is read out
# of SUPABASE_DB_PASSWORD and percent-encoded (an '@' or a '#' in a password
# otherwise terminates the URI's userinfo and the connection fails with a
# baffling host error). Nothing is printed but the CLI's own output.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/db-push.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/db-push.ps1 -DryRun
param([switch]$DryRun)

$ErrorActionPreference = "Stop"
$PSDefaultParameterValues = @{ "Invoke-RestMethod:UserAgent" = "danceos-proof" }

$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root ".env.local"
if (-not (Test-Path $envFile)) { throw ".env.local not found at $envFile" }

$vars = @{}
Get-Content $envFile | Where-Object { $_ -match "^\s*[A-Z_]+=" } | ForEach-Object {
  $name, $value = $_ -split "=", 2
  $vars[$name.Trim()] = $value.Trim()
}

$password = $vars["SUPABASE_DB_PASSWORD"]
$url = $vars["NEXT_PUBLIC_SUPABASE_URL"]
if (-not $password) { throw "SUPABASE_DB_PASSWORD missing from .env.local" }
if (-not $url) { throw "NEXT_PUBLIC_SUPABASE_URL missing from .env.local" }

# https://<ref>.supabase.co  ->  <ref>
$ref = ([Uri]$url).Host.Split(".")[0]
$encoded = [Uri]::EscapeDataString($password)
$dbUrl = "postgresql://postgres.$ref`:$encoded@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"

Push-Location $root
try {
  if ($DryRun) {
    Write-Output "DRY RUN - migrations the CLI considers pending:"
    & npx.cmd supabase migration list --db-url $dbUrl
  } else {
    & npx.cmd supabase db push --db-url $dbUrl --include-all --yes
  }
  if ($LASTEXITCODE -ne 0) { throw "supabase CLI exited $LASTEXITCODE" }
} finally {
  Pop-Location
}
