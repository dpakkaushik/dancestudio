# Proof for Step 13b part 1 (the refund settlement queue). The hole being closed:
# Step 9 files an in-window cancellation as 'requested' - "the studio decides" -
# and the only writer of that row was the service-role webhook function, so
# nobody in the app could decide it. A learner's money sat in a queue with no
# door. These checks are about who may open that door, and who may not.
#
# Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-refunds.ps1
$ErrorActionPreference = "Stop"
# Supabase refuses a secret (sb_secret_...) key from anything that looks like a
# browser, and PowerShell's default user agent starts with "Mozilla/5.0". Name
# ourselves honestly so the admin and service-role calls are accepted.
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
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body ($body | ConvertTo-Json)
}
function Get-Rows($headers, $path) {
  $res = Invoke-WebRequest -Method Get -Uri "$base/rest/v1/$path" -Headers $headers -UseBasicParsing
  return ,@(($res.Content | ConvertFrom-Json) | Where-Object { $null -ne $_ })
}
function Expect-Fail($script) { try { & $script | Out-Null; return $false } catch { return $true } }
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
function Add-Member($tenantId, $userId, $memberRole, $byUser) {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/tenant_members" -Headers $svcH -Body (@{
    tenant_id = $tenantId; user_id = $userId; member_role = $memberRole
    created_by = $byUser; updated_by = $byUser } | ConvertTo-Json) | Out-Null
}
# a real paid seat: order -> razorpay id -> verified capture (the machine's path)
function Buy-Seat($learner, $sessionId, $tag) {
  $o = Rpc (Api $learner.token) "create_payment_order" @{ p_session_id = $sessionId }
  Rpc (Api $learner.token) "attach_razorpay_order" @{ p_order_id = $o.id; p_razorpay_order_id = "order_$tag" } | Out-Null
  Rpc $svcH "apply_captured_payment" @{ p_razorpay_order_id = "order_$tag"; p_razorpay_payment_id = "pay_$tag";
    p_amount_paise = 30000; p_method = "upi" } | Out-Null
  return (Get-Rows (Api $learner.token) "enrollments?session_id=eq.$sessionId&user_id=eq.$($learner.id)&status=eq.enrolled&select=id")[0].id
}

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$owner = New-EmailUser "refproof-owner-$stamp@example.com" "Owner $stamp" "studio"
$settler = New-EmailUser "refproof-settler-$stamp@example.com" "Settler $stamp" "trainer"
$trainer = New-EmailUser "refproof-trainer-$stamp@example.com" "Trainer $stamp" "trainer"
$l1 = New-EmailUser "refproof-l1-$stamp@example.com" "Learner One $stamp" "dancer"
$l2 = New-EmailUser "refproof-l2-$stamp@example.com" "Learner Two $stamp" "dancer"
$rival = New-EmailUser "refproof-rival-$stamp@example.com" "Rival $stamp" "studio"

