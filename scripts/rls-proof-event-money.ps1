# Proof for EVENT MONEY (17 Sep 2026): a priced ticket or entry pays through
# the Cashfree rail the way a class seat does. A priced booking is written as
# pending_payment and HOLDS NO SEAT; the order opens against it; the capture -
# the same apply_captured_payment the webhook lands on - books it under the
# event lock with the tier re-checked, and ledgers a refund instead of
# over-selling. Cancelling a paid ticket follows the class rule (48 h), and the
# organiser - the host's OWNER - is who settles a refund inside the window.
# Then the organization's own figures: my_org_stats answers the owner and
# nobody else.
#
# The rail's HTTP half (the signed webhook) is played by e2e/paid-webhook.spec.ts;
# this proof drives the RPCs directly, as the people involved and as the service
# role standing in for the webhook.
#
# Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-event-money.ps1
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
  return ,@(($res.Content | ConvertFrom-Json) | Where-Object { $null -ne $_ })
}
# an RPC that returns ROWS, counted off the raw body: PowerShell 5.1's
# Invoke-RestMethod turns an empty JSON [] into one item, so a "0 rows" check
# written on it passes vacuously - the quirk CLAUDE.md records twice already
function Rpc-Rows($headers, $fn, $body) {
  $res = Invoke-WebRequest -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body ($body | ConvertTo-Json -Depth 8) -UseBasicParsing
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
  # 26 Sep 2026: the organization LOGIN is retired - every account here is a person
  $tok = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $anonH -Body (@{
    email = $email; password = "Proof-passw0rd!" } | ConvertTo-Json)
  return [pscustomobject]@{ id = $u.id; email = $email; token = $tok.access_token }
}
$in10 = (Get-Date).AddDays(10).ToString("yyyy-MM-dd")
$today = (Get-Date).ToString("yyyy-MM-dd")
function Ev($title, $startDate, $startTime, $tiers, $entries) {
  return @{ category = "battle"; title = $title; style = "All styles"; start_date = $startDate; end_date = $startDate; start_time = $startTime
    venue = "Proof Hall"; address = "Kothrud"; city = "Pune"; maps_url = "https://maps.google.com/?q=Proof+Hall"; about = "Proof event"
    entry_format = $(if ($entries.Count -eq 1) { $entries[0].format } elseif ($entries.Count -eq 0) { "none" } else { "all" })
    bracket = 16; rounds = 0; prizes = @(5000, 2000, 1000); tickets_on = $true; entry_tiers = $entries; ticket_tiers = $tiers }
}
function Book($user, $eventId, $tierId, $qty) {
  return Rpc (Api $user.token) "book_event" @{ p_event_id = $eventId; p_kind = "spectator"; p_ticket_tier_id = $tierId; p_qty = $qty }
}
# the app's own grammar for a provider order id (lib/cashfree/api.ts providerOrderIdFor)
function ProviderId($orderId) { return "dos_" + ([string]$orderId).Replace("-", "") }
# the whole checkout up to the money: a pending booking, its order, the rail's id bound
function Checkout($user, $eventId, $tierId, $qty) {
  $b = Book $user $eventId $tierId $qty
  $o = Rpc (Api $user.token) "create_event_payment_order" @{ p_event_booking_id = $b.id }
  Rpc (Api $user.token) "attach_provider_order" @{ p_order_id = $o.id; p_provider_order_id = (ProviderId $o.id) } | Out-Null
  return [pscustomobject]@{ booking = $b; order = $o; pid = (ProviderId $o.id) }
}
# the webhook, played by the service role: what Cashfree's PAYMENT_SUCCESS lands on.
# ($pid is PowerShell's own read-only process id - a parameter may not wear that name.)
function Capture($providerOrderId, $paymentId, $paise) {
  return Rpc $svcH "apply_captured_payment" @{ p_provider_order_id = $providerOrderId; p_provider_payment_id = $paymentId; p_amount_paise = $paise; p_method = "upi" }
}
function TierCount($eventId, $tierId) {
  $c = @((Rpc $anonH "event_counts" @{ p_event_ids = @($eventId) }) | Where-Object { $_.ticket_tier_id -eq $tierId })
  if ($c.Count) { return [int]$c[0].n } else { return 0 }
}
$EVSEL = "select=id,title,status,share_slug,event_ticket_tiers(id,name,price_inr,capacity)"
$BKSEL = "select=id,event_id,user_id,kind,ticket_tier_id,qty,amount_inr,status"

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$ownerA = New-EmailUser "em-ownera-$stamp@example.com" "Money Owner $stamp" "user"
$ownerB = New-EmailUser "em-ownerb-$stamp@example.com" "Rival Owner $stamp" "user"
$l1 = New-EmailUser "em-l1-$stamp@example.com" "Payer One $stamp" "user"
$l2 = New-EmailUser "em-l2-$stamp@example.com" "Payer Two $stamp" "user"
$l3 = New-EmailUser "em-l3-$stamp@example.com" "Payer Three $stamp" "user"
# 26 Sep 2026: an organization is a BUSINESS its owner opens (the login is retired). An event needs
# its OWN GST number, and the public books its events only while its own mandate is live - so A's
# gets all three; B's is the rival, a private organization with a number and no mandate.
$orgA = [string](New-Org $ownerA.token "Money Org $stamp" "Pune").id
$orgB = [string](New-Org $ownerB.token "Rival Org $stamp" "Pune").id
Verify-Org-Gst $ownerA.token $orgA "EVM$($stamp.Substring(1))" | Out-Null
Verify-Org-Gst $ownerB.token $orgB "EVN$($stamp.Substring(1))" | Out-Null
Subscribe-Org $orgA

