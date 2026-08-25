# Proof for Step 13b part 2a - "WHAT THIS SESSION MADE" (prototype S_class 12008-12042).
#
# The claim under test is arithmetic, not a new permission: this slice adds no
# table, no RPC and no policy. It reads orders/payments/refunds that Step 9
# already admits a tenant's members to, and adds them up the way the prototype's
# card does - with ONE deliberate departure, which check 2 is about: the
# prototype derives "Came in" as price x seats because it has no payments to
# count, and we count the payments instead.
#
# Check 9 is the honest one. The Earnings tab is owner-only because the prototype
# puts it behind `isMine` (SEGS 11757) - that is a PRESENTATION gate, and this
# proves it is not mistaken for a security boundary: Step 9's RLS lets any member
# read the rows directly, by design.
#
# Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-class-earnings.ps1
$ErrorActionPreference = "Stop"

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
function Buy-Seat($learner, $sessionId, $tag) {
  $o = Rpc (Api $learner.token) "create_payment_order" @{ p_session_id = $sessionId }
  Rpc (Api $learner.token) "attach_razorpay_order" @{ p_order_id = $o.id; p_razorpay_order_id = "order_$tag" } | Out-Null
  Rpc $svcH "apply_captured_payment" @{ p_razorpay_order_id = "order_$tag"; p_razorpay_payment_id = "pay_$tag";
    p_amount_paise = 30000; p_method = "upi" } | Out-Null
  return (Get-Rows (Api $learner.token) "enrollments?session_id=eq.$sessionId&user_id=eq.$($learner.id)&status=eq.enrolled&select=id")[0].id
}
function Sum-Amt($rows) {
  $s = ($rows | Measure-Object -Property amount_inr -Sum).Sum
  if ($null -eq $s) { return 0 }
  return [int]$s
}
# the repository's own two queries, verbatim in shape (repositories/payments.ts
# findClassMoney) - so what this proves is what the page renders
function Money-Of($headers, $classId) {
  $pay = Get-Rows $headers "payments?select=amount_inr,status,orders!inner(class_id)&orders.class_id=eq.$classId&status=in.(captured,refunded)&deleted_at=is.null"
  $ref = Get-Rows $headers "refunds?select=amount_inr,status,orders!inner(class_id)&orders.class_id=eq.$classId&deleted_at=is.null"
  return [pscustomobject]@{
    collected = Sum-Amt $pay
    refunded  = Sum-Amt ($ref | Where-Object { $_.status -eq "processed" })
    owed      = Sum-Amt ($ref | Where-Object { $_.status -eq "requested" -or $_.status -eq "pending" })
    payRows   = $pay.Count
  }
}

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$owner = New-EmailUser "earnproof-owner-$stamp@example.com" "Owner $stamp" "studio"
$trainer = New-EmailUser "earnproof-trainer-$stamp@example.com" "Trainer $stamp" "trainer"
$rival = New-EmailUser "earnproof-rival-$stamp@example.com" "Rival $stamp" "studio"
$learners = @()
foreach ($i in 1..5) { $learners += New-EmailUser "earnproof-l$i-$stamp@example.com" "Learner $i $stamp" "dancer" }