$ta = Rpc (Api $owner.token) "create_tenant_with_owner" @{ p_name = "Refund Proof Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }
$tb = Rpc (Api $rival.token) "create_tenant_with_owner" @{ p_name = "Rival Studio $stamp"; p_type = "studio"; p_area = "Andheri"; p_city = "Mumbai" }
Add-Member $ta.id $settler.id "staff" $owner.id
Add-Member $ta.id $trainer.id "trainer" $owner.id

try {
  # a paid class TOMORROW, so cancelling lands inside the 48 h window where the
  # studio decides (Step 9's policy line, S_class 12400)
  $tmr = (Get-Date).AddDays(1)
  $cls = Rpc (Api $owner.token) "create_class_with_session" @{ p_tenant_id = $ta.id; p_title = "Refund Class $stamp";
    p_style = "Hip-Hop"; p_level = "all"; p_room = $null; p_price_inr = 300; p_capacity = 10;
    p_status = "published"; p_starts_at = $tmr.ToString("yyyy-MM-ddT19:00:00zzz"); p_ends_at = $tmr.ToString("yyyy-MM-ddT20:00:00zzz") }
  $sid = (Get-Rows $svcH "class_sessions?class_id=eq.$($cls.id)&select=id")[0].id

  # somebody who holds the REFUNDS job on this class, with their own consent
  $claim = Rpc (Api $owner.token) "claim_person" @{ p_class_id = $cls.id; p_user_id = $settler.id;
    p_kind = "assistant"; p_can_attendance = $false; p_can_refunds = $true; p_pay_per_session_inr = 0 }
  Rpc (Api $settler.token) "respond_to_claim" @{ p_claim_id = $claim.id; p_accept = $true } | Out-Null

  $e1 = Buy-Seat $l1 $sid "R1$stamp"
  $e2 = Buy-Seat $l2 $sid "R2$stamp"

  # 1. the state that had no door: cancelling inside 48 h files a REQUEST
  $out1 = Rpc (Api $l1.token) "cancel_booking" @{ p_enrollment_id = $e1; p_reason = "Family emergency" }
  Rpc (Api $l2.token) "cancel_booking" @{ p_enrollment_id = $e2; p_reason = "Changed my mind" } | Out-Null
  $r1 = $out1.refund.id
  $r2 = (Get-Rows $svcH "refunds?user_id=eq.$($l2.id)&select=id")[0].id
  Check 1 "Inside 48 h the cancellation files a request ($($out1.refund.status), Rs $($out1.refund.amount_inr))" (
    ($out1.refund.status -eq "requested") -and ($out1.refund.amount_inr -eq 300))

  # 2. the learner cannot approve their own refund
  $selfBlocked = Expect-Fail { Rpc (Api $l1.token) "decide_refund" @{ p_refund_id = $r1; p_decision = "approve" } }
  Check 2 "A learner cannot decide their own refund" $selfBlocked

  # 3. a trainer without the refunds job is not admitted - the job is grantable
  #    precisely because settling money is not implied by being a trainer
  $trainerBlocked = Expect-Fail { Rpc (Api $trainer.token) "decide_refund" @{ p_refund_id = $r1; p_decision = "approve" } }
  Check 3 "A trainer without the refunds job cannot settle" $trainerBlocked

  # 4. nor can another studio
  $rivalBlocked = Expect-Fail { Rpc (Api $rival.token) "decide_refund" @{ p_refund_id = $r1; p_decision = "approve" } }
  Check 4 "A rival studio cannot settle your refunds" $rivalBlocked

  # 5. the owner approves: the money is now due
  $approved = Rpc (Api $owner.token) "decide_refund" @{ p_refund_id = $r1; p_decision = "approve" }
  Check 5 "Owner approves -> $($approved.status), Rs $($approved.amount_inr), payment $(if($approved.razorpay_payment_id){'known'}else{'MISSING'})" (
    ($approved.status -eq "pending") -and ($approved.amount_inr -eq 300) -and ($approved.razorpay_payment_id -eq "pay_R1$stamp"))

  # 6. and only a request can be approved
  $reApproveBlocked = Expect-Fail { Rpc (Api $owner.token) "decide_refund" @{ p_refund_id = $r1; p_decision = "approve" } }
  Check 6 "Approving something already approved is refused" $reApproveBlocked

  # 7. the job holder settles: declining is a DECISION, not a failure - and it
  #    can be reopened (prototype's Reopen, 12259)
  $declined = Rpc (Api $settler.token) "decide_refund" @{ p_refund_id = $r2; p_decision = "decline"; p_note = "Outside our policy" }
  $reopened = Rpc (Api $settler.token) "decide_refund" @{ p_refund_id = $r2; p_decision = "reopen" }
  Check 7 "The refunds-job holder declines ($($declined.status)) and reopens ($($reopened.status))" (
    ($declined.status -eq "declined") -and ($reopened.status -eq "requested"))

  # 8. the hardening lesson, applied from the start this time: the job is only as
  #    live as the seat behind it. The membership row is soft-deleted DIRECTLY
  #    with the service role - no RPC - so the claim stays live and the grant
  #    must still end.
  $seat = (Get-Rows $svcH "tenant_members?tenant_id=eq.$($ta.id)&user_id=eq.$($settler.id)&select=id")[0].id
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenant_members?id=eq.$seat" -Headers $svcH `
    -Body (@{ deleted_at = (Get-Date).ToString("o") } | ConvertTo-Json) | Out-Null
  $offTeamBlocked = Expect-Fail { Rpc (Api $settler.token) "decide_refund" @{ p_refund_id = $r2; p_decision = "decline" } }
  $claimStillLive = Get-Rows $svcH "class_claims?id=eq.$($claim.id)&deleted_at=is.null&select=id"
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenant_members?id=eq.$seat" -Headers $svcH `
    -Body (@{ deleted_at = $null } | ConvertTo-Json) | Out-Null
  Check 8 "Seat pulled behind the RPC's back -> the refunds job stops working ($offTeamBlocked) with the claim still live ($($claimStillLive.Count))" (
    $offTeamBlocked -and ($claimStillLive.Count -eq 1))

  # 9. cash handed back at the desk: 'processed', said out loud as offline
  $offline = Rpc (Api $owner.token) "settle_refund_offline" @{ p_refund_id = $r1; p_note = "Cash at the desk" }
  $ord1 = Get-Rows $svcH "orders?id=eq.$($offline.order_id)&select=status"
  Check 9 "Marked refunded by hand ($($offline.status), offline=$($offline.settled_offline)), order now $($ord1[0].status)" (
    ($offline.status -eq "processed") -and ($offline.settled_offline -eq $true) -and ($ord1[0].status -eq "refunded"))

  # 10. but once the rail owns it, the rail's event closes it - not a person
  Rpc (Api $owner.token) "decide_refund" @{ p_refund_id = $r2; p_decision = "approve" } | Out-Null
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/refunds?id=eq.$r2" -Headers $svcH `
    -Body (@{ razorpay_refund_id = "rfnd_PROOF$stamp" } | ConvertTo-Json) | Out-Null
  $railBlocked = Expect-Fail { Rpc (Api $owner.token) "settle_refund_offline" @{ p_refund_id = $r2 } }
  Check 10 "A refund already with Razorpay cannot be closed by hand" $railBlocked

  # 11. and the row itself is not writable - there is no UPDATE policy at all
  $patched = Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/refunds?id=eq.$r2" -Headers (Api $owner.token) `
    -Body (@{ status = "processed" } | ConvertTo-Json)
  $stillPending = Get-Rows $svcH "refunds?id=eq.$r2&select=status"
  Check 11 "Direct PATCH of a refund changes nothing (rows $(@($patched).Count), still $($stillPending[0].status))" (
    (@($patched).Count -eq 0) -and ($stillPending[0].status -eq "pending"))

  # 12. the learner sees their own decision; nobody else's business
  $l1Sees = Get-Rows (Api $l1.token) "refunds?id=eq.$r1&select=status,settled_offline,decision_note"
  $l2SeesOther = Get-Rows (Api $l2.token) "refunds?id=eq.$r1&select=id"
  $anonSees = Get-Rows $anonH "refunds?select=id"
  Check 12 "Learner reads their own ($($l1Sees[0].status), note '$($l1Sees[0].decision_note)'); the other learner ($($l2SeesOther.Count)) and the public ($($anonSees.Count)) read none" (
    ($l1Sees.Count -eq 1) -and ($l1Sees[0].status -eq "processed") -and
    ($l2SeesOther.Count -eq 0) -and ($anonSees.Count -eq 0))
}
finally {
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers $svcH | Out-Null
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($tb.id)" -Headers $svcH | Out-Null
  foreach ($u in @($owner, $settler, $trainer, $l1, $l2, $rival)) {
    Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null
  }
  "   (cleanup: proof studios and throwaway accounts deleted)"
}

if ($pass) { "`nALL REFUND QUEUE CHECKS PASSED"; exit 0 } else { "`nREFUND QUEUE CHECKS FAILED"; exit 1 }