try {
  # the event, ten days out: a Rs 250 tier with TWO seats, and a free one
  $e1 = Rpc (Api $ownerA.token) "save_event" @{ p_business_id = $orgA; p_event_id = $null; p_event = (Ev "Money Battle $stamp" $in10 "18:00" @(
    @{ name = "Paid"; price_inr = 250; capacity = 2; sort = 0 },
    @{ name = "Free"; price_inr = 0; capacity = 5; sort = 1 }) @(@{ format = "solo"; fee_inr = 0; capacity = 10 })) }
  Rpc (Api $ownerA.token) "publish_event" @{ p_event_id = $e1 } | Out-Null
  $e1Row = (Get-Rows $anonH "events?$EVSEL&id=eq.$e1")[0]
  $paid = @($e1Row.event_ticket_tiers | Where-Object { $_.name -eq "Paid" })[0]

  # 1. A PRICED TICKET IS A PENDING BOOKING THAT HOLDS NO SEAT
  $b1 = Book $l1 $e1 $paid.id 1
  $mine1 = Get-Rows (Api $l1.token) "event_bookings?$BKSEL&id=eq.$($b1.id)"
  $told0 = Get-Rows $svcH "notifications?user_id=eq.$($ownerA.id)&select=title&title=ilike.*booked*"
  Check 1 "L1 books the Rs 250 tier: status $($b1.status), Rs $($b1.amount_inr); public count for the tier $(TierCount $e1 $paid.id); L1 reads own pending row ($($mine1.Count)); organiser told nothing yet ($($told0.Count))" (
    ($b1.status -eq "pending_payment") -and ($b1.amount_inr -eq 250) -and ((TierCount $e1 $paid.id) -eq 0) -and ($mine1.Count -eq 1) -and ($told0.Count -eq 0))

  # 2. THE ORDER OPENS AGAINST IT, AMOUNT FROM THE BOOKING; somebody else's booking cannot be paid for
  $o1 = Rpc (Api $l1.token) "create_event_payment_order" @{ p_event_booking_id = $b1.id }
  $l2OnL1 = Fails { Rpc (Api $l2.token) "create_event_payment_order" @{ p_event_booking_id = $b1.id } }
  Check 2 "Order: Rs $($o1.amount_inr), event set ($($o1.event_id -eq $e1)), class null ($($null -eq $o1.class_id)), host is the organization ($($o1.business_id -eq $orgA)), status $($o1.status); L2 paying for L1's booking refused ($l2OnL1)" (
    ($o1.amount_inr -eq 250) -and ($o1.event_id -eq $e1) -and ($null -eq $o1.class_id) -and ($o1.business_id -eq $orgA) -and ($o1.status -eq "created") -and ($l2OnL1 -match "booking not found"))

  # 3. THE RAIL'S ID IS BOUND; ONLY THE SERVICE ROLE APPLIES A CAPTURE
  $pid1 = ProviderId $o1.id
  Rpc (Api $l1.token) "attach_provider_order" @{ p_order_id = $o1.id; p_provider_order_id = $pid1 } | Out-Null
  $anonApply = Fails { Rpc $anonH "apply_captured_payment" @{ p_provider_order_id = $pid1; p_provider_payment_id = "pay_NOPE$stamp"; p_amount_paise = 25000; p_method = "upi" } }
  $userApply = Fails { Rpc (Api $l1.token) "apply_captured_payment" @{ p_provider_order_id = $pid1; p_provider_payment_id = "pay_NOPE$stamp"; p_amount_paise = 25000; p_method = "upi" } }
  Check 3 "Anon cannot apply a capture ($($anonApply -ne '')); the payer cannot either ($($userApply -ne ''))" (($anonApply -ne "") -and ($userApply -ne ""))

  # 4. THE CAPTURE BOOKS THE SEAT: the booking flips, the order is paid, the payment is on the host's ledger, the public count moves, the organiser is told
  $cap1 = Capture $pid1 "pay_EM1$stamp" 25000
  $b1Now = (Get-Rows (Api $l1.token) "event_bookings?$BKSEL&id=eq.$($b1.id)")[0]
  $o1Now = (Get-Rows (Api $l1.token) "orders?id=eq.$($o1.id)&select=status")[0]
  $pay1 = Get-Rows (Api $l1.token) "payments?order_id=eq.$($o1.id)&select=amount_inr,status,business_id,kind"
  $told1 = Get-Rows $svcH "notifications?user_id=eq.$($ownerA.id)&select=title&title=ilike.*booked*"
  Check 4 "Capture: outcome $($cap1.outcome) ($($cap1.kind)); booking $($b1Now.status); order $($o1Now.status); payment Rs $($pay1[0].amount_inr) $($pay1[0].status) on the host ($($pay1[0].business_id -eq $orgA)); public count $(TierCount $e1 $paid.id); organiser told '$($told1[0].title)'" (
    ($cap1.outcome -eq "enrolled") -and ($cap1.kind -eq "event") -and ($b1Now.status -eq "booked") -and ($o1Now.status -eq "paid") -and ($pay1.Count -eq 1) -and ($pay1[0].amount_inr -eq 250) -and ($pay1[0].status -eq "captured") -and ($pay1[0].business_id -eq $orgA) -and ((TierCount $e1 $paid.id) -eq 1) -and ($told1.Count -eq 1) -and ($told1[0].title -match "250"))

  # 5. A REPLAY IS A NO-OP
  $cap1b = Capture $pid1 "pay_EM1$stamp" 25000
  $pay1b = Get-Rows (Api $l1.token) "payments?order_id=eq.$($o1.id)&select=id"
  Check 5 "Replaying the same payment: $($cap1b.outcome); still $($pay1b.Count) payment row" (($cap1b.outcome -eq "duplicate") -and ($pay1b.Count -eq 1))

  # 6. THE WRONG AMOUNT NEVER BECOMES A SEAT: refund ledgered, booking stays pending, count unmoved
  $c2 = Checkout $l2 $e1 $paid.id 1
  $capWrong = Capture $c2.pid "pay_EM2$stamp" 10000
  $b2Now = (Get-Rows (Api $l2.token) "event_bookings?$BKSEL&id=eq.$($c2.booking.id)")[0]
  $rf2 = Get-Rows (Api $l2.token) "refunds?order_id=eq.$($c2.order.id)&select=status,reason,amount_inr"
  $o2Now = (Get-Rows (Api $l2.token) "orders?id=eq.$($c2.order.id)&select=status")[0]
  Check 6 "Rs 100 lands on a Rs 250 order: $($capWrong.outcome); booking $($b2Now.status); refund $($rf2[0].status) ('$($rf2[0].reason)', Rs $($rf2[0].amount_inr)); order $($o2Now.status); count $(TierCount $e1 $paid.id)" (
    ($capWrong.outcome -eq "refund_pending") -and ($b2Now.status -eq "pending_payment") -and ($rf2.Count -eq 1) -and ($rf2[0].status -eq "pending") -and ($rf2[0].reason -match "did not match") -and ($rf2[0].amount_inr -eq 100) -and ($o2Now.status -eq "refund_pending") -and ((TierCount $e1 $paid.id) -eq 1))

  # 7. THE TIER FILLS BETWEEN CHECKOUT AND CAPTURE: the later money is refunded, not seated
  $c3 = Checkout $l3 $e1 $paid.id 1
  $c2b = Checkout $l2 $e1 $paid.id 1
  $cap3 = Capture $c3.pid "pay_EM3$stamp" 25000
  $capLate = Capture $c2b.pid "pay_EM4$stamp" 25000
  $b2bNow = (Get-Rows (Api $l2.token) "event_bookings?$BKSEL&id=eq.$($c2b.booking.id)")[0]
  $rfLate = Get-Rows (Api $l2.token) "refunds?order_id=eq.$($c2b.order.id)&select=status,reason"
  $oldPending = (Get-Rows (Api $l2.token) "event_bookings?$BKSEL&id=eq.$($c2.booking.id)")[0]
  Check 7 "L3 takes the last seat ($($cap3.outcome)); L2's money lands on a full tier: $($capLate.outcome) ('$($rfLate[0].reason)'), booking $($b2bNow.status); count $(TierCount $e1 $paid.id) of 2; L2's earlier abandoned attempt was closed ($($oldPending.status))" (
    ($cap3.outcome -eq "enrolled") -and ($capLate.outcome -eq "refund_pending") -and ($rfLate[0].reason -match "filled up") -and ($b2bNow.status -eq "pending_payment") -and ((TierCount $e1 $paid.id) -eq 2) -and ($oldPending.status -eq "cancelled"))

  # 8. CANCELLING A PAID TICKET 48 H OUT: automatic refund, the seat back on sale, the payer reads their refund
  $cx = Rpc (Api $l1.token) "cancel_event_booking" @{ p_booking_id = $b1.id; p_reason = "Cannot make it" }
  $o1After = (Get-Rows (Api $l1.token) "orders?id=eq.$($o1.id)&select=status")[0]
  $rf1 = Get-Rows (Api $l1.token) "refunds?order_id=eq.$($o1.id)&select=status,amount_inr,reason"
  $rivalRf = Get-Rows (Api $ownerB.token) "refunds?business_id=eq.$orgA&select=id"
  $hostRf = Get-Rows (Api $ownerA.token) "refunds?business_id=eq.$orgA&select=id"
  Check 8 "Cancel ten days out: refund $($cx.refund.status) Rs $($cx.refund.amount_inr) with the rail's ids ($($null -ne $cx.refund.provider_order_id)); order $($o1After.status); L1 reads it ($($rf1.Count), '$($rf1[0].reason)'); count back to $(TierCount $e1 $paid.id); the host reads $($hostRf.Count) refunds, a rival $($rivalRf.Count)" (
    ($cx.status -eq "cancelled") -and ($cx.refund.status -eq "pending") -and ($cx.refund.amount_inr -eq 250) -and ($cx.refund.provider_order_id -eq $pid1) -and ($o1After.status -eq "refund_pending") -and ($rf1.Count -eq 1) -and ($rf1[0].reason -eq "Cannot make it") -and ((TierCount $e1 $paid.id) -eq 1) -and ($hostRf.Count -ge 3) -and ($rivalRf.Count -eq 0))

  # 9. INSIDE 48 H THE ORGANISER DECIDES - and only the organiser: an event starting tonight
  # (a battle must open a way in or event_blockers refuses to publish it - the solo tier is that)
  $e2 = Rpc (Api $ownerA.token) "save_event" @{ p_business_id = $orgA; p_event_id = $null; p_event = (Ev "Tonight Battle $stamp" $today "23:59" @(@{ name = "Door"; price_inr = 300; capacity = 5; sort = 0 }) @(@{ format = "solo"; fee_inr = 0; capacity = 10 })) }
  Rpc (Api $ownerA.token) "publish_event" @{ p_event_id = $e2 } | Out-Null
  $door = @((Get-Rows $anonH "events?$EVSEL&id=eq.$e2")[0].event_ticket_tiers)[0]
  $c5 = Checkout $l1 $e2 $door.id 1
  Capture $c5.pid "pay_EM5$stamp" 30000 | Out-Null
  $cxIn = Rpc (Api $l1.token) "cancel_event_booking" @{ p_booking_id = $c5.booking.id; p_reason = "Late change" }
  $o5Now = (Get-Rows (Api $l1.token) "orders?id=eq.$($c5.order.id)&select=status")[0]
  $strangerDecides = Fails { Rpc (Api $l2.token) "decide_refund" @{ p_refund_id = $cxIn.refund.id; p_decision = "approve"; p_note = $null } }
  $rivalDecides = Fails { Rpc (Api $ownerB.token) "decide_refund" @{ p_refund_id = $cxIn.refund.id; p_decision = "approve"; p_note = $null } }
  $approved = Rpc (Api $ownerA.token) "decide_refund" @{ p_refund_id = $cxIn.refund.id; p_decision = "approve"; p_note = "Fair enough" }
  $settled = Rpc (Api $ownerA.token) "settle_refund_offline" @{ p_refund_id = $cxIn.refund.id; p_note = "Paid back at the door" }
  $o5After = (Get-Rows (Api $l1.token) "orders?id=eq.$($c5.order.id)&select=status")[0]
  Check 9 "Cancel inside the window: refund $($cxIn.refund.status), order stays $($o5Now.status); a stranger refused ($strangerDecides); a rival organization refused ($rivalDecides); the host approves -> $($approved.status) with the rail's order id ($($approved.provider_order_id -eq $c5.pid)); settled at the door -> $($settled.status), order $($o5After.status)" (
    ($cxIn.refund.status -eq "requested") -and ($o5Now.status -eq "paid") -and ($strangerDecides -match "only the owner") -and ($rivalDecides -match "only the owner") -and ($approved.status -eq "pending") -and ($approved.provider_order_id -eq $c5.pid) -and ($settled.status -eq "processed") -and ($settled.settled_offline -eq $true) -and ($o5After.status -eq "refunded"))

  # 10. WHO READS THE MONEY: the host every payment on its row, the payer their own, a rival and the public nothing
  $hostPay = Get-Rows (Api $ownerA.token) "payments?business_id=eq.$orgA&select=amount_inr"
  $l1Pay = Get-Rows (Api $l1.token) "payments?user_id=eq.$($l1.id)&select=amount_inr"
  $rivalPay = Get-Rows (Api $ownerB.token) "payments?business_id=eq.$orgA&select=id"
  $anonPay = Get-Rows $anonH "payments?business_id=eq.$orgA&select=id"
  $hostSum = ($hostPay | Measure-Object -Property amount_inr -Sum).Sum
  Check 10 "The host reads $($hostPay.Count) payments (Rs $hostSum); L1 reads $($l1Pay.Count) of their own; a rival $($rivalPay.Count); the public $($anonPay.Count)" (
    ($hostPay.Count -eq 5) -and ($hostSum -eq 1150) -and ($l1Pay.Count -eq 2) -and ($rivalPay.Count -eq 0) -and ($anonPay.Count -eq 0))

  # 11. THE ORGANIZATION'S FIGURES: the owner's rows carry the event money; a person who owns nothing
  #     and a rival see none of it (the rival owns their own org business, so their list is not empty)
  $statsA = Rpc-Rows (Api $ownerA.token) "my_org_stats" @{}
  $hostRow = @($statsA | Where-Object { $_.business_id -eq $orgA })[0]
  $statsL1 = Rpc-Rows (Api $l1.token) "my_org_stats" @{}
  $statsB = Rpc-Rows (Api $ownerB.token) "my_org_stats" @{}
  $leak = @($statsB | Where-Object { $_.business_id -eq $orgA })
  Check 11 "my_org_stats for the host row: type $($hostRow.type), $($hostRow.events) events, $($hostRow.tickets_sold) ticket sold, gross Rs $($hostRow.gross_inr), refunded Rs $($hostRow.refunded_inr); a person gets $($statsL1.Count) rows; the rival's rows include the host $($leak.Count) times" (
    ($hostRow.type -eq "org") -and ([int]$hostRow.events -eq 2) -and ([int]$hostRow.tickets_sold -eq 1) -and ([int]$hostRow.gross_inr -eq 1150) -and ([int]$hostRow.refunded_inr -eq 300) -and ($statsL1.Count -eq 0) -and ($leak.Count -eq 0) -and ($statsB.Count -ge 1))

  # 12. NO DIRECT WRITES: a payer cannot flip their own pending booking to booked, nor insert an order
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/event_bookings?id=eq.$($c2b.booking.id)" -Headers (Api $l2.token) -Body (@{ status = "booked" } | ConvertTo-Json) | Out-Null
  $stillPending = (Get-Rows (Api $l2.token) "event_bookings?$BKSEL&id=eq.$($c2b.booking.id)")[0]
  $directOrder = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/orders" -Headers (Api $l2.token) -Body (@{ business_id = $orgA; user_id = $l2.id; event_id = $e1; event_booking_id = $c2b.booking.id; amount_inr = 1 } | ConvertTo-Json) }
  Check 12 "A PATCH to booked changes nothing ($($stillPending.status)); a direct order insert is refused ($($directOrder -ne ''))" (
    ($stillPending.status -eq "pending_payment") -and ($directOrder -ne ""))
}
finally {
  # the org businesses cascade events -> tiers -> bookings -> orders -> payments, and go BEFORE their owners; users cascade profiles
  foreach ($t in @($orgA, $orgB)) {
    try { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/businesses?id=eq.$t" -Headers $svcH | Out-Null } catch {}
  }
  foreach ($u in @($ownerA, $ownerB, $l1, $l2, $l3)) {
    try { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null } catch {}
  }
  "   (cleanup: the two organizations, their events and the throwaway people deleted)"
}

if ($pass) { "ALL EVENT MONEY CHECKS PASSED" } else { "SOME CHECKS FAILED"; exit 1 }
