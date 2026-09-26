# Proof for 20260919170000_memberships (written 20 Sep 2026), as real roles
# against the live database. Runs ONLY on the migrated schema.
#
# !! THIS SLICE SHIPPED WITHOUT ONE, and that was the gap NEXT TO DO #0a1 named.
# Its cover was a rolled-back dry run (31/31) that no longer exists and one e2e
# segment that reaches the four-field form and the usage page - and SPENDING A
# PASS was proven by the dry run alone, because every class in the happy path's
# story is already booked by the one learner it has. So the one behaviour the
# whole feature is FOR had nothing re-checking it on the migrated schema.
#
# The claims under test, and they are the ones money rests on (Rule 9):
#   * only an owner sells; a person on the seller's own team is refused IN WORDS
#   * the CAP holds, and nobody holds two live passes of the same membership
#   * a free pass is ACTIVE at once; a PRICED one is pending_payment and CANNOT
#     be spent until the money lands
#   * the two class switches decide whose pass a class takes - read by
#     passes_for_session, so a bar never offers a pass the RPC would refuse
#   * SPENDING ONE takes the seat and the units together, refuses somebody
#     else's pass and refuses one with too little left
#   * CANCELLING THE SEAT PUTS THE UNIT BACK (the trigger, whichever door cancels)
#   * a rival reads no holder and no usage; the price is public, who holds one is not
#   * no direct writes to any of the three tables
#
# ASCII ONLY (the 11 Sep 2026 lesson). Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-memberships.ps1
$ErrorActionPreference = "Stop"
$PSDefaultParameterValues = @{ "Invoke-RestMethod:UserAgent" = "danceos-proof"; "Invoke-WebRequest:UserAgent" = "danceos-proof" }

$envFile = Join-Path $PSScriptRoot "..\.env.local"
$vars = @{}
Get-Content $envFile | Where-Object { $_ -match "^\s*[A-Z_]+\s*=" } | ForEach-Object {
  $name, $value = $_ -split "=", 2
  $vars[$name.Trim()] = $value.Trim()
}
$base = $vars["NEXT_PUBLIC_SUPABASE_URL"]
$anon = $vars["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
$service = $vars["SUPABASE_SERVICE_ROLE_KEY"]
if (-not $base -or -not $anon -or -not $service) { throw "Supabase keys missing from .env.local" }

$svcH = @{ apikey = $service; Authorization = "Bearer $service"; "Content-Type" = "application/json"; Prefer = "return=representation" }
$adminH = @{ apikey = $service; Authorization = "Bearer $service"; "Content-Type" = "application/json" }
$anonH = @{ apikey = $anon; "Content-Type" = "application/json" }

. (Join-Path $PSScriptRoot "proof-lib.ps1")   # New-Studio / Subscribe-Studio / Publish-Class / Assert-City

function Api($token) { return @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" } }
function Rpc($headers, $fn, $body) {
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body ($body | ConvertTo-Json -Depth 8)
}
# an RPC's rows counted off the RAW text - PowerShell 5.1 reads a JSON [] as one item
function Rpc-Rows($headers, $fn, $body) {
  $res = Invoke-WebRequest -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body ($body | ConvertTo-Json -Depth 8) -UseBasicParsing
  if ($res.Content.Trim() -eq "[]") { return ,@() }
  return ,@(($res.Content | ConvertFrom-Json) | Where-Object { $null -ne $_ })
}
function Get-Rows($headers, $path) {
  $res = Invoke-WebRequest -Method Get -Uri "$base/rest/v1/$path" -Headers $headers -UseBasicParsing
  if ($res.Content.Trim() -eq "[]") { return ,@() }
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
    return $msg
  }
}
function Check($n, $label, $ok) {
  "$n. $label $(if ($ok) {'-- OK'} else {'-- !!! FAILED !!!'})"
  if (-not $ok) { $script:pass = $false }
}
function New-EmailUser($email, $name, $role) {
  $u = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/admin/users" -Headers $adminH -Body (@{
    email = $email; password = "Proof-passw0rd!"; email_confirm = $true } | ConvertTo-Json)
  $styles = @()
  if ($role -eq "user") { $styles = @("Hip-Hop") }
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/profiles" -Headers $svcH -Body (@{
    id = $u.id; full_name = $name; role = $role; city = "Pune"; styles = $styles; created_by = $u.id; updated_by = $u.id } | ConvertTo-Json) | Out-Null
  # 26 Sep 2026: the organization LOGIN is retired - every account here is a person
  $tok = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $anonH -Body (@{
    email = $email; password = "Proof-passw0rd!" } | ConvertTo-Json)
  return [pscustomobject]@{ id = $u.id; email = $email; name = $name; token = $tok.access_token }
}
# a published class with a future session, its teacher seated and then erased
function New-Class($headers, $tenantId, $title, $cap, $hoursFromNow, $lengthHours, $teacherId) {
  $starts = [DateTime]::UtcNow.AddHours($hoursFromNow)
  $c = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_class_with_session" -Headers $headers -Body (@{
    p_business_id = $tenantId; p_title = $title; p_style = "Hip-Hop"; p_level = "beginner"
    p_room = "Studio A"; p_price_inr = 0; p_capacity = $cap; p_status = "draft"
    p_starts_at = $starts.ToString("o"); p_ends_at = $starts.AddHours($lengthHours).ToString("o") } | ConvertTo-Json)
  Publish-Class ([string]$c.id) $teacherId $headers
  $s = Get-Rows $svcH "class_sessions?class_id=eq.$([string]$c.id)&select=id"
  return [pscustomobject]@{ id = [string]$c.id; sessionId = [string]$s[0].id }
}
function Pass-Of($passId) { return (Get-Rows $svcH "membership_passes?id=eq.$passId&select=status,units_total,units_used")[0] }

