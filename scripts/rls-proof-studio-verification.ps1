# RLS proof: VERIFICATION BELONGS TO THE STUDIO, AND A GST NUMBER TO THE ORGANIZATION (11 Sep 2026).
#
# The user: "instead of social media use GST number ... right now bypass: a Verify button - in
# format then verified, else reject. If a user doesn't have a GST he can still create a studio
# but can't create an event. The earlier logic of org verification will work for the studio:
# upload 5-10 images and social media for the studio, admin verifies it, studio gets a badge,
# then it subscribes to go live."
#
# What is proven, against the live database, as the PEOPLE involved (never the service role,
# except where it stands in for an admin's hand or a screen the owner would have used):
#   1. an organization NOBODY has verified opens a studio
#   2. the GST number cannot be written by hand; only verify_gstin moves it
#   3. verify_gstin refuses a wrong shape with the reason, accepts a right one, refuses a twin
#   4. an event is refused without the number and allowed with it
#   5. the studio's review: a link and five photos before the ask; only the owner asks; idempotent
#   6. no badge, no subscription; the owner cannot stamp the badge; an admin can, and it lists
#
# Reads keys from .env.local - run from the repo root:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/rls-proof-studio-verification.ps1
$ErrorActionPreference = "Stop"
$PSDefaultParameterValues = @{ "Invoke-RestMethod:UserAgent" = "danceos-proof"; "Invoke-WebRequest:UserAgent" = "danceos-proof" }

$envFile = Join-Path $PSScriptRoot "..\.env.local"
$vars = @{}
Get-Content $envFile | Where-Object { $_ -match "^\s*[A-Z_]+=" } | ForEach-Object {
  $name, $value = $_ -split "=", 2
  $vars[$name.Trim()] = $value.Trim()
}
$base = $vars["NEXT_PUBLIC_SUPABASE_URL"]
$anon = $vars["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
$service = $vars["SUPABASE_SERVICE_ROLE_KEY"]
if (-not $base -or -not $anon -or -not $service) { throw "NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY missing from .env.local" }

$svcH = @{ apikey = $service; Authorization = "Bearer $service"; "Content-Type" = "application/json"; Prefer = "return=representation" }
$anonH = @{ apikey = $anon; "Content-Type" = "application/json" }
function Api($token) { return @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" } }
function Rpc($headers, $fn, $body) {
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body ($body | ConvertTo-Json -Depth 8)
}
function Get-Rows($headers, $path) {
  $res = Invoke-WebRequest -Method Get -Uri "$base/rest/v1/$path" -Headers $headers -UseBasicParsing
  return ,@(($res.Content | ConvertFrom-Json) | Where-Object { $null -ne $_ })
}
function Fails($script) {
  try { & $script | Out-Null; return "" }
  catch {
    $msg = $_.Exception.Message
    $body = $_.ErrorDetails.Message
    if (-not $body) {
      try { $stream = $_.Exception.Response.GetResponseStream(); $stream.Position = 0
        $body = (New-Object System.IO.StreamReader($stream)).ReadToEnd() } catch {}
    }
    try { if ($body) { $j = $body | ConvertFrom-Json; if ($j.message) { $msg = $j.message } } } catch {}
    if (-not $msg) { $msg = "(refused)" }
    return $msg
  }
}
function Check($n, $label, $ok) {
  "$n. $label $(if ($ok) {'-- OK'} else {'-- !!! FAILED !!!'})"
  if (-not $ok) { $script:pass = $false }
}
# an organization NOBODY has verified - no tick, no GST - which is the whole point
function New-Org($email, $name) {
  $u = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/admin/users" -Headers $svcH -Body (@{
    email = $email; password = "Proof-passw0rd!"; email_confirm = $true } | ConvertTo-Json)
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/profiles" -Headers $svcH -Body (@{
    id = $u.id; full_name = $name; role = "org"; city = "Pune"; created_by = $u.id; updated_by = $u.id } | ConvertTo-Json) | Out-Null
  $tok = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $anonH -Body (@{
    email = $email; password = "Proof-passw0rd!" } | ConvertTo-Json)
  return [pscustomobject]@{ id = $u.id; email = $email; token = $tok.access_token }
}

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$digits = Get-Date -Format "mmss"
$made = @()

