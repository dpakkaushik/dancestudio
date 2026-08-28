# Proof for Step 13b part 2b - the studio's money IN (prototype S_earn 17992-18085,
# 18171-18178): GROSS by month, the vs-last-month badge's two inputs, REFUNDED,
# what is being asked back, and HOW STUDENTS PAID.
#
# No table, no RPC, no policy: this slice SUMS the payments and refunds Step 9
# already admits a tenant's members to. So the claims under test are arithmetic
# and scope - what counts as gross, what counts as a deduction, which month a
# rupee lands in (IST, not UTC), that the window is the window, and that the
# numbers are the studio's own. Every query here is the repository's own, verbatim
# in shape (repositories/income.ts), so what this proves is what the page renders.
#
# Check 12 is the honest one, part 2a's again: the screen is owner-only because
# the prototype gates S_earn on the studio's owner, and that is a PRESENTATION
# gate - a trainer reads the same rows through the API, by Step 9's design.
#
# Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-studio-income.ps1
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
# a captured payment of Rs 300 by the given method, exactly as the webhook applies one
function Buy-Seat($learner, $sessionId, $tag, $method) {
  $o = Rpc (Api $learner.token) "create_payment_order" @{ p_session_id = $sessionId }
  Rpc (Api $learner.token) "attach_provider_order" @{ p_order_id = $o.id; p_provider_order_id = "order_$tag" } | Out-Null
  Rpc $svcH "apply_captured_payment" @{ p_provider_order_id = "order_$tag"; p_provider_payment_id = "pay_$tag";
    p_amount_paise = 30000; p_method = $method } | Out-Null
  return (Get-Rows (Api $learner.token) "enrollments?session_id=eq.$sessionId&user_id=eq.$($learner.id)&status=eq.enrolled&select=id")[0].id
}
# the clock is the only thing the page cannot control, so the proof moves it:
# a payment row's created_at, rewritten with the service role (no policy admits
# anybody else to write payments at all)
function Backdate-Payment($tag, $iso) {
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/payments?provider_payment_id=eq.pay_$tag" -Headers $svcH `
    -Body (@{ created_at = $iso } | ConvertTo-Json) | Out-Null
}
function Sum-Amt($rows) {
  $s = ($rows | Measure-Object -Property amount_inr -Sum).Sum
  if ($null -eq $s) { return 0 }
  return [int]$s
}

# -- months, in IST - the same arithmetic lib/format/month.ts does --------------
$IST = [timespan]::FromHours(5.5)
function Month-Key($iso) { return ([datetimeoffset]$iso).ToOffset($IST).ToString("yyyy-MM") }
function Month-Key-Utc($iso) { return ([datetimeoffset]$iso).ToUniversalTime().ToString("yyyy-MM") }
$nowIst = [datetimeoffset]::UtcNow.ToOffset($IST)
$firstOfMonth = New-Object DateTimeOffset ($nowIst.Year, $nowIst.Month, 1, 0, 0, 0, $IST)
$curKey = $firstOfMonth.ToString("yyyy-MM")
$prevKey = $firstOfMonth.AddMonths(-1).ToString("yyyy-MM")
$fromIso = $firstOfMonth.AddMonths(-3).ToString("yyyy-MM-ddTHH:mm:sszzz")
$fromQ = [uri]::EscapeDataString($fromIso)