Assert-City "Pune"

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$org = New-EmailUser "memproof-org-$stamp@example.com" "MemProof Owner $stamp" "user"
$rival = New-EmailUser "memproof-rival-$stamp@example.com" "MemProof Rival $stamp" "user"
$learner = New-EmailUser "memproof-learner-$stamp@example.com" "MemProof Learner $stamp" "user"
$other = New-EmailUser "memproof-other-$stamp@example.com" "MemProof Other $stamp" "user"
$onTeam = New-EmailUser "memproof-team-$stamp@example.com" "MemProof Team $stamp" "user"

$studio = New-Studio $org.token "MemProof Studio $stamp" "Kothrud" "Pune"
$studioId = [string]$studio.id
Subscribe-Studio $studioId
$rivalBiz = New-Studio $rival.token "MemProof Rival Studio $stamp" "Baner" "Pune"
$rivalId = [string]$rivalBiz.id
Subscribe-Studio $rivalId
# somebody on the seller's own team - the one signed-in person who may NOT buy
Invoke-RestMethod -Method Post -Uri "$base/rest/v1/business_members" -Headers $svcH -Body (@{
  business_id = $studioId; user_id = $onTeam.id; member_role = "trainer"; created_by = $org.id; updated_by = $org.id } | ConvertTo-Json) | Out-Null

