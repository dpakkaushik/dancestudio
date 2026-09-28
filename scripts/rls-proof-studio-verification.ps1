# RLS proof: VERIFICATION BELONGS TO THE STUDIO (11 Sep 2026).
#
# The user: "the earlier logic of org verification will work for the studio: upload 5-10 images
# and social media for the studio, admin verifies it, studio gets a badge, then it subscribes to
# go live."
#
# What is proven, against the live database, as the PEOPLE involved (never the service role,
# except where it stands in for an admin's hand or a screen the owner would have used):
#   1. a PERSON nobody has verified opens a studio (26 Sep 2026: any account may)
#   2. the studio's review: a link and five photos before the ask; only the owner asks; idempotent
#   3. the mandate may start before the badge (27 Sep 2026, "pay at creation, verify after") and
#      it buys nothing public; the owner cannot stamp the badge
#   3b. a platform admin reads the unlisted studio it is reviewing; another person cannot
#   4. an admin approves: the badge lands, the owner is told, the sentence moves on
#   5. the badge alone does not list the studio - the subscription is what does
#   6. the badge can be revoked and given again
#
# !! THE GST HALF WENT WITH ORGANIZATIONS AND EVENTS (29 Sep 2026). It was the user's other
# sentence - "instead of social media use GST number ... if a user doesn't have a GST he can
# still create a studio but can't create an event" - and it was four checks, every one of them
# on a business of type `org`. See the note above check 2.
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
. (Join-Path $PSScriptRoot "proof-lib.ps1")   # New-Studio / Subscribe-Studio / Assert-City / Publish-Class (see that file)

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
# a why_no_* function answering NULL comes back from PostgREST as the four-character body `null`,
# which Invoke-RestMethod hands over as the STRING "null" - so "no sentence" has two spellings
function NoSentence($v) { return ($null -eq $v) -or ("$v" -eq "") -or ("$v" -eq "null") }
# a PERSON nobody has verified - no tick, no GST - which is the whole point.
# (26 Sep 2026: role `user`; the organization login is retired. Named New-Person
# so it does not shadow proof-lib's New-Org, which makes the org BUSINESS below.)
function New-Person($email, $name) {
  $u = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/admin/users" -Headers $svcH -Body (@{
    email = $email; password = "Proof-passw0rd!"; email_confirm = $true } | ConvertTo-Json)
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/profiles" -Headers $svcH -Body (@{
    id = $u.id; full_name = $name; role = "user"; city = "Pune"; created_by = $u.id; updated_by = $u.id } | ConvertTo-Json) | Out-Null
  $tok = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $anonH -Body (@{
    email = $email; password = "Proof-passw0rd!" } | ConvertTo-Json)
  return [pscustomobject]@{ id = $u.id; email = $email; token = $tok.access_token }
}

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$made = @()

