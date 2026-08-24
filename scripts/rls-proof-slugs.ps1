# RLS proof for Step 8 (share links): slugs are stamped, unique, and the /c/{slug}
# lookup respects the existing class visibility policies (no new policy was added).
# Reads keys from .env.local - run from the repo root: powershell -File scripts/rls-proof-slugs.ps1
$ErrorActionPreference = "Stop"

$envFile = Join-Path $PSScriptRoot "..\.env.local"
$vars = @{}
Get-Content $envFile | Where-Object { $_ -match "^\s*[A-Z_]+=" } | ForEach-Object {
  $name, $value = $_ -split "=", 2
  $vars[$name.Trim()] = $value.Trim()
}
$base = $vars["NEXT_PUBLIC_SUPABASE_URL"]
$anon = $vars["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
$service = $vars["SUPABASE_SERVICE_ROLE_KEY"]
if (-not $base -or -not $anon) { throw "NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY missing from .env.local" }

function Sign-In($phone) {
  $h = @{ apikey = $anon; "Content-Type" = "application/json" }
  Invoke-RestMethod -Method Post -Uri "$base/auth/v1/otp" -Headers $h -Body ("{`"phone`":`"$phone`"}") | Out-Null
  return Invoke-RestMethod -Method Post -Uri "$base/auth/v1/verify" -Headers $h -Body ("{`"type`":`"sms`",`"phone`":`"$phone`",`"token`":`"123456`"}")
}
function Api($token) { return @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" } }
function New-Class($headers, $tenantId, $title, $status) {
  $starts = (Get-Date).AddDays(7).ToString("yyyy-MM-ddT19:00:00+05:30")
  $ends = (Get-Date).AddDays(7).ToString("yyyy-MM-ddT20:00:00+05:30")
  $body = @{ p_tenant_id = $tenantId; p_title = $title; p_style = "Hip-Hop"; p_level = "beginner";
             p_room = "Studio A"; p_price_inr = 300; p_capacity = 10; p_status = $status;
             p_starts_at = $starts; p_ends_at = $ends } | ConvertTo-Json
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_class_with_session" -Headers $headers -Body $body
}
function By-Slug($headers, $slug) {
  return @(Invoke-RestMethod -Method Get -Uri "$base/rest/v1/classes?share_slug=eq.$slug&deleted_at=is.null&select=id,title,share_slug,status,tenants(name)" -Headers $headers)
}

$a = Sign-In "+919999999999"
$anonH = @{ apikey = $anon; "Content-Type" = "application/json" }
$pass = $true
$stamp = Get-Date -Format "HHmmss"

$ta = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_tenant_with_owner" -Headers (Api $a.access_token) -Body (@{ p_name = "Slug Proof Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" } | ConvertTo-Json)

try {
  # 1. a published class gets a slug stamped automatically, in the expected shape
  $pub = New-Class (Api $a.access_token) $ta.id "Hip-Hop Foundations $stamp" "published"
  $slugOk = ($pub.share_slug -is [string]) -and ($pub.share_slug -match "^[a-z0-9][a-z0-9-]{4,38}[a-z0-9]$")
  "1. Published class auto-stamped slug '$($pub.share_slug)': $(if ($slugOk) {'-- OK'} else {'-- !!! FAILED !!!'})"
  if (-not $slugOk) { $pass = $false }

  # 2. anonymous resolves the slug and can name the studio behind it
  $hit = By-Slug $anonH $pub.share_slug
  $anonOk = ($hit.Count -eq 1) -and ([string]$hit[0].tenants.name -eq [string]$ta.name)
  "2. Anonymous resolves the booking link (studio named '$($hit[0].tenants.name)'): $(if ($anonOk) {'-- OK'} else {'-- !!! FAILED !!!'})"
  if (-not $anonOk) { $pass = $false }

  # 3. a draft's link is dark to the public
  $draft = New-Class (Api $a.access_token) $ta.id "Secret Draft $stamp" "draft"
  $draftAnon = By-Slug $anonH $draft.share_slug
  $darkOk = $draftAnon.Count -eq 0
  "3. Anonymous resolves a draft's slug: $($draftAnon.Count) rows $(if ($darkOk) {'-- DRAFT STAYS DARK'} else {'-- !!! LEAKED !!!'})"
  if (-not $darkOk) { $pass = $false }

  # 4. the studio's own member still resolves the draft's link
  $draftMine = By-Slug (Api $a.access_token) $draft.share_slug
  $mineOk = $draftMine.Count -eq 1
  "4. Owner resolves their own draft's slug: $(if ($mineOk) {'-- OK'} else {'-- !!! FAILED !!!'})"
  if (-not $mineOk) { $pass = $false }

  # 5. the same title twice can never share a link
  $pub2 = New-Class (Api $a.access_token) $ta.id "Hip-Hop Foundations $stamp" "published"
  $uniqOk = [string]$pub2.share_slug -ne [string]$pub.share_slug
  "5. Same title, second class gets '$($pub2.share_slug)': $(if ($uniqOk) {'-- UNIQUE'} else {'-- !!! COLLIDED !!!'})"
  if (-not $uniqOk) { $pass = $false }
}
finally {
  # the proof cleans up after itself - service role removes the studio, children cascade
  if ($service) {
    $svcH = @{ apikey = $service; Authorization = "Bearer $service" }
    Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers $svcH | Out-Null
    "   (cleanup: proof studio deleted)"
  } else {
    "   (no SUPABASE_SERVICE_ROLE_KEY - proof studio $($ta.id) left behind)"
  }
}

if ($pass) { "`nALL SLUG CHECKS PASSED"; exit 0 } else { "`nSLUG CHECKS FAILED"; exit 1 }