try {
  $a = New-Org "sv-a-$stamp@example.com" "Studio Verif A $stamp"; $made += $a.id
  $b = New-Org "sv-b-$stamp@example.com" "Studio Verif B $stamp"; $made += $b.id

  # ── 1. an unverified organization opens a studio ──
  $gate = Rpc (Api $a.token) "why_no_studio" @{}
  $ta = Rpc (Api $a.token) "create_tenant_with_owner" @{ p_name = "SV Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }
  Check 1 "An organization nobody has verified opens a studio (gate: '$gate'; studio: $($ta.id))" (($null -eq $gate -or $gate -eq "") -and $ta.id)

  # ── 2. the GST number is not written by hand ──
  $hand = Fails { Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/profiles?id=eq.$($a.id)" -Headers (Api $a.token) -Body (@{ gstin = "27HANDW${digits}A1Z5"; gstin_verified_at = [DateTime]::UtcNow.ToString("o") } | ConvertTo-Json) }
  $after = Get-Rows $svcH "profiles?id=eq.$($a.id)&select=gstin,gstin_verified_at"
  Check 2 "The owner's own PATCH of gstin is refused or ignored ('$hand'); the column is still empty" ($null -eq $after[0].gstin)

  # ── 3. verify_gstin: the reasons, the acceptance, the twin ──
  $short = Fails { Rpc (Api $a.token) "verify_gstin" @{ p_gstin = "ABC123456" } }
  $state = Fails { Rpc (Api $a.token) "verify_gstin" @{ p_gstin = "45ABCDE1234F1Z5" } }
  $shape = Fails { Rpc (Api $a.token) "verify_gstin" @{ p_gstin = "27ABCDE1234F1X5" } }
  $gstA = "27PROOF${digits}A1Z5"
  $when = Rpc (Api $a.token) "verify_gstin" @{ p_gstin = " 27proof${digits}a1z5 " }
  $rowA = Get-Rows $svcH "profiles?id=eq.$($a.id)&select=gstin,gstin_verified_at"
  Check 3 "verify_gstin says why: length ('$short'), state code ('$state'), shape ('$shape'); accepts and normalises the right one (stored: $($rowA[0].gstin))" (
    ($short -match "15 characters") -and ($state -match "state code") -and ($shape -match "shape") -and ($rowA[0].gstin -eq $gstA) -and $rowA[0].gstin_verified_at)
  $twin = Fails { Rpc (Api $b.token) "verify_gstin" @{ p_gstin = $gstA } }
  Check 4 "A second organization cannot claim the same number ('$twin')" ($twin -match "already on another")

  # ── 4. an event needs the number ──
  $whyB = Rpc (Api $b.token) "why_no_event" @{}
  $orgB = [string](Rpc (Api $b.token) "my_org_tenant" @{})
  $in10 = (Get-Date).AddDays(10).ToString("yyyy-MM-dd")
  $ev = @{ cat = "showcase"; title = "SV Showcase $stamp"; style = "All styles"; start_date = $in10; end_date = $in10; start_time = "18:00"
    venue = "Proof Hall"; address = "Kothrud"; city = "Pune"; maps_url = "https://maps.google.com/?q=Proof+Hall"; about = "Proof event"
    entry_format = "none"; bracket = 0; rounds = 0; prizes = @(); tickets_on = $false; entry_tiers = @(); ticket_tiers = @() }
  $noGst = Fails { Rpc (Api $b.token) "save_event" @{ p_tenant_id = $orgB; p_event_id = $null; p_event = $ev } }
  Rpc (Api $b.token) "verify_gstin" @{ p_gstin = "27PROOB${digits}A1Z5" } | Out-Null
  $whyB2 = Rpc (Api $b.token) "why_no_event" @{}
  $evId = Rpc (Api $b.token) "save_event" @{ p_tenant_id = $orgB; p_event_id = $null; p_event = $ev }
  Check 5 "Without a GST number: why_no_event = '$whyB'; save_event refused ('$noGst'). With one: why_no_event is null and the event saves ($evId)" (
    ($whyB -match "GST") -and ($noGst -match "GST") -and (($null -eq $whyB2) -or ($whyB2 -eq "")) -and $evId)

  # ── 5. the studio's review ──
  $noLink = Fails { Rpc (Api $a.token) "request_studio_verification" @{ p_tenant_id = $ta.id } }
  # the link is typed on the studio's Edit sheet; the service role stands in for that screen
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers $svcH -Body (@{ socials = @(@{ platform = "Instagram"; url = "https://instagram.com/svstudio" }) } | ConvertTo-Json -Depth 4) | Out-Null
  $noPhotos = Fails { Rpc (Api $a.token) "request_studio_verification" @{ p_tenant_id = $ta.id } }
  $notMine = Fails { Rpc (Api $b.token) "add_studio_proof_photo" @{ p_tenant_id = $ta.id; p_path = "proof/$($b.id)/x.png" } }
  $wrongFolder = Fails { Rpc (Api $a.token) "add_studio_proof_photo" @{ p_tenant_id = $ta.id; p_path = "proof/$($b.id)/x.png" } }
  for ($i = 1; $i -le 5; $i++) { Rpc (Api $a.token) "add_studio_proof_photo" @{ p_tenant_id = $ta.id; p_path = "proof/$($a.id)/sv-$stamp-$i.png" } | Out-Null }
  $bAsks = Fails { Rpc (Api $b.token) "request_studio_verification" @{ p_tenant_id = $ta.id } }
  $req1 = [string](Rpc (Api $a.token) "request_studio_verification" @{ p_tenant_id = $ta.id })
  $req2 = [string](Rpc (Api $a.token) "request_studio_verification" @{ p_tenant_id = $ta.id })
  $reqRow = Get-Rows $svcH "org_verification_requests?id=eq.$req1&select=status,tenant_id,org_id"
  Check 6 "No link: '$noLink'. No photos: '$noPhotos'. Another organization's photo: '$notMine'. A file outside the owner's folder: '$wrongFolder'. Another organization's ask: '$bAsks'. Then the ask files once ($req1) and is idempotent" (
    ($noLink -match "link") -and ($noPhotos -match "5 photos") -and ($notMine -match "owner") -and ($wrongFolder -match "folder") -and ($bAsks -match "owner") -and $req1 -and ($req1 -eq $req2) -and ($reqRow[0].status -eq "pending") -and ($reqRow[0].tenant_id -eq $ta.id))

  # ── 6. no badge, no subscription; the badge is DanceOS's to give ──
  $noBadge = Fails { Rpc (Api $a.token) "subscribe" @{ p_plan_key = "studio_monthly"; p_tenant_id = $ta.id } }
  $handBadge = Fails { Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers (Api $a.token) -Body (@{ verified_at = [DateTime]::UtcNow.ToString("o") } | ConvertTo-Json) }
  $tick0 = Get-Rows $svcH "tenants?id=eq.$($ta.id)&select=verified_at"
  $why0 = Rpc (Api $a.token) "why_no_studio" @{ p_tenant_id = $ta.id }
  Check 7 "Subscribe before the badge is refused ('$noBadge'); the owner's own PATCH of the badge leaves it null ('$handBadge'); the hub's sentence: '$why0'" (
    ($noBadge -match "badge") -and ($null -eq $tick0[0].verified_at) -and ($why0 -match "checking this studio"))

  # a platform admin, named through the service role - never self-serve
  $adm = New-Org "sv-admin-$stamp@example.com" "SV Admin $stamp"; $made += $adm.id
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/platform_admins" -Headers $svcH -Body (@{ user_id = $adm.id } | ConvertTo-Json) | Out-Null
  $bDecides = Fails { Rpc (Api $b.token) "decide_studio_verification" @{ p_tenant_id = $ta.id; p_approve = $true; p_note = $null } }
  Rpc (Api $adm.token) "decide_studio_verification" @{ p_tenant_id = $ta.id; p_approve = $true; p_note = "Floor, mirrors, a class in progress - approved." } | Out-Null
  $tick1 = Get-Rows $svcH "tenants?id=eq.$($ta.id)&select=verified_at,visibility"
  $reqDone = Get-Rows $svcH "org_verification_requests?id=eq.$req1&select=status"
  $why1 = Rpc (Api $a.token) "why_no_studio" @{ p_tenant_id = $ta.id }
  $told = Get-Rows $svcH "notifications?user_id=eq.$($a.id)&select=title&order=created_at.desc&limit=3"
  Check 8 "A non-admin cannot decide ('$bDecides'). The admin approves: the badge is on ($($tick1[0].verified_at)), the request is $($reqDone[0].status), the owner is told ('$($told[0].title)'), and the sentence moves to the subscription: '$why1'" (
    ($bDecides -match "admin") -and $tick1[0].verified_at -and ($reqDone[0].status -eq "approved") -and ($why1 -match "subscription") -and ($told | Where-Object { $_.title -match "verified" }))
  # still not on Discover: the badge is not the listing - the subscription is
  Check 9 "The badge alone does not list the studio (visibility: $($tick1[0].visibility))" ($tick1[0].visibility -eq "unlisted")
}
finally {
  # everything this proof made goes: users cascade to profiles, requests, photos, memberships;
  # the tenants and the event are removed by hand because they hang off memberships
  try {
    if ($ta -and $ta.id) {
      Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/subscriptions?tenant_id=eq.$($ta.id)" -Headers $svcH | Out-Null
      Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/org_proof_photos?tenant_id=eq.$($ta.id)" -Headers $svcH | Out-Null
      Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/org_verification_requests?tenant_id=eq.$($ta.id)" -Headers $svcH | Out-Null
      Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenant_members?tenant_id=eq.$($ta.id)" -Headers $svcH | Out-Null
      Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers $svcH | Out-Null
    }
    if ($evId) { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/events?id=eq.$evId" -Headers $svcH | Out-Null }
    if ($orgB) {
      Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenant_members?tenant_id=eq.$orgB" -Headers $svcH | Out-Null
      Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$orgB" -Headers $svcH | Out-Null
    }
    $orgA = Get-Rows $svcH "tenants?type=eq.org&select=id&created_by=eq.$($a.id)"
    foreach ($o in $orgA) {
      Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenant_members?tenant_id=eq.$($o.id)" -Headers $svcH | Out-Null
      Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($o.id)" -Headers $svcH | Out-Null
    }
  } catch { "cleanup note: $($_.Exception.Message)" }
  foreach ($id in $made) {
    try { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$id" -Headers $svcH | Out-Null } catch {}
  }
}

if ($pass) { "`nALL STUDIO VERIFICATION CHECKS PASSED"; exit 0 } else { "`nSTUDIO VERIFICATION CHECKS FAILED"; exit 1 }