try {
  $a = New-Person "sv-a-$stamp@example.com" "Studio Verif A $stamp"; $made += $a.id
  $b = New-Person "sv-b-$stamp@example.com" "Studio Verif B $stamp"; $made += $b.id

  # ── 1. a person nobody has verified opens a studio ──
  $gate = Rpc (Api $a.token) "why_no_studio" @{}
  $ta = New-Studio $a.token "SV Studio $stamp" "Kothrud" "Pune"
  Check 1 "A person nobody has verified opens a studio (gate: '$gate'; studio: $($ta.id))" ((NoSentence $gate) -and $ta.id)

  # !! CHECKS 2-5b WENT WITH ORGANIZATIONS AND EVENTS (29 Sep 2026, the user:
  # "remove Organization and Events completely"). They were the GST NUMBER from
  # end to end - that it cannot be written by hand (2), what `verify_business_gstin`
  # refuses and accepts (3), that a second organization cannot claim the same one
  # (4), that an EVENT needs it (5) and that clearing it shuts the events door
  # again (5b). Every one of them needed a business of type `org`, which nothing
  # makes now, and the last two needed an event on top of that.
  #
  # !! THE GST NUMBER IS NOT A STUDIO'S AND NEVER WAS: check 3 asserted exactly
  # that ("a STUDIO takes none"), so there is no half of this block to keep. The
  # RPCs - `verify_business_gstin`, `clear_business_gstin`, `why_no_event` - are
  # the migration's to drop, along with `lib/gst/gstin.ts` and its own proof.

  # ── 2. the studio's review ──
  $noLink = Fails { Rpc (Api $a.token) "request_studio_verification" @{ p_business_id = $ta.id } }
  # the link is typed on the studio's Edit sheet; the service role stands in for that screen
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$($ta.id)" -Headers $svcH -Body (@{ socials = @(@{ platform = "Instagram"; url = "https://instagram.com/svstudio" }) } | ConvertTo-Json -Depth 4) | Out-Null
  $noPhotos = Fails { Rpc (Api $a.token) "request_studio_verification" @{ p_business_id = $ta.id } }
  $notMine = Fails { Rpc (Api $b.token) "add_studio_photo" @{ p_business_id = $ta.id; p_path = "proof/$($b.id)/x.png" } }
  $wrongFolder = Fails { Rpc (Api $a.token) "add_studio_photo" @{ p_business_id = $ta.id; p_path = "proof/$($b.id)/x.png" } }
  for ($i = 1; $i -le 5; $i++) { Rpc (Api $a.token) "add_studio_photo" @{ p_business_id = $ta.id; p_path = "proof/$($a.id)/sv-$stamp-$i.png" } | Out-Null }
  $bAsks = Fails { Rpc (Api $b.token) "request_studio_verification" @{ p_business_id = $ta.id } }
  $req1 = [string](Rpc (Api $a.token) "request_studio_verification" @{ p_business_id = $ta.id })
  $req2 = [string](Rpc (Api $a.token) "request_studio_verification" @{ p_business_id = $ta.id })
  $reqRow = Get-Rows $svcH "studio_verification_requests?id=eq.$req1&select=status,business_id,org_id"
  Check 2 "No link: '$noLink'. No photos: '$noPhotos'. Another person's photo: '$notMine'. A file outside the owner's folder: '$wrongFolder'. Another person's ask: '$bAsks'. Then the ask files once ($req1) and is idempotent" (
    ($noLink -match "link") -and ($noPhotos -match "5 photos") -and ($notMine -match "owner") -and ($wrongFolder -match "folder") -and ($bAsks -match "owner") -and $req1 -and ($req1 -eq $req2) -and ($reqRow[0].status -eq "pending") -and ($reqRow[0].business_id -eq $ta.id))

  # -- 6. PAYING COMES FIRST NOW, and the badge is still DanceOS's to give.
  #    Re-cut 27 Sep 2026: this asserted that `subscribe` REFUSED an unverified
  #    studio ("the badge comes first"), which was right until the user chose
  #    "pay at creation, verify after" and 20260927100000 took that refusal out.
  #    A test that describes a DECISION is the thing that changes when the
  #    decision does - so it proves the rule that replaced it, at BOTH ends:
  #    the mandate may be started, and it buys nothing public.
  try { Rpc (Api $a.token) "subscribe" @{ p_plan_key = "studio_monthly"; p_business_id = $ta.id } | Out-Null } catch { }
  $subRow = Get-Rows $svcH "subscriptions?business_id=eq.$($ta.id)&kind=eq.studio&deleted_at=is.null&select=status,plan_key"
  $handBadge = Fails { Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$($ta.id)" -Headers (Api $a.token) -Body (@{ verified_at = [DateTime]::UtcNow.ToString("o") } | ConvertTo-Json) }
  $tick0 = Get-Rows $svcH "businesses?id=eq.$($ta.id)&select=verified_at,visibility"
  $why0 = Rpc (Api $a.token) "why_no_studio" @{ p_business_id = $ta.id }
  # and listing it anyway does not happen - the half that matters.
  # WARNING the refusal is SILENT: 20260913100000 closed the column-less update
  # policy, so the owner's PATCH of `visibility` is refused by the POLICY (0
  # rows) and never reaches guard_business_visibility to raise anything. Reading
  # the message would assert '' for ever and pass whatever the door did - the
  # 11 Sep lesson. READ THE COLUMN BACK instead.
  Fails { Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$($ta.id)" -Headers (Api $a.token) -Body (@{ visibility = "listed" } | ConvertTo-Json) } | Out-Null
  $after = Get-Rows $svcH "businesses?id=eq.$($ta.id)&select=verified_at,visibility"
  Check 3 "An unverified studio may start its mandate (status '$(if ($subRow.Count) { $subRow[0].status } else { 'none' })'), and it buys nothing public: '$($tick0[0].visibility)' before and '$($after[0].visibility)' after its owner tried to list it; the owner's own PATCH of the badge leaves it null ('$handBadge'); the hub's sentence: '$why0'" (
    ($subRow.Count -eq 1) -and ($subRow[0].status -eq "pending_auth") -and ($subRow[0].plan_key -eq "studio_monthly") -and
    ($tick0[0].visibility -eq "unlisted") -and ($after[0].visibility -eq "unlisted") -and
    ($null -eq $after[0].verified_at) -and ($why0 -match "checking this studio"))

  # a platform admin, named through the service role - never self-serve
  $adm = New-Person "sv-admin-$stamp@example.com" "SV Admin $stamp"; $made += $adm.id
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/platform_admins" -Headers $svcH -Body (@{ user_id = $adm.id } | ConvertTo-Json) | Out-Null
  # 14 Sep 2026: the desk reads the studio under RLS, and a studio under review is UNLISTED - so
  # the admin must be able to read a tenant it is neither a member of nor able to see on Discover,
  # while another organization still cannot. Found when the queue drew the organization's name
  # over a studio that had just submitted a link and five photos.
  $adminSees = Get-Rows (Api $adm.token) "businesses?id=eq.$($ta.id)&select=id,name,visibility"
  $bSees = Get-Rows (Api $b.token) "businesses?id=eq.$($ta.id)&select=id"
  Check "3b" "The admin reads the unlisted studio it is reviewing ($($adminSees.Count) row, visibility $($adminSees[0].visibility)); another person reads nothing ($($bSees.Count) rows)" (($adminSees.Count -eq 1) -and ($adminSees[0].visibility -eq "unlisted") -and ($bSees.Count -eq 0))
  $bDecides = Fails { Rpc (Api $b.token) "decide_studio_verification" @{ p_business_id = $ta.id; p_approve = $true; p_note = $null } }
  Rpc (Api $adm.token) "decide_studio_verification" @{ p_business_id = $ta.id; p_approve = $true; p_note = "Floor, mirrors, a class in progress - approved." } | Out-Null
  $tick1 = Get-Rows $svcH "businesses?id=eq.$($ta.id)&select=verified_at,visibility"
  $reqDone = Get-Rows $svcH "studio_verification_requests?id=eq.$req1&select=status"
  $why1 = Rpc (Api $a.token) "why_no_studio" @{ p_business_id = $ta.id }
  $told = Get-Rows $svcH "notifications?user_id=eq.$($a.id)&select=title&order=created_at.desc&limit=3"
  Check 4 "A non-admin cannot decide ('$bDecides'). The admin approves: the badge is on ($($tick1[0].verified_at)), the request is $($reqDone[0].status), the owner is told ('$($told[0].title)'), and the sentence moves to the subscription: '$why1'" (
    ($bDecides -match "admin") -and $tick1[0].verified_at -and ($reqDone[0].status -eq "approved") -and ($why1 -match "subscription") -and ($told | Where-Object { $_.title -match "verified" }))
  # still not on Discover: the badge is not the listing - the subscription is
  Check 5 "The badge alone does not list the studio (visibility: $($tick1[0].visibility))" ($tick1[0].visibility -eq "unlisted")

  # ── 7. the badge can be taken off (the Approved tab's Revoke), and given again ──
  Rpc (Api $adm.token) "decide_studio_verification" @{ p_business_id = $ta.id; p_approve = $false; p_note = "Revoked by the proof - the photos were of another floor." } | Out-Null
  $tick2 = Get-Rows $svcH "businesses?id=eq.$($ta.id)&select=verified_at"
  $why2 = Rpc (Api $a.token) "why_no_studio" @{ p_business_id = $ta.id }
  Rpc (Api $adm.token) "decide_studio_verification" @{ p_business_id = $ta.id; p_approve = $true; p_note = $null } | Out-Null
  $tick3 = Get-Rows $svcH "businesses?id=eq.$($ta.id)&select=verified_at"
  Check 6 "Revoke takes the badge off (now: $($tick2[0].verified_at)) and the sentence goes back to the ask: '$why2'; approving again puts it on ($($tick3[0].verified_at))" (
    ($null -eq $tick2[0].verified_at) -and ($why2 -match "verify") -and $tick3[0].verified_at)
}
finally {
  # everything this proof made goes: users cascade to profiles, requests, photos, memberships;
  # the studio is removed by hand because it hangs off memberships
  try {
    if ($ta -and $ta.id) {
      Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/subscriptions?business_id=eq.$($ta.id)" -Headers $svcH | Out-Null
      Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/studio_photos?business_id=eq.$($ta.id)" -Headers $svcH | Out-Null
      Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/studio_verification_requests?business_id=eq.$($ta.id)" -Headers $svcH | Out-Null
      Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/business_members?business_id=eq.$($ta.id)" -Headers $svcH | Out-Null
      Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/businesses?id=eq.$($ta.id)" -Headers $svcH | Out-Null
    }
  } catch { "cleanup note: $($_.Exception.Message)" }
  foreach ($id in $made) {
    try { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$id" -Headers $svcH | Out-Null } catch {}
  }
}

if ($pass) { "`nALL STUDIO VERIFICATION CHECKS PASSED"; exit 0 } else { "`nSTUDIO VERIFICATION CHECKS FAILED"; exit 1 }
