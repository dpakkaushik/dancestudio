# Proof for Step 10 (attendance + waitlist management): only the studio's
# owner/trainer runs the register, the clock owns the check-in window, checking
# in is idempotent and reversible, a paid class's freed seat waits for the owner
# (no auto-promote), give_spot respects capacity, and nobody writes attendance
# directly.
# Reads keys from .env.local - run from the repo root: powershell -File scripts/rls-proof-attendance.ps1
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

function Sign-In($phone) {
  $h = @{ apikey = $anon; "Content-Type" = "application/json" }
  Invoke-RestMethod -Method Post -Uri "$base/auth/v1/otp" -Headers $h -Body ("{`"phone`":`"$phone`"}") | Out-Null
  return Invoke-RestMethod -Method Post -Uri "$base/auth/v1/verify" -Headers $h -Body ("{`"type`":`"sms`",`"phone`":`"$phone`",`"token`":`"123456`"}")
}
function Api($token) { return @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" } }
$svcH = @{ apikey = $service; Authorization = "Bearer $service"; "Content-Type" = "application/json"; Prefer = "return=representation" }

function Rpc($headers, $fn, $body) {
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body ($body | ConvertTo-Json)
}
# PS 5.1: count [] as 0 (ConvertFrom-Json + null filter) and stop 1-row unrolling (,@)
function Get-Rows($headers, $path) {
  $res = Invoke-WebRequest -Method Get -Uri "$base/rest/v1/$path" -Headers $headers -UseBasicParsing
  return ,@(($res.Content | ConvertFrom-Json) | Where-Object { $null -ne $_ })
}
function Expect-Fail($script) { try { & $script | Out-Null; return $false } catch { return $true } }
function Check($n, $label, $ok) {
  "$n. $label $(if ($ok) {'-- OK'} else {'-- !!! FAILED !!!'})"
  if (-not $ok) { $script:pass = $false }
}
function New-TimedClass($headers, $tenantId, $title, $price, $cap, $startsAt, $endsAt) {
  $body = @{ p_tenant_id = $tenantId; p_title = $title; p_style = "Hip-Hop"; p_level = "beginner";
             p_room = "Studio A"; p_price_inr = $price; p_capacity = $cap; p_status = "published";
             p_starts_at = $startsAt; p_ends_at = $endsAt } | ConvertTo-Json
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_class_with_session" -Headers $headers -Body $body
}
function Session-Of($classId) {
  $rows = Get-Rows $svcH "class_sessions?class_id=eq.$classId&select=id"
  return $rows[0].id
}

$a = Sign-In "+919999999999"   # studio owner
$b = Sign-In "+918888888888"   # learner
$pass = $true
$stamp = Get-Date -Format "HHmmss"
# a session inside the check-in window (opens 30 min before start)
$soonStart = (Get-Date).AddMinutes(10).ToString("yyyy-MM-ddTHH:mm:sszzz")
$soonEnd = (Get-Date).AddMinutes(70).ToString("yyyy-MM-ddTHH:mm:sszzz")
$farStart = (Get-Date).AddDays(7).ToString("yyyy-MM-ddT19:00:00zzz")
$farEnd = (Get-Date).AddDays(7).ToString("yyyy-MM-ddT20:00:00zzz")

$ta = Rpc (Api $a.access_token) "create_tenant_with_owner" @{ p_name = "Att Proof Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }

try {
  # ---- free class starting soon: the register itself -------------------------
  $cL = New-TimedClass (Api $a.access_token) $ta.id "Register Soon $stamp" 0 3 $soonStart $soonEnd
  $sL = Session-Of $cL.id
  $eB = Rpc (Api $b.access_token) "enroll_in_session" @{ p_session_id = $sL }

  # 1. a learner cannot run the register
  $learnerBlocked = Expect-Fail { Rpc (Api $b.access_token) "check_in" @{ p_enrollment_id = $eB.id } }
  Check 1 "Learner cannot check anyone in" $learnerBlocked

  # 2. the owner checks the booking in
  Rpc (Api $a.access_token) "check_in" @{ p_enrollment_id = $eB.id } | Out-Null
  $att = Get-Rows (Api $b.access_token) "attendance?enrollment_id=eq.$($eB.id)&deleted_at=is.null&select=id"
  Check 2 "Owner checks in; the learner sees their own check-in ($($att.Count))" ($att.Count -eq 1)

  # 3. checking in twice is a no-op
  Rpc (Api $a.access_token) "check_in" @{ p_enrollment_id = $eB.id } | Out-Null
  $att2 = Get-Rows (Api $a.access_token) "attendance?enrollment_id=eq.$($eB.id)&deleted_at=is.null&select=id"
  Check 3 "Second check-in is a no-op (still $($att2.Count) live row)" ($att2.Count -eq 1)

  # 4. undo clears the live row (history soft-deleted, not destroyed)
  Rpc (Api $a.access_token) "undo_check_in" @{ p_enrollment_id = $eB.id } | Out-Null
  $att3 = Get-Rows (Api $a.access_token) "attendance?enrollment_id=eq.$($eB.id)&deleted_at=is.null&select=id"
  $att3all = Get-Rows $svcH "attendance?enrollment_id=eq.$($eB.id)&select=id"
  Check 4 "Undo check-in (live $($att3.Count), history $($att3all.Count))" (($att3.Count -eq 0) -and ($att3all.Count -eq 1))

  # 5. the clock owns the window: a session 7 days out is closed
  $cF = New-TimedClass (Api $a.access_token) $ta.id "Far Class $stamp" 0 3 $farStart $farEnd
  $sF = Session-Of $cF.id
  $eBF = Rpc (Api $b.access_token) "enroll_in_session" @{ p_session_id = $sF }
  $windowBlocked = Expect-Fail { Rpc (Api $a.access_token) "check_in" @{ p_enrollment_id = $eBF.id } }
  Check 5 "Check-in before the window is rejected" $windowBlocked

  # ---- paid class, one seat: the owner's queue -------------------------------
  $cP = New-TimedClass (Api $a.access_token) $ta.id "Paid One Seat $stamp" 300 1 $soonStart $soonEnd
  $sP = Session-Of $cP.id
  $oB = Rpc (Api $b.access_token) "create_payment_order" @{ p_session_id = $sP }
  Rpc (Api $b.access_token) "attach_razorpay_order" @{ p_order_id = $oB.id; p_razorpay_order_id = "order_ATT$stamp" } | Out-Null
  Rpc $svcH "apply_captured_payment" @{ p_razorpay_order_id = "order_ATT$stamp"; p_razorpay_payment_id = "pay_ATT$stamp"; p_amount_paise = 30000; p_method = "upi" } | Out-Null
  $eA = Rpc (Api $a.access_token) "enroll_in_session" @{ p_session_id = $sP }   # full -> waitlisted

  # 6. give_spot respects capacity
  $fullBlocked = Expect-Fail { Rpc (Api $a.access_token) "give_spot" @{ p_enrollment_id = $eA.id } }
  Check 6 "Give spot while full is rejected" $fullBlocked

  # 7. a paid class's freed seat waits for the owner (Step 9 rule, seen here)
  $ebP = Get-Rows (Api $b.access_token) "enrollments?session_id=eq.$sP&status=eq.enrolled&select=id"
  Rpc (Api $b.access_token) "cancel_booking" @{ p_enrollment_id = $ebP[0].id; p_reason = "Schedule clash" } | Out-Null
  $eAafter = Get-Rows (Api $a.access_token) "enrollments?id=eq.$($eA.id)&select=status"
  Check 7 "Freed paid seat does NOT auto-promote (still $($eAafter[0].status))" ($eAafter[0].status -eq "waitlisted")

  # 8. the owner hands the seat out
  Rpc (Api $a.access_token) "give_spot" @{ p_enrollment_id = $eA.id } | Out-Null
  $eAgiven = Get-Rows (Api $a.access_token) "enrollments?id=eq.$($eA.id)&select=status"
  Check 8 "Give spot promotes the waitlisted learner (now $($eAgiven[0].status))" ($eAgiven[0].status -eq "enrolled")

  # 9. the owner clears a queue entry
  $eB2 = Rpc (Api $b.access_token) "enroll_in_session" @{ p_session_id = $sP }   # full again -> waitlisted
  Rpc (Api $a.access_token) "remove_from_waitlist" @{ p_enrollment_id = $eB2.id } | Out-Null
  $eB2after = Get-Rows (Api $b.access_token) "enrollments?id=eq.$($eB2.id)&select=status"
  Check 9 "Remove from waitlist (now $($eB2after[0].status))" ($eB2after[0].status -eq "cancelled")

  # 10. nobody writes attendance directly
  $directBlocked = Expect-Fail {
    Invoke-RestMethod -Method Post -Uri "$base/rest/v1/attendance" -Headers (Api $a.access_token) -Body (@{
      enrollment_id = $eB.id; session_id = $sL; class_id = $cL.id; tenant_id = $ta.id; user_id = $b.user.id } | ConvertTo-Json)
  }
  Check 10 "Direct insert into attendance is rejected" $directBlocked
}
finally {
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers $svcH | Out-Null
  "   (cleanup: proof studio deleted)"
}

if ($pass) { "`nALL ATTENDANCE CHECKS PASSED"; exit 0 } else { "`nATTENDANCE CHECKS FAILED"; exit 1 }