$ta = Rpc (Api $owner.token) "create_tenant_with_owner" @{ p_name = "Earn Proof Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }
$tb = Rpc (Api $rival.token) "create_tenant_with_owner" @{ p_name = "Rival Studio $stamp"; p_type = "studio"; p_area = "Andheri"; p_city = "Mumbai" }
Add-Member $ta.id $trainer.id "trainer" $owner.id

try {
  $tmr = (Get-Date).AddDays(1)
  # a PAID class tomorrow, so every cancellation lands inside the 48 h window
  # where the studio decides - which is how we get each refund state on purpose
  $cls = Rpc (Api $owner.token) "create_class_with_session" @{ p_tenant_id = $ta.id; p_title = "Earnings Class $stamp";
    p_style = "Hip-Hop"; p_level = "all"; p_room = $null; p_price_inr = 300; p_capacity = 10;
    p_status = "published"; p_starts_at = $tmr.ToString("yyyy-MM-ddT19:00:00zzz"); p_ends_at = $tmr.ToString("yyyy-MM-ddT20:00:00zzz") }
  $sid = (Get-Rows $svcH "class_sessions?class_id=eq.$($cls.id)&select=id")[0].id

  # a FREE class, for the zero case
  $free = Rpc (Api $owner.token) "create_class_with_session" @{ p_tenant_id = $ta.id; p_title = "Free Class $stamp";
    p_style = "Contemporary"; p_level = "all"; p_room = $null; p_price_inr = 0; p_capacity = 10;
    p_status = "published"; p_starts_at = $tmr.ToString("yyyy-MM-ddT17:00:00zzz"); p_ends_at = $tmr.ToString("yyyy-MM-ddT18:00:00zzz") }
  $freeSid = (Get-Rows $svcH "class_sessions?class_id=eq.$($free.id)&select=id")[0].id
  Rpc (Api $learners[0].token) "enroll_in_session" @{ p_session_id = $freeSid } | Out-Null

  # 1. a free class with a booked seat made nothing, and says so - the figure is
  #    zero because nothing came in, not because it is missing
  $m0 = Money-Of (Api $owner.token) $free.id
  Check 1 "Free class with a seat taken: came in Rs $($m0.collected), refunded Rs $($m0.refunded), owed Rs $($m0.owed)" (
    ($m0.collected -eq 0) -and ($m0.refunded -eq 0) -and ($m0.owed -eq 0))

  # five real paid seats
  $e = @()
  for ($i = 0; $i -lt 5; $i++) { $e += Buy-Seat $learners[$i] $sid "E$($i)$stamp" }

  # 2. THE DEPARTURE FROM THE PROTOTYPE: five seats at Rs 300 is Rs 1500 either
  #    way today - so make them disagree. One seat is comped by hand (an order
  #    that never captured), and price x seats would now over-count by Rs 300.
  $comped = New-EmailUser "earnproof-comp-$stamp@example.com" "Comped $stamp" "dancer"
  $co = Rpc (Api $comped.token) "create_payment_order" @{ p_session_id = $sid }
  Rpc (Api $comped.token) "attach_razorpay_order" @{ p_order_id = $co.id; p_razorpay_order_id = "order_COMP$stamp" } | Out-Null
  $m1 = Money-Of (Api $owner.token) $cls.id
  $seatsWithAnOrder = (Get-Rows $svcH "orders?class_id=eq.$($cls.id)&select=id").Count
  Check 2 "Came in counts captured payments (Rs $($m1.collected) from $($m1.payRows)), not price x $seatsWithAnOrder orders (Rs $(300 * $seatsWithAnOrder))" (
    ($m1.collected -eq 1500) -and ($m1.payRows -eq 5) -and ($seatsWithAnOrder -eq 6))

  # 3. a refund SETTLED: the money still came in, and goes back out on its own
  #    line - the prototype prints gross above and the refund under it
  $r1 = (Rpc (Api $learners[0].token) "cancel_booking" @{ p_enrollment_id = $e[0]; p_reason = "Family emergency" }).refund.id
  Rpc (Api $owner.token) "decide_refund" @{ p_refund_id = $r1; p_decision = "approve" } | Out-Null
  Rpc (Api $owner.token) "settle_refund_offline" @{ p_refund_id = $r1; p_note = "Cash at the desk" } | Out-Null
  $m2 = Money-Of (Api $owner.token) $cls.id
  Check 3 "A settled refund leaves came-in at Rs $($m2.collected) and refunds Rs $($m2.refunded) -> net Rs $($m2.collected - $m2.refunded)" (
    ($m2.collected -eq 1500) -and ($m2.refunded -eq 300) -and ($m2.owed -eq 0))

  # 4. an OPEN request is owed, not refunded - nothing has gone back yet
  Rpc (Api $learners[1].token) "cancel_booking" @{ p_enrollment_id = $e[1]; p_reason = "Changed my mind" } | Out-Null
  $m3 = Money-Of (Api $owner.token) $cls.id
  Check 4 "An open request is owed (Rs $($m3.owed)) and not counted as refunded (Rs $($m3.refunded))" (
    ($m3.owed -eq 300) -and ($m3.refunded -eq 300))

  # 5. a DECLINED refund is in neither total - the prototype counts only Paid,
  #    and Requested + Processing. A refusal is a decision, not money moving.
  $r3 = (Rpc (Api $learners[2].token) "cancel_booking" @{ p_enrollment_id = $e[2]; p_reason = "Too far" }).refund.id
  Rpc (Api $owner.token) "decide_refund" @{ p_refund_id = $r3; p_decision = "decline"; p_note = "Outside our policy" } | Out-Null
  $m4 = Money-Of (Api $owner.token) $cls.id
  Check 5 "A declined refund is in neither total (refunded Rs $($m4.refunded), owed Rs $($m4.owed))" (
    ($m4.refunded -eq 300) -and ($m4.owed -eq 300))

  # 6. nor is a FAILED one - the rail broke, so no money went back
  $r4 = (Rpc (Api $learners[3].token) "cancel_booking" @{ p_enrollment_id = $e[3]; p_reason = "Injury" }).refund.id
  Rpc (Api $owner.token) "decide_refund" @{ p_refund_id = $r4; p_decision = "approve" } | Out-Null
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/refunds?id=eq.$r4" -Headers $svcH `
    -Body (@{ status = "failed" } | ConvertTo-Json) | Out-Null
  $m5 = Money-Of (Api $owner.token) $cls.id
  Check 6 "A failed refund is in neither total (refunded Rs $($m5.refunded), owed Rs $($m5.owed))" (
    ($m5.refunded -eq 300) -and ($m5.owed -eq 300))

  # 7. the rival's own paid class money never lands in ours
  $rcls = Rpc (Api $rival.token) "create_class_with_session" @{ p_tenant_id = $tb.id; p_title = "Rival Class $stamp";
    p_style = "Bollywood"; p_level = "all"; p_room = $null; p_price_inr = 300; p_capacity = 10;
    p_status = "published"; p_starts_at = $tmr.ToString("yyyy-MM-ddT19:00:00zzz"); p_ends_at = $tmr.ToString("yyyy-MM-ddT20:00:00zzz") }
  $rsid = (Get-Rows $svcH "class_sessions?class_id=eq.$($rcls.id)&select=id")[0].id
  Buy-Seat $learners[4] $rsid "RIV$stamp" | Out-Null
  $m6 = Money-Of (Api $owner.token) $cls.id
  Check 7 "A rival studio's takings stay out of our class (came in still Rs $($m6.collected))" ($m6.collected -eq 1500)

  # 8. and the rival cannot read ours at all
  $rivalSees = Money-Of (Api $rival.token) $cls.id
  $anonSees = Money-Of $anonH $cls.id
  Check 8 "Rival reads Rs $($rivalSees.collected) from $($rivalSees.payRows) rows; the public Rs $($anonSees.collected) from $($anonSees.payRows)" (
    ($rivalSees.payRows -eq 0) -and ($anonSees.payRows -eq 0))

  # 9. THE HONEST CHECK: the owner-only Earnings tab is the prototype's own
  #    presentation gate (isMine, 11757), NOT a security boundary. Step 9 admits
  #    every member of the tenant to these rows and this asserts that is still
  #    true, so nobody later reads "owner-only tab" as "trainers cannot see the
  #    takings". Narrowing that is an RLS change to Step 9, not a UI change here.
  $trainerSees = Money-Of (Api $trainer.token) $cls.id
  Check 9 "A trainer still reads the rows directly (Rs $($trainerSees.collected)) - the tab is a UI gate, not a wall" (
    ($trainerSees.collected -eq 1500) -and ($trainerSees.payRows -eq 5))
}
finally {
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers $svcH | Out-Null
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($tb.id)" -Headers $svcH | Out-Null
  $all = @($owner, $trainer, $rival) + $learners
  if ($comped) { $all += $comped }
  foreach ($u in $all) {
    Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null
  }
  "   (cleanup: proof studios and throwaway accounts deleted)"
}

if ($pass) { "`nALL CLASS EARNINGS CHECKS PASSED"; exit 0 } else { "`nCLASS EARNINGS CHECKS FAILED"; exit 1 }
