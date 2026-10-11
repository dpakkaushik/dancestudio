# Proof for 20261017090000_classes_made_final (written 11 Oct 2026), as real
# roles against the live database. Runs ONLY on the migrated schema - before the
# apply every check below reads as a FAIL, which is the point.
#
# The claims under test (Rule 9: who may book, who runs the door, who is told):
#   1. an OVERLAPPING booking is refused in words ("You're booked into ...")
#   2. a pass is not spent on a FREE class, and not offered for one
#   3. published -> draft is refused ("A published class stays published")
#   4. a teacher's NO shows on the register (classes_publish_state.teacher_status)
#   5. step_down_from_class pauses booking ("This class is waiting for a new
#      teacher") and a NEW teacher's yes resumes it
#   6. the VENUE studio's runner checks a learner in on an artist's class held in
#      their room, and reads NO payment and NO order on it
#   7. an ask on a class that has STARTED is refused
#   8. a SELF-made booking tells the teacher and the owner; a booking at the
#      DOOR (a person, or a walk-in) tells nobody
#
# Every account is a throwaway email account, registered the moment it exists;
# the whole world is built INSIDE the try, so a failure in set-up still reaches
# the finally, and Remove-ProofWorld reads every delete back.
#
# ASCII ONLY (the 11 Sep 2026 lesson). Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-classes-final.ps1
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

. (Join-Path $PSScriptRoot "proof-lib.ps1")   # New-Studio / New-Artist-Page / Subscribe-Studio / Remove-ProofWorld

function Api($token) { return @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" } }
function Rpc($headers, $fn, $body) {
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body ($body | ConvertTo-Json -Depth 8)
}
# rows counted off the RAW text - PowerShell 5.1 reads a JSON [] as one item
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
# "" when the call went through, else the database's own sentence
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
    if (-not $msg) { $msg = "(refused, no message)" }
    return $msg
  }
}
function Check($n, $label, $ok) {
  "$n. $label $(if ($ok) {'-- OK'} else {'-- !!! FAILED !!!'})"
  if (-not $ok) { $script:pass = $false }
}
function New-EmailUser($email, $name) {
  $u = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/admin/users" -Headers $adminH -Body (@{
    email = $email; password = "Proof-passw0rd!"; email_confirm = $true } | ConvertTo-Json)
  Register-ProofUser ([string]$u.id)   # the moment it exists, so a crash a line later still cleans it up
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/profiles" -Headers $svcH -Body (@{
    id = $u.id; full_name = $name; role = "user"; city = "Pune"; styles = @("Hip-Hop"); created_by = $u.id; updated_by = $u.id } | ConvertTo-Json) | Out-Null
  $tok = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $anonH -Body (@{
    email = $email; password = "Proof-passw0rd!" } | ConvertTo-Json)
  return [pscustomobject]@{ id = [string]$u.id; email = $email; name = $name; token = $tok.access_token }
}
# a DRAFT class, made the way the app makes one; $extra adds venue / room-id args
function New-Draft($token, $bizId, $title, $minutesAhead, $lengthMin, $price, $extra = @{}) {
  $starts = [DateTime]::UtcNow.AddMinutes($minutesAhead)
  $body = @{
    p_business_id = $bizId; p_title = $title; p_style = "Hip-Hop"; p_level = "all"; p_room = "Studio A"
    p_price_inr = $price; p_capacity = 10; p_status = "draft"
    p_starts_at = $starts.ToString("o"); p_ends_at = $starts.AddMinutes($lengthMin).ToString("o") }
  foreach ($k in $extra.Keys) { $body[$k] = $extra[$k] }
  $c = Rpc (Api $token) "create_class_with_session" $body
  $s = Get-Rows $svcH "class_sessions?class_id=eq.$([string]$c.id)&deleted_at=is.null&select=id"
  return [pscustomobject]@{ id = [string]$c.id; sessionId = [string]$s[0].id }
}
# the real ask, the real yes; hands back the class_people id
function Ask-Yes($ownerToken, $classId, $who, $kind = "artist") {
  $ask = Rpc (Api $ownerToken) "ask_class_person" @{ p_class_id = $classId; p_user_id = $who.id; p_kind = $kind }
  Rpc (Api $who.token) "respond_to_class_ask" @{ p_class_person_id = [string]$ask.id; p_accept = $true } | Out-Null
  return [string]$ask.id
}
function Publish($token, $classId) {
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/classes?id=eq.$classId" -Headers (Api $token) -Body '{"status":"published"}' | Out-Null
}
function Status-Of($classId) { return [string](Get-Rows $svcH "classes?id=eq.$classId&select=status")[0].status }
function Booking-Notes($userId) {
  return (Get-Rows $svcH "notifications?user_id=eq.$userId&kind=eq.booking&deleted_at=is.null&select=id").Count
}