function New-Bucket { return @{ gross = 0; n = 0; refunded = 0; refundCount = 0; methods = @{} } }
# the repository's own three queries, verbatim in shape (repositories/income.ts
# findTenantIncome), then bucketed by IST month the way it buckets them
function Income-Of($headers, $tenantId) {
  $pay = Get-Rows $headers "payments?select=amount_inr,status,method,created_at&tenant_id=eq.$tenantId&status=in.(captured,refunded)&deleted_at=is.null&created_at=gte.$fromQ&order=created_at.desc"
  $ref = Get-Rows $headers "refunds?select=amount_inr,created_at,decided_at,updated_at&tenant_id=eq.$tenantId&status=eq.processed&deleted_at=is.null&updated_at=gte.$fromQ"
  $open = Get-Rows $headers "refunds?select=amount_inr&tenant_id=eq.$tenantId&status=in.(requested,pending)&deleted_at=is.null"
  $months = @{}
  foreach ($p in $pay) {
    $k = Month-Key $p.created_at
    if (-not $months.ContainsKey($k)) { $months[$k] = New-Bucket }
    $months[$k].gross += [int]$p.amount_inr
    $months[$k].n += 1
    $m = if ($p.method) { $p.method } else { "other" }
    $months[$k].methods[$m] = [int]($months[$k].methods[$m]) + [int]$p.amount_inr
  }
  foreach ($r in $ref) {
    $when = if ($r.decided_at) { $r.decided_at } else { $r.updated_at }
    $k = Month-Key $when
    if (-not $months.ContainsKey($k)) { $months[$k] = New-Bucket }
    $months[$k].refunded += [int]$r.amount_inr
    $months[$k].refundCount += 1
  }
  return [pscustomobject]@{ months = $months; open = (Sum-Amt $open); openCount = $open.Count
    payRows = $pay.Count; refRows = $ref.Count; payments = $pay }
}
function M($inc, $key, $field) {
  if ($inc.months.ContainsKey($key)) { return $inc.months[$key][$field] }
  if ($field -eq "methods") { return @{} }
  return 0
}

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$owner = New-EmailUser "income-owner-$stamp@example.com" "Owner $stamp" "studio"
$trainer = New-EmailUser "income-trainer-$stamp@example.com" "Trainer $stamp" "trainer"
$rival = New-EmailUser "income-rival-$stamp@example.com" "Rival $stamp" "studio"
$learners = @()
foreach ($i in 0..6) { $learners += New-EmailUser "income-l$i-$stamp@example.com" "Learner $i $stamp" "dancer" }

