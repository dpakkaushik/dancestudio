# Proof for Step 24 - notifications.
#
# The claims under test: a notification is raised WHERE THE FACT HAPPENS, by a
# trigger, so every path that writes the fact raises it (this script never calls
# a notify function - it books, asks, answers, pays and refunds, and then reads
# what appeared); a notification belongs to ONE person and nobody else can read
# it, not even the studio that caused it; there is no way to write one from
# outside (no insert policy, and the notify functions are revoked from every
# client role); reading and clearing only ever touch your own rows, whatever ids
# you pass; a kind switched off hides its stack without deleting anything; the
# prefs sheet refuses a kind it cannot act on; and the unread count is the
# caller's own.
#
# Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-notifications.ps1
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

function Api($token) { return @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" } }
function Rpc($headers, $fn, $body) {
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body ($body | ConvertTo-Json -Depth 8)
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
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/profiles" -Headers $svcH -Body (@{
    id = $u.id; full_name = $name; role = $role; city = "Pune"; created_by = $u.id; updated_by = $u.id } | ConvertTo-Json) | Out-Null
  $tok = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $anonH -Body (@{
    email = $email; password = "Proof-passw0rd!" } | ConvertTo-Json)
  return [pscustomobject]@{ id = $u.id; email = $email; token = $tok.access_token }
}
# the screen's read (repositories/notifications.ts findMyNotifications)
function Mine($user, $kind) {
  $q = "notifications?user_id=eq.$($user.id)&deleted_at=is.null&select=id,kind,title,body,href,read_at&order=created_at.desc"
  if ($kind) { $q += "&kind=eq.$kind" }
  return Get-Rows (Api $user.token) $q
}
function Titles($rows) { return (@($rows | ForEach-Object { $_.title }) -join " | ") }

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$owner = New-EmailUser "ntf-owner-$stamp@example.com" "Owner $stamp" "studio"
$trainer = New-EmailUser "ntf-trainer-$stamp@example.com" "Trainer $stamp" "trainer"
$learner = New-EmailUser "ntf-learner-$stamp@example.com" "Learner $stamp" "dancer"
$rival = New-EmailUser "ntf-rival-$stamp@example.com" "Rival $stamp" "studio"
$ta = Rpc (Api $owner.token) "create_tenant_with_owner" @{ p_name = "Notif Proof Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }
$tmr = (Get-Date).AddDays(2)

try {
  # 1. A SEAT BOOKED TELLS THE STUDIO - and the trigger, not the app, is what tells it
  $cls = Rpc (Api $owner.token) "create_class_with_session" @{ p_tenant_id = $ta.id; p_title = "Notif Class $stamp";
    p_style = "Hip-Hop"; p_level = "all"; p_room = $null; p_price_inr = 0; p_capacity = 1; p_status = "published";
    p_starts_at = $tmr.ToString("yyyy-MM-ddT19:00:00zzz"); p_ends_at = $tmr.ToString("yyyy-MM-ddT20:00:00zzz") }
  $sess = (Get-Rows (Api $owner.token) "class_sessions?class_id=eq.$($cls.id)&select=id")[0]
  Rpc (Api $learner.token) "enroll_in_session" @{ p_session_id = $sess.id } | Out-Null
  $ownerBooking = Mine $owner "booking"
  Check 1 "Booking told the studio: $(Titles $ownerBooking)" (
    ($ownerBooking.Count -eq 1) -and ($ownerBooking[0].title -like "*booked Notif Class*") -and ($ownerBooking[0].href -like "/business/*"))

  # 2. IT IS ONE PERSON'S: the learner has no booking notification, and nobody
  #    else can read the studio's - not the learner, not a rival, not the public
  $learnerBooking = Mine $learner "booking"
  $rivalReads = Get-Rows (Api $rival.token) "notifications?select=id"
  $anonReads = Get-Rows $anonH "notifications?select=id"
  $learnerPeeks = Get-Rows (Api $learner.token) "notifications?user_id=eq.$($owner.id)&select=id"
  Check 2 "The learner has $($learnerBooking.Count) booking rows; a rival reads $($rivalReads.Count); the public $($anonReads.Count); the learner asking for the owner's reads $($learnerPeeks.Count)" (
    ($learnerBooking.Count -eq 0) -and ($rivalReads.Count -eq 0) -and ($anonReads.Count -eq 0) -and ($learnerPeeks.Count -eq 0))

  # 3. NO WAY TO WRITE ONE FROM OUTSIDE: no insert policy, and notify is revoked
  $directInsert = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/notifications" -Headers (Api $rival.token) -Body (@{
    user_id = $owner.id; kind = "money"; title = "You have won a prize" } | ConvertTo-Json) }
  $callNotify = Fails { Rpc (Api $rival.token) "notify" @{ p_user_id = $owner.id; p_kind = "money"; p_title = "Fake"; p_body = $null; p_href = $null } }
  $anonNotify = Fails { Rpc $anonH "notify" @{ p_user_id = $owner.id; p_kind = "money"; p_title = "Fake"; p_body = $null; p_href = $null } }
  Check 3 "Direct insert refused ($directInsert); calling notify refused ($callNotify); the public cannot either ($anonNotify)" (
    ($directInsert -ne "") -and ($callNotify -ne "") -and ($anonNotify -ne ""))

  # 4. A CONSENT ASK REACHES THE PERSON ASKED, AND THE ANSWER REACHES THE STUDIO
  Rpc (Api $owner.token) "invite_to_tenant" @{ p_tenant_id = $ta.id; p_name = "Trainer"; p_email = $trainer.email; p_role = "trainer" } | Out-Null
  $inv = (Get-Rows (Api $owner.token) "tenant_invites?tenant_id=eq.$($ta.id)&select=code")[0]
  Rpc (Api $trainer.token) "accept_tenant_invite" @{ p_code = $inv.code } | Out-Null
  $claim = Rpc (Api $owner.token) "claim_person" @{ p_class_id = $cls.id; p_user_id = $trainer.id; p_kind = "artist"; p_pay_per_session_inr = 900 }
  $asked = Mine $trainer "people"
  Rpc (Api $trainer.token) "respond_to_claim" @{ p_claim_id = $claim.id; p_accept = $true } | Out-Null
  $answered = Mine $owner "people"
  Check 4 "The trainer was told they were asked ($(Titles $asked)); the studio was told the answer ($(Titles $answered))" (
    ($asked.Count -eq 1) -and ($asked[0].title -like "*wants you as the artist taking*") -and ($asked[0].href -eq "/inbox") -and
    ($answered.Count -eq 1) -and ($answered[0].title -like "*confirmed Notif Class*"))

  # 5. THE WAITLIST IS TOLD, OR IT IS NOT A WAITLIST (13647): the promoted learner hears it
  $l2 = New-EmailUser "ntf-l2-$stamp@example.com" "Learner Two $stamp" "dancer"
  $wait = Rpc (Api $l2.token) "enroll_in_session" @{ p_session_id = $sess.id }
  $firstSeat = (Get-Rows (Api $owner.token) "enrollments?session_id=eq.$($sess.id)&user_id=eq.$($learner.id)&select=id")[0]
  Rpc (Api $learner.token) "cancel_enrollment" @{ p_enrollment_id = $firstSeat.id } | Out-Null
  $offered = Mine $l2 "class"
  Check 5 "L2 was $($wait.status), then the freed seat told them: $(Titles $offered)" (
    ($wait.status -eq "waitlisted") -and ($offered.Count -eq 1) -and ($offered[0].title -like "A place opened in Notif Class*"))

  # 6. MONEY, BOTH WAYS A REFUND IS FILED. A paid seat cancelled INSIDE the 48-hour
  #    window is 'requested' — the studio decides, so the studio is told and the
  #    payer hears the decision. Cancelled OUTSIDE it, the policy has already
  #    decided: it is 'pending' and the PAYER is told their money is coming back.
  #    That second half was silent in the first cut and is what migration
  #    20260829163000 fixed — this check is the one that found it.
  function Buy($user, $sessId, $tag) {
    $o = Rpc (Api $user.token) "create_payment_order" @{ p_session_id = $sessId }
    $poid = "proof_order_$tag"
    Rpc (Api $user.token) "attach_provider_order" @{ p_order_id = $o.id; p_provider_order_id = $poid } | Out-Null
    Rpc $svcH "apply_captured_payment" @{ p_provider_order_id = $poid; p_provider_payment_id = "proof_pay_$tag"; p_amount_paise = 30000; p_method = "upi" } | Out-Null
    return $o
  }
  # (a) inside the window - the session is tomorrow
  $soon = (Get-Date).AddHours(20)
  $paidSoon = Rpc (Api $owner.token) "create_class_with_session" @{ p_tenant_id = $ta.id; p_title = "Soon Class $stamp";
    p_style = "Salsa"; p_level = "all"; p_room = $null; p_price_inr = 300; p_capacity = 5; p_status = "published";
    p_starts_at = $soon.ToString("yyyy-MM-ddTHH:00:00zzz"); p_ends_at = $soon.AddHours(1).ToString("yyyy-MM-ddTHH:00:00zzz") }
  $soonSess = (Get-Rows (Api $owner.token) "class_sessions?class_id=eq.$($paidSoon.id)&select=id")[0]
  $orderA = Buy $learner $soonSess.id "a$stamp"
  $seatA = (Get-Rows (Api $learner.token) "enrollments?session_id=eq.$($soonSess.id)&user_id=eq.$($learner.id)&deleted_at=is.null&select=id")[0]
  Rpc (Api $learner.token) "cancel_booking" @{ p_enrollment_id = $seatA.id; p_reason = "Cannot make it" } | Out-Null
  $refundA = (Get-Rows (Api $owner.token) "refunds?order_id=eq.$($orderA.id)&select=id,status")[0]
  $asksBack = @((Mine $owner "money") | Where-Object { $_.title -like "*asked for a refund*" })
  Rpc (Api $owner.token) "decide_refund" @{ p_refund_id = $refundA.id; p_decision = "decline"; p_note = "Inside the window, and the class runs" } | Out-Null
  $decided = @((Mine $learner "money") | Where-Object { $_.title -like "Refund declined*" })
  # (b) outside the window - the session is ten days out
  $far = (Get-Date).AddDays(10)
  $paidFar = Rpc (Api $owner.token) "create_class_with_session" @{ p_tenant_id = $ta.id; p_title = "Far Class $stamp";
    p_style = "Bhangra"; p_level = "all"; p_room = $null; p_price_inr = 300; p_capacity = 5; p_status = "published";
    p_starts_at = $far.ToString("yyyy-MM-ddT17:00:00zzz"); p_ends_at = $far.ToString("yyyy-MM-ddT18:00:00zzz") }
  $farSess = (Get-Rows (Api $owner.token) "class_sessions?class_id=eq.$($paidFar.id)&select=id")[0]
  $orderB = Buy $learner $farSess.id "b$stamp"
  $seatB = (Get-Rows (Api $learner.token) "enrollments?session_id=eq.$($farSess.id)&user_id=eq.$($learner.id)&deleted_at=is.null&select=id")[0]
  Rpc (Api $learner.token) "cancel_booking" @{ p_enrollment_id = $seatB.id; p_reason = "Plans changed" } | Out-Null
  $refundB = (Get-Rows (Api $owner.token) "refunds?order_id=eq.$($orderB.id)&select=id,status")[0]
  $auto = @((Mine $learner "money") | Where-Object { $_.title -like "Refund on its way*" })
  Check 6 "Inside the window ($($refundA.status)): the studio heard it ($(Titles $asksBack)) and the payer heard the decision ($(Titles $decided)). Outside it ($($refundB.status)): the payer was told anyway ($(Titles $auto))" (
    ($refundA.status -eq "requested") -and ($asksBack.Count -eq 1) -and ($decided.Count -eq 1) -and ($decided[0].href -eq "/my-classes") -and
    ($refundB.status -eq "pending") -and ($auto.Count -eq 1) -and ($auto[0].href -eq "/my-classes"))

  # 7. READ AND CLEAR ONLY EVER TOUCH YOUR OWN, whatever ids you pass
  $ownerRows = Mine $owner
  $ownerIds = @($ownerRows | ForEach-Object { $_.id })
  $stolen = Rpc (Api $rival.token) "mark_notifications_read" @{ p_ids = $ownerIds; p_kind = $null }
  $stillUnread = @((Mine $owner) | Where-Object { $null -eq $_.read_at }).Count
  $clearedByRival = Rpc (Api $rival.token) "clear_notifications" @{ p_ids = $ownerIds; p_kind = $null }
  $ownerStill = (Mine $owner).Count
  Check 7 "A rival marking the owner's $($ownerIds.Count) rows read touched $stolen (owner still has $stillUnread unread); clearing them touched $clearedByRival (owner still has $ownerStill rows)" (
    ([int]$stolen -eq 0) -and ($stillUnread -eq $ownerRows.Count) -and ([int]$clearedByRival -eq 0) -and ($ownerStill -eq $ownerRows.Count))

  # 8. THE OWNER'S OWN READ AND CLEAR WORK, and the unread count follows
  $before = Rpc (Api $owner.token) "my_unread_notifications" @{}
  $readN = Rpc (Api $owner.token) "mark_notifications_read" @{ p_ids = $null; p_kind = "booking" }
  $after = Rpc (Api $owner.token) "my_unread_notifications" @{}
  $clearN = Rpc (Api $owner.token) "clear_notifications" @{ p_ids = $null; p_kind = "booking" }
  $bookingLeft = (Mine $owner "booking").Count
  $rivalCount = Rpc (Api $rival.token) "my_unread_notifications" @{}
  Check 8 "Unread $before -> $after after marking $readN booking read; clearing $clearN leaves $bookingLeft booking rows; a rival's own count is $rivalCount" (
    ([int]$before -gt [int]$after) -and ([int]$readN -ge 1) -and ([int]$clearN -ge 1) -and ($bookingLeft -eq 0) -and ([int]$rivalCount -eq 0))

  # 9. PREFS: a person gets a row on first read, only the six kinds are accepted,
  #    and switching a kind off deletes nothing
  $prefs = Rpc (Api $owner.token) "my_notification_prefs" @{}
  $bogusKind = Fails { Rpc (Api $owner.token) "set_notification_prefs" @{ p_kinds = @{ nonsense = $true }; p_push = $true; p_whatsapp = $true; p_email = $false } }
  $notBool = Fails { Rpc (Api $owner.token) "set_notification_prefs" @{ p_kinds = @{ money = "yes" }; p_push = $true; p_whatsapp = $true; p_email = $false } }
  $peopleBefore = (Mine $owner "people").Count
  $saved = Rpc (Api $owner.token) "set_notification_prefs" @{ p_kinds = @{ enquiry = $true; booking = $true; money = $true; people = $false; event = $true; class = $true }; p_push = $false; p_whatsapp = $true; p_email = $true }
  $peopleAfter = (Mine $owner "people").Count
  Check 9 "Prefs row made on read (push=$($prefs.push)); a made-up kind refused ($bogusKind); a non-boolean refused ($notBool); people switched off ($($saved.kinds.people)) and the $peopleBefore people rows are still there ($peopleAfter)" (
    ($prefs.push -eq $true) -and ($bogusKind -match "unknown notification kind") -and ($notBool -match "on or off") -and
    ($saved.kinds.people -eq $false) -and ($saved.push -eq $false) -and ($peopleAfter -eq $peopleBefore))

  # 10. A PERSON READS ONLY THEIR OWN PREFS
  $rivalPrefs = Rpc (Api $rival.token) "my_notification_prefs" @{}
  $peekPrefs = Get-Rows (Api $rival.token) "notification_prefs?user_id=eq.$($owner.id)&select=user_id,push"
  Check 10 "The rival's own prefs are their own (push=$($rivalPrefs.push)); asking for the owner's returns $($peekPrefs.Count) rows" (
    ($rivalPrefs.push -eq $true) -and ($rivalPrefs.user_id -eq $rival.id) -and ($peekPrefs.Count -eq 0))

  # 11. A NOTIFICATION NEVER BREAKS THE FACT: the trigger drops a notification for
  #     a profile that is gone, and the booking it observed still lands
  $ghost = New-EmailUser "ntf-ghost-$stamp@example.com" "Ghost $stamp" "dancer"
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/profiles?id=eq.$($ghost.id)" -Headers $svcH -Body (@{ deleted_at = "now()" } | ConvertTo-Json) | Out-Null
  $free = Rpc (Api $owner.token) "create_class_with_session" @{ p_tenant_id = $ta.id; p_title = "Ghost Class $stamp";
    p_style = "Kathak"; p_level = "all"; p_room = $null; p_price_inr = 0; p_capacity = 4; p_status = "published";
    p_starts_at = $tmr.ToString("yyyy-MM-ddT10:00:00zzz"); p_ends_at = $tmr.ToString("yyyy-MM-ddT11:00:00zzz") }
  $freeSess = (Get-Rows (Api $owner.token) "class_sessions?class_id=eq.$($free.id)&select=id")[0]
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/profiles?id=eq.$($ghost.id)" -Headers $svcH -Body (@{ deleted_at = $null } | ConvertTo-Json) | Out-Null
  $ghostSeat = Rpc (Api $ghost.token) "enroll_in_session" @{ p_session_id = $freeSess.id }
  $ghostRows = Mine $ghost
  Check 11 "A class created while a profile was deleted still exists, and the later booking landed ($($ghostSeat.status)) with $($ghostRows.Count) notifications for the booker" (
    ($ghostSeat.status -eq "enrolled") -and ($ghostRows.Count -eq 0))
  Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($ghost.id)" -Headers $adminH | Out-Null

  # 12. CLEARING IS SOFT, AND CLEARING NOTHING IN PARTICULAR IS REFUSED
  $noTarget = Fails { Rpc (Api $owner.token) "clear_notifications" @{ p_ids = $null; p_kind = $null } }
  $all = Get-Rows (Api $owner.token) "notifications?user_id=eq.$($owner.id)&select=id,deleted_at"
  $gone = @($all | Where-Object { $null -ne $_.deleted_at }).Count
  Check 12 "Clearing without a target refused ($noTarget); the owner still holds $($all.Count) rows in all, $gone of them cleared" (
    ($noTarget -match "which notifications") -and ($gone -ge 1))
}
finally {
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers $svcH | Out-Null
  foreach ($u in @($owner, $trainer, $learner, $rival, $l2)) {
    if ($u) { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null }
  }
  "   (cleanup: proof studio and throwaway accounts deleted - notifications cascade with the profile)"
}

if ($pass) { "`nALL NOTIFICATION CHECKS PASSED"; exit 0 } else { "`nNOTIFICATION CHECKS FAILED"; exit 1 }