Assert-City "Pune"

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$artistSubId = $null
$orderId = $null

try {
  # -- the world ----------------------------------------------------------------
  $owner    = New-EmailUser "finalproof-owner-$stamp@example.com" "FinalProof Owner $stamp"
  $teacher  = New-EmailUser "finalproof-teacher-$stamp@example.com" "FinalProof Teacher $stamp"
  $teacher2 = New-EmailUser "finalproof-teacher2-$stamp@example.com" "FinalProof Teacher Two $stamp"
  $learner  = New-EmailUser "finalproof-learner-$stamp@example.com" "FinalProof Learner $stamp"
  $learner2 = New-EmailUser "finalproof-learner2-$stamp@example.com" "FinalProof Learner Two $stamp"
  $stranger = New-EmailUser "finalproof-stranger-$stamp@example.com" "FinalProof Stranger $stamp"

  $s1 = New-Studio $owner.token "FinalProof Studio $stamp" "Kothrud" "Pune"
  $s1Id = [string]$s1.id
  Subscribe-Studio $s1Id
  # a second studio, so the overlapping class and the door class never meet the
  # first studio's room-clash guard (a room is held by time, not by person)
  $s2 = New-Studio $owner.token "FinalProof Studio Two $stamp" "Baner" "Pune"
  $s2Id = [string]$s2.id
  Subscribe-Studio $s2Id

  # A: free, 48 hours ahead, the teacher's yes, published by the owner
  $A = New-Draft $owner.token $s1Id "FinalProof A $stamp" (48 * 60) 60 0
  $tA = Ask-Yes $owner.token $A.id $teacher
  Publish $owner.token $A.id
  # O: in the other studio, overlapping A by half an hour
  $O = New-Draft $owner.token $s2Id "FinalProof Overlap $stamp" (48 * 60 + 30) 60 0
  Ask-Yes $owner.token $O.id $teacher2 | Out-Null
  Publish $owner.token $O.id

  # -- 8b. A SELF-MADE BOOKING TELLS THE TEACHER AND THE OWNER (D10) ------------
  $tBefore = Booking-Notes $teacher.id
  $oBefore = Booking-Notes $owner.id
  Rpc (Api $learner.token) "book_class_session" @{ p_session_id = $A.sessionId } | Out-Null
  $tAfter = Booking-Notes $teacher.id
  $oAfter = Booking-Notes $owner.id
  Check "8b" "A learner books A themselves: the confirmed teacher is told (+$($tAfter - $tBefore)) and so is the owner (+$($oAfter - $oBefore))" (
    ($tAfter -eq $tBefore + 1) -and ($oAfter -eq $oBefore + 1))

  # -- 1. AN OVERLAPPING BOOKING IS REFUSED IN WORDS (D8) -------------------------
  $over = Fails { Rpc (Api $learner.token) "book_class_session" @{ p_session_id = $O.sessionId } }
  $overSeats = Get-Rows $svcH "class_bookings?session_id=eq.$($O.sessionId)&user_id=eq.$($learner.id)&deleted_at=is.null&select=id"
  Check 1 "Booking a class that overlaps one already held is refused ('$over') and no seat is made ($($overSeats.Count))" (
    ($over -match "booked into") -and ($overSeats.Count -eq 0))

  # -- 2. A PASS IS NOT SPENT ON A FREE CLASS (B8) ------------------------------
  $mem = Rpc (Api $owner.token) "save_membership" @{ p_membership_id = $null; p_business_id = $s1Id
    p_name = "FinalProof Hours $stamp"; p_unit = "hours"; p_units = 10; p_price_inr = 0; p_total_count = 5; p_status = "live" }
  $p = Rpc (Api $learner2.token) "buy_membership" @{ p_membership_id = [string]$mem.id }
  $offered = Rpc-Rows (Api $learner2.token) "passes_for_session" @{ p_session_id = $A.sessionId }
  $freeSpend = Fails { Rpc (Api $learner2.token) "book_with_membership" @{ p_session_id = $A.sessionId; p_pass_id = [string]$p.id } }
  $afterFree = (Get-Rows $svcH "membership_passes?id=eq.$([string]$p.id)&select=units_used")[0]
  Check 2 "A free class offers no pass ($($offered.Count)) and refuses one ('$freeSpend'); nothing was spent ($($afterFree.units_used) used)" (
    ($offered.Count -eq 0) -and ($freeSpend -match "this class is free") -and ([decimal]$afterFree.units_used -eq 0))

  # -- 3. PUBLISHED -> DRAFT IS REFUSED (B4) ------------------------------------
  $back = Fails { Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/classes?id=eq.$($A.id)" -Headers (Api $owner.token) -Body '{"status":"draft"}' }
  $still = Status-Of $A.id
  Check 3 "The owner cannot take a published class back to a draft ('$back'); it reads '$still'" (
    ($back -match "stays published") -and ($still -eq "published"))

  # -- 4. A TEACHER'S NO SHOWS ON THE REGISTER (B3) -----------------------------
  $B = New-Draft $owner.token $s1Id "FinalProof Declined $stamp" (120 * 60) 60 0
  $askB = Rpc (Api $owner.token) "ask_class_person" @{ p_class_id = $B.id; p_user_id = $stranger.id; p_kind = "artist" }
  Rpc (Api $stranger.token) "respond_to_class_ask" @{ p_class_person_id = [string]$askB.id; p_accept = $false } | Out-Null
  $state = Rpc-Rows (Api $owner.token) "classes_publish_state" @{ p_business_id = $s1Id }
  $rowB = @($state | Where-Object { [string]$_.class_id -eq $B.id })
  $tsB = if ($rowB.Count) { [string]$rowB[0].teacher_status } else { "(no row)" }
  $tuB = if ($rowB.Count) { [string]$rowB[0].teacher_user_id } else { "" }
  Check 4 "A declined teacher is visible on the register: teacher_status '$tsB' for the person who said no" (
    ($tsB -eq "rejected") -and ($tuB -eq $stranger.id))

  # -- 5. STEPPING DOWN PAUSES BOOKING; A NEW YES RESUMES IT (D4) --------------
  Rpc (Api $teacher.token) "step_down_from_class" @{ p_class_person_id = $tA; p_reason = "Proof: injured" } | Out-Null
  $waits = Rpc (Api $learner2.token) "class_waits_for_teacher" @{ p_class_id = $A.id }
  $paused = Fails { Rpc (Api $learner2.token) "book_class_session" @{ p_session_id = $A.sessionId } }
  $stateA = Rpc-Rows (Api $owner.token) "classes_publish_state" @{ p_business_id = $s1Id }
  $rowA = @($stateA | Where-Object { [string]$_.class_id -eq $A.id })
  $whyA = if ($rowA.Count) { [string]$rowA[0].why } else { "(no row)" }
  Check "5a" "The teacher steps down: the class waits ($waits), a booking is refused ('$paused'), the register says '$whyA'" (
    ("$waits" -eq "True") -and ($paused -match "waiting for a new teacher") -and ($whyA -match "waiting for a new teacher"))
  Ask-Yes $owner.token $A.id $teacher2 | Out-Null
  $waits2 = Rpc (Api $learner2.token) "class_waits_for_teacher" @{ p_class_id = $A.id }
  $resumed = Fails { Rpc (Api $learner2.token) "book_class_session" @{ p_session_id = $A.sessionId } }
  $seat2 = Get-Rows $svcH "class_bookings?session_id=eq.$($A.sessionId)&user_id=eq.$($learner2.id)&status=eq.enrolled&deleted_at=is.null&select=id"
  Check "5b" "A new teacher says yes: the class no longer waits ($waits2) and a learner books it ('$resumed', $($seat2.Count) seat)" (
    ("$waits2" -eq "False") -and ($resumed -eq "") -and ($seat2.Count -eq 1))

  # -- 6. THE VENUE'S RUNNER RUNS THE DOOR AND READS NO MONEY (D7) --------------
  # the teacher is an artist (a granted plan, the service role standing in for an
  # admin's grant) with a page of their own, asking for a room in studio one
  $sub = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/subscriptions" -Headers $svcH -Body (@{
    kind = "artist"; user_id = $teacher.id; plan_key = "artist_monthly"; price_inr = 0; period = "monthly"; status = "active"
    current_period_start = (Get-Date).ToString("yyyy-MM-dd"); current_period_end = (Get-Date).AddMonths(1).ToString("yyyy-MM-dd"); granted = $true
    note = "Granted by a proof script - nothing charged"; created_by = $teacher.id; updated_by = $teacher.id } | ConvertTo-Json)
  $artistSubId = Get-ProofId $sub
  $page = New-Artist-Page $teacher.token "FinalProof Page $stamp" "Kothrud" "Pune"
  $pageId = [string]$page.id
  $room = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rooms" -Headers $svcH -Body (@{
    business_id = $s1Id; name = "FinalProof Hall $stamp"; capacity = 20; created_by = $owner.id; updated_by = $owner.id } | ConvertTo-Json)
  $roomId = Get-ProofId $room
  # 25 minutes ahead: inside the register's window (it opens 30 minutes before)
  $V = New-Draft $teacher.token $pageId "FinalProof Venue $stamp" 25 60 0 @{ p_room = "FinalProof Hall $stamp"; p_room_id = $roomId; p_venue_business_id = $s1Id }
  Rpc (Api $owner.token) "respond_to_venue_request" @{ p_class_id = $V.id; p_accept = $true } | Out-Null
  Publish $teacher.token $V.id
  $bv = Rpc (Api $learner.token) "book_class_session" @{ p_session_id = $V.sessionId }
  $bvId = Get-ProofId $bv
  if (-not $bvId) { $bvId = [string](Get-Rows $svcH "class_bookings?session_id=eq.$($V.sessionId)&user_id=eq.$($learner.id)&status=eq.enrolled&select=id")[0].id }
  # money on that seat, written the way the capture applier writes it
  $ord = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/orders" -Headers $svcH -Body (@{
    business_id = $pageId; user_id = $learner.id; class_id = $V.id; session_id = $V.sessionId; class_booking_id = $bvId
    amount_inr = 200; status = "paid"; created_by = $learner.id; updated_by = $learner.id } | ConvertTo-Json)
  $orderId = Get-ProofId $ord
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/payments" -Headers $svcH -Body (@{
    order_id = $orderId; business_id = $pageId; user_id = $learner.id; provider = "cashfree"; provider_payment_id = "finalproof_$stamp"
    amount_inr = 200; status = "captured"; method = "upi"; kind = "order"; created_by = $learner.id; updated_by = $learner.id } | ConvertTo-Json) | Out-Null
  $ci = Fails { Rpc (Api $owner.token) "check_in" @{ p_class_booking_id = $bvId } }
  $att = Get-Rows $svcH "attendance?class_booking_id=eq.$bvId&deleted_at=is.null&select=id"
  $seesPay = Get-Rows (Api $owner.token) "payments?order_id=eq.$orderId&select=id"
  $seesOrd = Get-Rows (Api $owner.token) "orders?id=eq.$orderId&select=id"
  $strangerCi = Fails { Rpc (Api $stranger.token) "check_in" @{ p_class_booking_id = $bvId } }
  Check 6 "The venue's owner checks the learner in ('$ci', $($att.Count) attendance row) and reads NO payment ($($seesPay.Count)) and NO order ($($seesOrd.Count)); a stranger is refused ('$strangerCi')" (
    ($ci -eq "") -and ($att.Count -eq 1) -and ($seesPay.Count -eq 0) -and ($seesOrd.Count -eq 0) -and ($strangerCi -ne ""))

  # -- 7. AN ASK ON A CLASS THAT HAS STARTED IS REFUSED (B12) -------------------
  # the service role back-dates the session (a client may not start a class in the past)
  $C = New-Draft $owner.token $s1Id "FinalProof Started $stamp" (30 * 60) 60 0
  $startedAt = [DateTime]::UtcNow.AddMinutes(-10)
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/class_sessions?id=eq.$($C.sessionId)" -Headers $svcH -Body (@{
    starts_at = $startedAt.ToString("o"); ends_at = $startedAt.AddMinutes(60).ToString("o") } | ConvertTo-Json) | Out-Null
  $late = Fails { Rpc (Api $owner.token) "ask_class_person" @{ p_class_id = $C.id; p_user_id = $teacher2.id; p_kind = "artist" } }
  $lateRows = Get-Rows $svcH "class_people?class_id=eq.$($C.id)&deleted_at=is.null&select=id"
  Check 7 "An ask on a class that has started is refused ('$late'), and nobody is put on it ($($lateRows.Count))" (
    ($late -match "has started") -and ($lateRows.Count -eq 0))

  # -- 8a. A BOOKING AT THE DOOR TELLS NOBODY (D10) -----------------------------
  # 20 minutes ahead in studio two, so the door is open and no room is shared
  $D = New-Draft $owner.token $s2Id "FinalProof Door $stamp" 20 60 0
  Ask-Yes $owner.token $D.id $teacher | Out-Null
  Publish $owner.token $D.id
  $tPre = Booking-Notes $teacher.id
  $oPre = Booking-Notes $owner.id
  $door = Fails { Rpc (Api $owner.token) "book_at_the_door" @{ p_session_id = $D.sessionId; p_user_id = $stranger.id; p_name = $null } }
  $walk = Fails { Rpc (Api $owner.token) "book_at_the_door" @{ p_session_id = $D.sessionId; p_user_id = $null; p_name = "FinalProof Walk In" } }
  $doorSeats = Get-Rows $svcH "class_bookings?session_id=eq.$($D.sessionId)&status=eq.enrolled&deleted_at=is.null&select=id"
  $tPost = Booking-Notes $teacher.id
  $oPost = Booking-Notes $owner.id
  Check "8a" "The owner books a person and a walk-in at the door ('$door' / '$walk', $($doorSeats.Count) seats) and nobody is told (teacher +$($tPost - $tPre), owner +$($oPost - $oPre))" (
    ($door -eq "") -and ($walk -eq "") -and ($doorSeats.Count -eq 2) -and ($tPost -eq $tPre) -and ($oPost -eq $oPre))

  if ($pass) { "ALL FINAL CLASS CHECKS PASSED" } else { "-- FAIL: see above" }
}
catch {
  "SET-UP OR A CHECK THREW: $(Get-ProofErr $_) -- !!! FAILED !!!"
  $pass = $false
}
finally {
  # the money rows by hand first (the business delete would take them, but a
  # leftover payment is the one thing that must never stay), then the plan
  if ($orderId) {
    Invoke-ProofCleanup "payments on order $orderId" { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/payments?order_id=eq.$orderId" -Headers $svcH }
    Invoke-ProofCleanup "order $orderId" { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/orders?id=eq.$orderId" -Headers $svcH }
  }
  if ($artistSubId) {
    Invoke-ProofCleanup "artist subscription $artistSubId" { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/subscriptions?id=eq.$artistSubId" -Headers $svcH }
  }
  # the artist page FIRST: its class holds a room in studio one (venue_business_id,
  # room_id), so studio one's delete is refused while that class still exists
  if ($pageId) {
    Invoke-ProofCleanup "artist page $pageId" { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/businesses?id=eq.$pageId" -Headers $svcH }
  }
  Remove-ProofWorld
  if (@($script:ProofLeftovers).Count -gt 0) { $pass = $false }
}

if ($pass) { "`nALL FINAL CLASS CHECKS PASSED"; exit 0 } else { "`nFINAL CLASS CHECKS FAILED"; exit 1 }