$ta = Rpc (Api $owner.token) "create_tenant_with_owner" @{ p_name = "Income Proof Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }
$tb = Rpc (Api $rival.token) "create_tenant_with_owner" @{ p_name = "Rival Studio $stamp"; p_type = "studio"; p_area = "Andheri"; p_city = "Mumbai" }
Add-Member $ta.id $trainer.id "trainer" $owner.id

try {
  $tmr = (Get-Date).AddDays(1)
  # a PAID class tomorrow: every cancellation lands inside the 48 h window where
  # the studio decides, which is how each refund state is produced on purpose
  $cls = Rpc (Api $owner.token) "create_class_with_session" @{ p_tenant_id = $ta.id; p_title = "Income Class $stamp";
    p_style = "Hip-Hop"; p_level = "all"; p_room = $null; p_price_inr = 300; p_capacity = 10;
    p_status = "published"; p_starts_at = $tmr.ToString("yyyy-MM-ddT19:00:00zzz"); p_ends_at = $tmr.ToString("yyyy-MM-ddT20:00:00zzz") }
  $sid = (Get-Rows $svcH "class_sessions?class_id=eq.$($cls.id)&select=id")[0].id

  # 1. a studio that has taken nothing prints zero everywhere - zero because
  #    nothing came in, not because something is missing
  $i0 = Income-Of (Api $owner.token) $ta.id
  Check 1 "Empty studio: gross Rs $(M $i0 $curKey 'gross') this month, Rs $($i0.open) asked back, $($i0.payRows) payment rows" (
    ((M $i0 $curKey "gross") -eq 0) -and ($i0.open -eq 0) -and ($i0.payRows -eq 0))

  # 2. four seats, three ways of paying - GROSS and HOW STUDENTS PAID are the
  #    same rows read twice
  $e = @()
  $e += Buy-Seat $learners[0] $sid "I0$stamp" "upi"
  $e += Buy-Seat $learners[1] $sid "I1$stamp" "upi"
  $e += Buy-Seat $learners[2] $sid "I2$stamp" "card"
  $e += Buy-Seat $learners[3] $sid "I3$stamp" "netbanking"
  $i1 = Income-Of (Api $owner.token) $ta.id
  $meth = M $i1 $curKey "methods"
  Check 2 "Four captured payments: gross Rs $(M $i1 $curKey 'gross') from $(M $i1 $curKey 'n'); UPI Rs $($meth['upi']) - Cards Rs $($meth['card']) - Netbanking Rs $($meth['netbanking'])" (
    ((M $i1 $curKey "gross") -eq 1200) -and ((M $i1 $curKey "n") -eq 4) -and
    ($meth["upi"] -eq 600) -and ($meth["card"] -eq 300) -and ($meth["netbanking"] -eq 300))

  # 3. THE BADGE IS COUNTED AGAINST THE MONTH IT NAMES (prototype 17996-18011):
  #    move one payment into last month and the two inputs separate - this month
  #    Rs 900, last month Rs 300, so the pill would read a 200% rise. It goes
  #    down as readily as up; a number that can only be good news is not a
  #    measurement.
  Backdate-Payment "I1$stamp" ($firstOfMonth.AddMonths(-1).AddDays(14).AddHours(12).ToString("yyyy-MM-ddTHH:mm:sszzz"))
  $i2 = Income-Of (Api $owner.token) $ta.id
  $cur = M $i2 $curKey "gross"; $prev = M $i2 $prevKey "gross"
  $pct = if ($prev -gt 0) { [math]::Round(1000 * ($cur - $prev) / $prev) / 10 } else { $null }
  Check 3 "Last month Rs $prev vs this month Rs $cur -> badge would read $(if ($pct -ge 0) {'up'} else {'down'}) $([math]::Abs($pct))% vs $prevKey" (
    ($cur -eq 900) -and ($prev -eq 300) -and ((M $i2 $curKey "n") -eq 3) -and ($pct -eq 200))

  # 4. MONTHS ARE IST, NOT UTC: 00:15 on the 1st in India is 18:45 on the last
  #    day of the previous month in UTC. The IST bucket keeps it in this month;
  #    a UTC reading would have moved Rs 300 into last month.
  $boundary = $firstOfMonth.AddMinutes(15).ToString("yyyy-MM-ddTHH:mm:sszzz")
  Backdate-Payment "I0$stamp" $boundary
  $i3 = Income-Of (Api $owner.token) $ta.id
  $row0 = $i3.payments | Where-Object { $_.method -eq "upi" -and (Month-Key $_.created_at) -eq $curKey } | Select-Object -First 1
  Check 4 "A payment at 00:15 IST on the 1st is this month in IST ($(Month-Key $row0.created_at)) and last month in UTC ($(Month-Key-Utc $row0.created_at)); gross stays Rs $(M $i3 $curKey 'gross')" (
    ($null -ne $row0) -and ((Month-Key $row0.created_at) -eq $curKey) -and ((Month-Key-Utc $row0.created_at) -eq $prevKey) -and
    ((M $i3 $curKey "gross") -eq 900) -and ((M $i3 $prevKey "gross") -eq 300))

  # 5. a FAILED payment is not money: it never enters gross and never appears in
  #    the rows the page reads
  $fo = Rpc (Api $learners[4].token) "create_payment_order" @{ p_session_id = $sid }
  Rpc (Api $learners[4].token) "attach_provider_order" @{ p_order_id = $fo.id; p_provider_order_id = "order_F$stamp" } | Out-Null
  Rpc $svcH "apply_failed_payment" @{ p_provider_order_id = "order_F$stamp"; p_provider_payment_id = "pay_F$stamp" } | Out-Null
  $i4 = Income-Of (Api $owner.token) $ta.id
  $failedSeen = @($i4.payments | Where-Object { $_.status -eq "failed" }).Count
  Check 5 "A failed payment adds nothing (gross Rs $(M $i4 $curKey 'gross'), $failedSeen failed rows in the read)" (
    ((M $i4 $curKey "gross") -eq 900) -and ($failedSeen -eq 0))

  # 6. a refund SETTLED at the desk is this month's deduction; the payment it
  #    reverses still COUNTS AS CAME IN - the statement prints gross above and
  #    the refund beneath, never a smaller gross
  $r2 = (Rpc (Api $learners[2].token) "cancel_booking" @{ p_enrollment_id = $e[2]; p_reason = "Family emergency" }).refund.id
  Rpc (Api $owner.token) "decide_refund" @{ p_refund_id = $r2; p_decision = "approve" } | Out-Null
  Rpc (Api $owner.token) "settle_refund_offline" @{ p_refund_id = $r2; p_note = "Cash at the desk" } | Out-Null
  $i5 = Income-Of (Api $owner.token) $ta.id
  Check 6 "A settled refund: refunded Rs $(M $i5 $curKey 'refunded') this month, gross still Rs $(M $i5 $curKey 'gross') -> net Rs $((M $i5 $curKey 'gross') - (M $i5 $curKey 'refunded'))" (
    ((M $i5 $curKey "refunded") -eq 300) -and ((M $i5 $curKey "refundCount") -eq 1) -and ((M $i5 $curKey "gross") -eq 900))

  # 7. an OPEN request is being asked back - the gold tile - and is not refunded
  Rpc (Api $learners[3].token) "cancel_booking" @{ p_enrollment_id = $e[3]; p_reason = "Changed my mind" } | Out-Null
  $i6 = Income-Of (Api $owner.token) $ta.id
  Check 7 "An open request: Rs $($i6.open) asked back ($($i6.openCount) row), refunded still Rs $(M $i6 $curKey 'refunded')" (
    ($i6.open -eq 300) -and ($i6.openCount -eq 1) -and ((M $i6 $curKey "refunded") -eq 300))

  # 8. a DECLINED refund is in neither total - a refusal is a decision, not
  #    money moving (the prototype counts only Paid, and Requested + Processing)
  $r0 = (Rpc (Api $learners[0].token) "cancel_booking" @{ p_enrollment_id = $e[0]; p_reason = "Too far" }).refund.id
  Rpc (Api $owner.token) "decide_refund" @{ p_refund_id = $r0; p_decision = "decline"; p_note = "Outside our policy" } | Out-Null
  $i7 = Income-Of (Api $owner.token) $ta.id
  Check 8 "A declined refund is in neither total (asked back Rs $($i7.open), refunded Rs $(M $i7 $curKey 'refunded'))" (
    ($i7.open -eq 300) -and ((M $i7 $curKey "refunded") -eq 300))

  # 9. nor is a FAILED one - approved, so briefly asked back, then the rail broke
  $r1 = (Rpc (Api $learners[1].token) "cancel_booking" @{ p_enrollment_id = $e[1]; p_reason = "Injury" }).refund.id
  Rpc (Api $owner.token) "decide_refund" @{ p_refund_id = $r1; p_decision = "approve" } | Out-Null
  $mid = Income-Of (Api $owner.token) $ta.id
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/refunds?id=eq.$r1" -Headers $svcH `
    -Body (@{ status = "failed" } | ConvertTo-Json) | Out-Null
  $i8 = Income-Of (Api $owner.token) $ta.id
  Check 9 "Approved = asked back (Rs $($mid.open)); failed = in neither total (asked back Rs $($i8.open), refunded Rs $(M $i8 $curKey 'refunded'))" (
    ($mid.open -eq 600) -and ($i8.open -eq 300) -and ((M $i8 $curKey "refunded") -eq 300))

  # 10. a rival studio's takings are its own: theirs never lands in ours, and
  #     their screen counts only theirs
  $rcls = Rpc (Api $rival.token) "create_class_with_session" @{ p_tenant_id = $tb.id; p_title = "Rival Class $stamp";
    p_style = "Bollywood"; p_level = "all"; p_room = $null; p_price_inr = 300; p_capacity = 10;
    p_status = "published"; p_starts_at = $tmr.ToString("yyyy-MM-ddT19:00:00zzz"); p_ends_at = $tmr.ToString("yyyy-MM-ddT20:00:00zzz") }
  $rsid = (Get-Rows $svcH "class_sessions?class_id=eq.$($rcls.id)&select=id")[0].id
  Buy-Seat $learners[5] $rsid "RIV$stamp" "upi" | Out-Null
  $i9 = Income-Of (Api $owner.token) $ta.id
  $rv = Income-Of (Api $rival.token) $tb.id
  Check 10 "Ours still Rs $(M $i9 $curKey 'gross'); the rival's own screen reads Rs $(M $rv $curKey 'gross') by $((M $rv $curKey 'methods').Keys -join ',')" (
    ((M $i9 $curKey "gross") -eq 900) -and ((M $rv $curKey "gross") -eq 300) -and ((M $rv $curKey "methods")["upi"] -eq 300))

  # 11. and neither the rival nor the public reads OUR rows at all
  $rivalSees = Income-Of (Api $rival.token) $ta.id
  $anonSees = Income-Of $anonH $ta.id
  Check 11 "Rival reads $($rivalSees.payRows)+$($rivalSees.refRows)+$($rivalSees.openCount) of our rows; the public $($anonSees.payRows)+$($anonSees.refRows)+$($anonSees.openCount)" (
    ($rivalSees.payRows -eq 0) -and ($rivalSees.refRows -eq 0) -and ($rivalSees.openCount -eq 0) -and
    ($anonSees.payRows -eq 0) -and ($anonSees.refRows -eq 0) -and ($anonSees.openCount -eq 0))

  # 12. THE HONEST CHECK: the owner-only screen is the prototype's presentation
  #     gate (S_earn is the studio's own page), NOT a security boundary. Step 9
  #     admits every member of the tenant to these rows, and this asserts that is
  #     still so - narrowing it is an RLS change to Step 9, not a UI change here.
  $trainerSees = Income-Of (Api $trainer.token) $ta.id
  Check 12 "A trainer still reads the takings directly (Rs $(M $trainerSees $curKey 'gross')) - the screen is a UI gate, not a wall" (
    ((M $trainerSees $curKey "gross") -eq 900) -and ($trainerSees.payRows -eq 4))

  # 13. THE WINDOW IS THE WINDOW: a payment older than the four months on screen
  #     is outside the read, and an unbounded read is what would have found it
  Buy-Seat $learners[6] $sid "OLD$stamp" "card" | Out-Null
  Backdate-Payment "OLD$stamp" ($firstOfMonth.AddMonths(-4).AddDays(3).ToString("yyyy-MM-ddTHH:mm:sszzz"))
  $i10 = Income-Of (Api $owner.token) $ta.id
  $unbounded = (Get-Rows (Api $owner.token) "payments?select=id&tenant_id=eq.$($ta.id)&status=in.(captured,refunded)&deleted_at=is.null").Count
  Check 13 "The window reads $($i10.payRows) payments; an unbounded read finds $unbounded; this month still Rs $(M $i10 $curKey 'gross')" (
    ($i10.payRows -eq 4) -and ($unbounded -eq 5) -and ((M $i10 $curKey "gross") -eq 900))
}
finally {
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers $svcH | Out-Null
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($tb.id)" -Headers $svcH | Out-Null
  foreach ($u in (@($owner, $trainer, $rival) + $learners)) {
    Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null
  }
  "   (cleanup: proof studios and throwaway accounts deleted)"
}

if ($pass) { "`nALL STUDIO INCOME CHECKS PASSED"; exit 0 } else { "`nSTUDIO INCOME CHECKS FAILED"; exit 1 }
