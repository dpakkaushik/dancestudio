# Money proof for Step 9 (payments; provider-neutral since the Cashfree rail swap): the free path is closed for priced
# classes, orders/payments/refunds move only through the RPCs, captures are
# idempotent and capacity-safe, refunds follow the 48h window, and RLS shows
# money rows only to the payer and the studio.
# Reads keys from .env.local - run from the repo root: powershell -File scripts/rls-proof-payments.ps1
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

function Sign-In($phone) {
  $h = @{ apikey = $anon; "Content-Type" = "application/json" }
  Invoke-RestMethod -Method Post -Uri "$base/auth/v1/otp" -Headers $h -Body ("{`"phone`":`"$phone`"}") | Out-Null
  return Invoke-RestMethod -Method Post -Uri "$base/auth/v1/verify" -Headers $h -Body ("{`"type`":`"sms`",`"phone`":`"$phone`",`"token`":`"123456`"}")
}
function Api($token) { return @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" } }
$svcH = @{ apikey = $service; Authorization = "Bearer $service"; "Content-Type" = "application/json"; Prefer = "return=representation" }
$anonH = @{ apikey = $anon; "Content-Type" = "application/json" }

function New-Class($headers, $tenantId, $title, $price, $cap, $daysOut) {
  $starts = (Get-Date).AddDays($daysOut).ToString("yyyy-MM-ddT19:00:00+05:30")
  $ends = (Get-Date).AddDays($daysOut).ToString("yyyy-MM-ddT20:00:00+05:30")
  $body = @{ p_tenant_id = $tenantId; p_title = $title; p_style = "Hip-Hop"; p_level = "beginner";
             p_room = "Studio A"; p_price_inr = $price; p_capacity = $cap; p_status = "published";
             p_starts_at = $starts; p_ends_at = $ends } | ConvertTo-Json
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_class_with_session" -Headers $headers -Body $body
}
function Session-Of($classId) {
  $rows = @(Invoke-RestMethod -Method Get -Uri "$base/rest/v1/class_sessions?class_id=eq.$classId&select=id" -Headers $svcH)
  return $rows[0].id
}

function Rpc($headers, $fn, $body) {
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body ($body | ConvertTo-Json)
}
# PS 5.1 gotcha: Invoke-RestMethod parses an empty JSON [] into something @() counts
# as 1 - go through ConvertFrom-Json + a null filter so 0 rows counts as 0.
function Get-Rows($headers, $path) {
  $res = Invoke-WebRequest -Method Get -Uri "$base/rest/v1/$path" -Headers $headers -UseBasicParsing
  # the leading comma stops PS unrolling a 1-row array into a scalar on return
  return ,@(($res.Content | ConvertFrom-Json) | Where-Object { $null -ne $_ })
}
function Expect-Fail($script) { try { & $script | Out-Null; return $false } catch { return $true } }
function Check($n, $label, $ok) {
  "$n. $label $(if ($ok) {'-- OK'} else {'-- !!! FAILED !!!'})"
  if (-not $ok) { $script:pass = $false }
}

$a = Sign-In "+919999999999"   # studio owner
$b = Sign-In "+918888888888"   # learner
$pass = $true
$stamp = Get-Date -Format "HHmmss"

$ta = Rpc (Api $a.access_token) "create_tenant_with_owner" @{ p_name = "Pay Proof Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }

try {
  # class 1: paid (Rs 300), roomy capacity, 7 days out (outside the 48h window)
  $c1 = New-Class (Api $a.access_token) $ta.id "Paid Foundations $stamp" 300 10 7
  $s1 = Session-Of $c1.id

  # 1. the free path is closed for priced classes
  $freeBlocked = Expect-Fail { Rpc (Api $b.access_token) "enroll_in_session" @{ p_session_id = $s1 } }
  Check 1 "Free-enrolling a priced class is rejected" $freeBlocked

  # 2. create_payment_order prices from the database
  $o1 = Rpc (Api $b.access_token) "create_payment_order" @{ p_session_id = $s1 }
  Check 2 "Order created (amount $($o1.amount_inr), status $($o1.status))" (($o1.amount_inr -eq 300) -and ($o1.status -eq "created"))
  Rpc (Api $b.access_token) "attach_provider_order" @{ p_order_id = $o1.id; p_provider_order_id = "order_PROOF$stamp" } | Out-Null

  # 3. nobody writes money tables directly
  $insertBlocked = Expect-Fail {
    Invoke-RestMethod -Method Post -Uri "$base/rest/v1/orders" -Headers (Api $b.access_token) -Body (@{
      tenant_id = $ta.id; user_id = $b.user.id; class_id = $c1.id; session_id = $s1; amount_inr = 1 } | ConvertTo-Json)
  }
  Check 3 "Direct insert into orders is rejected" $insertBlocked

  # 4. the apply_* functions belong to the machine alone
  $anonApplyBlocked = Expect-Fail {
    Rpc $anonH "apply_captured_payment" @{ p_provider_order_id = "order_PROOF$stamp"; p_provider_payment_id = "pay_NOPE"; p_amount_paise = 30000; p_method = "upi" }
  }
  Check 4 "Anon cannot call apply_captured_payment" $anonApplyBlocked

  # 5. a verified capture books the seat
  $cap1 = Rpc $svcH "apply_captured_payment" @{ p_provider_order_id = "order_PROOF$stamp"; p_provider_payment_id = "pay_PROOF$stamp"; p_amount_paise = 30000; p_method = "upi" }
  $enr = Get-Rows (Api $b.access_token) "enrollments?session_id=eq.$s1&select=id,status"
  $ord = Get-Rows (Api $b.access_token) "orders?id=eq.$($o1.id)&select=status"
  Check 5 "Captured payment enrolls (outcome $($cap1.outcome), order $($ord[0].status))" (($cap1.outcome -eq "enrolled") -and ($enr.Count -eq 1) -and ($enr[0].status -eq "enrolled") -and ($ord[0].status -eq "paid"))

  # 6. the same payment event twice is a no-op
  $cap2 = Rpc $svcH "apply_captured_payment" @{ p_provider_order_id = "order_PROOF$stamp"; p_provider_payment_id = "pay_PROOF$stamp"; p_amount_paise = 30000; p_method = "upi" }
  $enr2 = Get-Rows (Api $b.access_token) "enrollments?session_id=eq.$s1&select=id"
  $pays = Get-Rows (Api $b.access_token) "payments?order_id=eq.$($o1.id)&select=id"
  Check 6 "Replayed capture is a no-op (outcome $($cap2.outcome))" (($cap2.outcome -eq "duplicate") -and ($enr2.Count -eq 1) -and ($pays.Count -eq 1))

  # 7. the studio sees its money, the public sees none
  $ordA = Get-Rows (Api $a.access_token) "orders?id=eq.$($o1.id)&select=id"
  $ordAnon = Get-Rows $anonH "orders?select=id"
  Check 7 "Studio member reads the order ($($ordA.Count)); anon reads none ($($ordAnon.Count))" (($ordA.Count -eq 1) -and ($ordAnon.Count -eq 0))

  # 8. a capture landing on a full class refunds instead of overbooking
  $c2 = New-Class (Api $a.access_token) $ta.id "One Seat $stamp" 300 1 7
  $s2 = Session-Of $c2.id
  $oB = Rpc (Api $b.access_token) "create_payment_order" @{ p_session_id = $s2 }
  Rpc (Api $b.access_token) "attach_provider_order" @{ p_order_id = $oB.id; p_provider_order_id = "order_B2$stamp" } | Out-Null
  $oA = Rpc (Api $a.access_token) "create_payment_order" @{ p_session_id = $s2 }
  Rpc (Api $a.access_token) "attach_provider_order" @{ p_order_id = $oA.id; p_provider_order_id = "order_A2$stamp" } | Out-Null
  Rpc $svcH "apply_captured_payment" @{ p_provider_order_id = "order_B2$stamp"; p_provider_payment_id = "pay_B2$stamp"; p_amount_paise = 30000; p_method = "upi" } | Out-Null
  $capLate = Rpc $svcH "apply_captured_payment" @{ p_provider_order_id = "order_A2$stamp"; p_provider_payment_id = "pay_A2$stamp"; p_amount_paise = 30000; p_method = "card" }
  $refA = Get-Rows (Api $a.access_token) "refunds?order_id=eq.$($oA.id)&select=id,status,reason"
  $enrA = Get-Rows (Api $a.access_token) "enrollments?session_id=eq.$s2&user_id=eq.$($a.user.id)&status=eq.enrolled&select=id"
  Check 8 "Late capture on a full class refunds (outcome $($capLate.outcome), refund $($refA[0].status), not enrolled)" (($capLate.outcome -eq "refund_pending") -and ($refA.Count -eq 1) -and ($refA[0].status -eq "pending") -and ($enrA.Count -eq 0))

  # 9. cancelling outside 48h: seat freed, full refund pending
  $out9 = Rpc (Api $b.access_token) "cancel_booking" @{ p_enrollment_id = $enr[0].id; p_reason = "Travelling" }
  $counts = Rpc $anonH "session_seat_counts" @{ p_session_ids = @($s1) }
  $seatFreed = (@($counts | Where-Object { $_.session_id -eq $s1 }).Count -eq 0)
  Check 9 "Cancel outside 48h frees the seat and files a pending refund ($($out9.refund.status))" (($out9.refund.status -eq "pending") -and ($out9.refund.amount_inr -eq 300) -and $seatFreed)

  # 10. refund.processed closes the loop
  Rpc $svcH "apply_refund_update" @{ p_provider_payment_id = "pay_PROOF$stamp"; p_provider_refund_id = "rfnd_PROOF$stamp"; p_amount_paise = 30000; p_succeeded = $true } | Out-Null
  $ref10 = Get-Rows (Api $b.access_token) "refunds?order_id=eq.$($o1.id)&select=status"
  $ord10 = Get-Rows (Api $b.access_token) "orders?id=eq.$($o1.id)&select=status"
  Check 10 "Refund processed (refund $($ref10[0].status), order $($ord10[0].status))" (($ref10[0].status -eq "processed") -and ($ord10[0].status -eq "refunded"))

  # 11. cancelling inside 48h: the studio decides (requested, no auto refund)
  $c3 = New-Class (Api $a.access_token) $ta.id "Tomorrow $stamp" 300 10 1
  $s3 = Session-Of $c3.id
  $o3 = Rpc (Api $b.access_token) "create_payment_order" @{ p_session_id = $s3 }
  Rpc (Api $b.access_token) "attach_provider_order" @{ p_order_id = $o3.id; p_provider_order_id = "order_C3$stamp" } | Out-Null
  Rpc $svcH "apply_captured_payment" @{ p_provider_order_id = "order_C3$stamp"; p_provider_payment_id = "pay_C3$stamp"; p_amount_paise = 30000; p_method = "upi" } | Out-Null
  $enr3 = Get-Rows (Api $b.access_token) "enrollments?session_id=eq.$s3&status=eq.enrolled&select=id"
  $out11 = Rpc (Api $b.access_token) "cancel_booking" @{ p_enrollment_id = $enr3[0].id; p_reason = "Changed my mind" }
  Check 11 "Cancel inside 48h files a request, not a refund ($($out11.refund.status))" ($out11.refund.status -eq "requested")

  # 12. a free class still promotes its waitlist on cancel
  $c4 = New-Class (Api $a.access_token) $ta.id "Free Cypher $stamp" 0 1 7
  $s4 = Session-Of $c4.id
  $e4b = Rpc (Api $b.access_token) "enroll_in_session" @{ p_session_id = $s4 }
  Rpc (Api $a.access_token) "enroll_in_session" @{ p_session_id = $s4 } | Out-Null
  Rpc (Api $b.access_token) "cancel_enrollment" @{ p_enrollment_id = $e4b.id } | Out-Null
  $e4a = Get-Rows (Api $a.access_token) "enrollments?session_id=eq.$s4&user_id=eq.$($a.user.id)&select=status"
  Check 12 "Free-class cancel still promotes the waitlist (now $($e4a[0].status))" ($e4a[0].status -eq "enrolled")
}
finally {
  # the proof cleans up after itself - service role removes the studio, children cascade
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers $svcH | Out-Null
  "   (cleanup: proof studio deleted)"
}

if ($pass) { "`nALL PAYMENT CHECKS PASSED"; exit 0 } else { "`nPAYMENT CHECKS FAILED"; exit 1 }