try {
  # -- 1. ONLY AN OWNER SELLS ONE, AND THE FOUR THINGS ARE THE FOUR THINGS ------
  $notMine = Fails { Rpc (Api $learner.token) "save_membership" @{ p_membership_id = $null; p_business_id = $studioId
    p_name = "Sneaky Pack"; p_unit = "classes"; p_units = 4; p_price_inr = 0; p_total_count = 5; p_status = "live" } }
  $nonsense = Fails { Rpc (Api $org.token) "save_membership" @{ p_membership_id = $null; p_business_id = $studioId
    p_name = "Bad Pack"; p_unit = "weeks"; p_units = 4; p_price_inr = 0; p_total_count = 5; p_status = "live" } }
  $free = Rpc (Api $org.token) "save_membership" @{ p_membership_id = $null; p_business_id = $studioId
    p_name = "MemProof Four $stamp"; p_unit = "classes"; p_units = 4; p_price_inr = 0; p_total_count = 2; p_status = "live" }
  $freeId = [string]$free.id
  Check 1 "A stranger cannot sell from this studio ($notMine); a unit that is not classes-or-hours is refused ($nonsense); the owner's four fields are stored ($($free.unit) x $($free.units), Rs $($free.price_inr), $($free.total_count) of them)" (
    ($notMine -ne "") -and ($nonsense -ne "") -and ($free.unit -eq "classes") -and ([int]$free.total_count -eq 2) -and ($free.status -eq "live"))

  # -- 2. WHO MAY TAKE ONE, AND THE ONE PERSON WHO MAY NOT ---------------------
  # !! The team refusal is the one that reads like a broken button if it is not a
  # sentence - the 19 Sep happy path met exactly that and showed a bare dash.
  $whyLearner = Rpc (Api $learner.token) "why_no_membership" @{ p_membership_id = $freeId }
  $whyTeam = Rpc (Api $onTeam.token) "why_no_membership" @{ p_membership_id = $freeId }
  $teamBuys = Fails { Rpc (Api $onTeam.token) "buy_membership" @{ p_membership_id = $freeId } }
  Check 2 "A learner is told nothing stands in the way; somebody on the team is told why in words ('$whyTeam') and is refused" (
    (-not $whyLearner -or [string]$whyLearner -eq "null" -or [string]$whyLearner -eq "") -and
    ("$whyTeam" -match "on this team") -and ($teamBuys -ne ""))

  # -- 3. A FREE PASS IS ACTIVE AT ONCE, AND NOBODY HOLDS TWO LIVE ONES --------
  $p1 = Rpc (Api $learner.token) "buy_membership" @{ p_membership_id = $freeId }
  $p1Id = [string]$p1.id
  $twice = Fails { Rpc (Api $learner.token) "buy_membership" @{ p_membership_id = $freeId } }
  $whyTwice = Rpc (Api $learner.token) "why_no_membership" @{ p_membership_id = $freeId }
  Check 3 "A free pass is active the moment it is taken ($($p1.status), $($p1.units_total) units at Rs $($p1.price_inr)); a second is refused, and the sentence says why ('$whyTwice')" (
    ($p1.status -eq "active") -and ([decimal]$p1.units_total -eq 4) -and ($twice -ne "") -and ("$whyTwice" -match "already hold"))

  # -- 4. THE CAP IS THE CAP ---------------------------------------------------
  $p2 = Rpc (Api $other.token) "buy_membership" @{ p_membership_id = $freeId }
  $third = New-EmailUser "memproof-third-$stamp@example.com" "MemProof Third $stamp" "user"
  $whyFull = Rpc (Api $third.token) "why_no_membership" @{ p_membership_id = $freeId }
  $tooMany = Fails { Rpc (Api $third.token) "buy_membership" @{ p_membership_id = $freeId } }
  $shrink = Fails { Rpc (Api $org.token) "save_membership" @{ p_membership_id = $freeId; p_business_id = $studioId
    p_name = "MemProof Four $stamp"; p_unit = "classes"; p_units = 4; p_price_inr = 0; p_total_count = 1; p_status = "live" } }
  Check 4 "Two of two are taken, the third is told so ('$whyFull') and refused; the count cannot be cut below what is sold ($shrink)" (
    ("$whyFull" -match "have been taken") -and ($tooMany -ne "") -and ($shrink -match "cannot go below"))

  # -- 5. A PRICED PASS IS NOT A PAID PASS -------------------------------------
  # !! Rule 9. The money rides the class rail, so this is the one thing between
  # somebody pressing Buy and dancing for nothing: the pass exists, and it is inert.
  $paid = Rpc (Api $org.token) "save_membership" @{ p_membership_id = $null; p_business_id = $studioId
    p_name = "MemProof Paid $stamp"; p_unit = "classes"; p_units = 2; p_price_inr = 1500; p_total_count = 5; p_status = "live" }
  $pp = Rpc (Api $learner.token) "buy_membership" @{ p_membership_id = [string]$paid.id }
  Check 5 "A priced membership hands back a pass that has NOT been paid for ($($pp.status)), at the price it was sold at (Rs $($pp.price_inr))" (
    ($pp.status -eq "pending_payment") -and ([int]$pp.price_inr -eq 1500))

  # -- 6. THE TWO SWITCHES DECIDE WHOSE PASS A CLASS TAKES ---------------------
  $cls = New-Class (Api $org.token) $studioId "MemProof Class $stamp" 3 48 1 $learner.id
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/classes?id=eq.$($cls.id)" -Headers (Api $org.token) -Body '{"allows_studio_memberships":false}' | Out-Null
  $offered = Rpc-Rows (Api $learner.token) "passes_for_session" @{ p_session_id = $cls.sessionId }
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/classes?id=eq.$($cls.id)" -Headers (Api $org.token) -Body '{"allows_studio_memberships":true}' | Out-Null
  $onNow = Rpc-Rows (Api $learner.token) "passes_for_session" @{ p_session_id = $cls.sessionId }
  $onlyLive = @($onNow | Where-Object { [string]$_.pass_id -eq $p1Id })
  $pendingOffered = @($onNow | Where-Object { [string]$_.pass_id -eq [string]$pp.id })
  Check 6 "Switched off the class offers no pass ($($offered.Count)); switched on it offers the live one and never the unpaid one ($($onNow.Count) offered, live $($onlyLive.Count), pending $($pendingOffered.Count))" (
    ($offered.Count -eq 0) -and ($onlyLive.Count -eq 1) -and ($pendingOffered.Count -eq 0) -and ($onlyLive[0].enough -eq $true))

  # -- 7. SPENDING ONE TAKES THE SEAT AND THE UNITS TOGETHER -------------------
  $notMinePass = Fails { Rpc (Api $other.token) "book_with_membership" @{ p_session_id = $cls.sessionId; p_pass_id = $p1Id } }
  $unpaidSpend = Fails { Rpc (Api $learner.token) "book_with_membership" @{ p_session_id = $cls.sessionId; p_pass_id = [string]$pp.id } }
  $booking = Rpc (Api $learner.token) "book_with_membership" @{ p_session_id = $cls.sessionId; p_pass_id = $p1Id }
  $after = Pass-Of $p1Id
  $use = Get-Rows $svcH "membership_uses?class_booking_id=eq.$([string]$booking.id)&deleted_at=is.null&select=units"
  Check 7 "Somebody else's pass is refused ($notMinePass); an UNPAID one is refused ($unpaidSpend); the seat is taken ($($booking.status)) and one unit with it ($($after.units_used) of $($after.units_total), use row $($use.Count))" (
    ($notMinePass -ne "") -and ($unpaidSpend -match "not active") -and ($booking.status -eq "enrolled") -and
    ([decimal]$after.units_used -eq 1) -and ($use.Count -eq 1))

  # -- 8. CANCELLING THE SEAT PUTS THE UNIT BACK -------------------------------
  # The trigger sits on class_bookings, so it holds whichever door cancels - this
  # one goes through the LEARNER'S OWN cancel, not through a service-role update.
  Rpc (Api $learner.token) "cancel_class_booking_with_reason" @{ p_class_booking_id = [string]$booking.id; p_reason = "Changed my mind" } | Out-Null
  $back = Pass-Of $p1Id
  $useGone = Get-Rows $svcH "membership_uses?class_booking_id=eq.$([string]$booking.id)&deleted_at=is.null&select=id"
  Check 8 "The learner cancels and the unit comes back ($($back.units_used) of $($back.units_total)), the use row with it ($($useGone.Count) live)" (
    ([decimal]$back.units_used -eq 0) -and ($useGone.Count -eq 0))

  # -- 9. A PASS WITH TOO LITTLE LEFT IS REFUSED -------------------------------
  # An HOURS pass against a three-hour session: the arithmetic is the point, not
  # the count - one class is one unit, but one class can be three hours.
  $hours = Rpc (Api $org.token) "save_membership" @{ p_membership_id = $null; p_business_id = $studioId
    p_name = "MemProof Hours $stamp"; p_unit = "hours"; p_units = 2; p_price_inr = 0; p_total_count = 5; p_status = "live" }
  $hp = Rpc (Api $other.token) "buy_membership" @{ p_membership_id = [string]$hours.id }
  $long = New-Class (Api $org.token) $studioId "MemProof Long $stamp" 3 72 3 $learner.id
  $need = Rpc-Rows (Api $other.token) "passes_for_session" @{ p_session_id = $long.sessionId }
  $row = @($need | Where-Object { [string]$_.pass_id -eq [string]$hp.id })
  $short = Fails { Rpc (Api $other.token) "book_with_membership" @{ p_session_id = $long.sessionId; p_pass_id = [string]$hp.id } }
  Check 9 "A 3-hour class asks 3 hours of a 2-hour pass ($($row[0].units_needed) needed, enough=$($row[0].enough)) and the booking is refused ($short)" (
    ($row.Count -eq 1) -and ([decimal]$row[0].units_needed -eq 3) -and ($row[0].enough -eq $false) -and ($short -match "not enough left"))

  # -- 10. WHO HOLDS ONE IS THE SELLER'S TO READ, AND NOBODY ELSE'S ------------
  Rpc (Api $learner.token) "book_with_membership" @{ p_session_id = $cls.sessionId; p_pass_id = $p1Id } | Out-Null
  $holders = Rpc-Rows (Api $org.token) "membership_holders" @{ p_membership_id = $freeId }
  $usage = Rpc-Rows (Api $org.token) "membership_class_usage" @{ p_membership_id = $freeId }
  $rivalHolders = Fails { Rpc-Rows (Api $rival.token) "membership_holders" @{ p_membership_id = $freeId } }
  $rivalRows = if ($rivalHolders -eq "") { (Rpc-Rows (Api $rival.token) "membership_holders" @{ p_membership_id = $freeId }).Count } else { 0 }
  $holderRows = Get-Rows (Api $rival.token) "membership_passes?membership_id=eq.$freeId&select=id"
  Check 10 "The seller reads its holders ($($holders.Count)) and where the units went ($($usage.Count)); a rival reads neither ($rivalRows holders, $($holderRows.Count) passes)" (
    ($holders.Count -eq 2) -and ($usage.Count -ge 1) -and ($rivalRows -eq 0) -and ($holderRows.Count -eq 0))

  # -- 11. THE PRICE IS PUBLIC; WHO HOLDS ONE IS NOT ---------------------------
  $publicList = Rpc-Rows $anonH "public_memberships" @{ p_business_id = $studioId }
  $anonPasses = Fails { Get-Rows $anonH "membership_passes?select=id&limit=1" }
  $anonRows = if ($anonPasses -eq "") { (Get-Rows $anonH "membership_passes?select=id&limit=1").Count } else { -1 }
  Check 11 "A stranger reads what is on sale ($($publicList.Count) of them, with prices) and no pass at all ($(if ($anonRows -lt 0) { 'refused' } else { "$anonRows rows" }))" (
    ($publicList.Count -ge 2) -and ($null -ne $publicList[0].price_inr) -and ($anonRows -le 0))

  # -- 12. NO DIRECT WRITES ANYWHERE ------------------------------------------
  $wSale = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/memberships" -Headers (Api $learner.token) -Body (@{
    business_id = $studioId; name = "Forged"; unit = "classes"; units = 99; price_inr = 0; total_count = 99 } | ConvertTo-Json) }
  $wPass = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/membership_passes" -Headers (Api $learner.token) -Body (@{
    membership_id = $freeId; business_id = $studioId; user_id = $learner.id; unit = "classes"; units_total = 99; price_inr = 0 } | ConvertTo-Json) }
  $wTop = Fails { Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/membership_passes?id=eq.$p1Id" -Headers (Api $learner.token) -Body '{"units_used":0}' }
  $stillUsed = Pass-Of $p1Id
  Check 12 "Nobody writes a membership ($wSale), mints a pass ($wPass), or tops one up by hand (still $($stillUsed.units_used) used)" (
    ($wSale -ne "") -and ($wPass -ne "") -and ([decimal]$stillUsed.units_used -eq 1))

  if ($pass) { "ALL MEMBERSHIP CHECKS PASSED" } else { "-- FAIL: see above" }
}
finally {
  # the businesses first - a business whose owner is gone is the #0aa pile growing back
  foreach ($id in @($studioId, $rivalId)) {
    if ($id) { try { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/businesses?id=eq.$id" -Headers $svcH | Out-Null } catch {} }
  }
  foreach ($u in @($org, $rival, $learner, $other, $onTeam, $third)) {
    if ($u) { try { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null } catch {} }
  }
}
