# Smoke proof for the Cashfree sandbox (rail swap, 28 Aug 2026): the keys in
# .env.local are accepted, an order in OUR grammar is created and read back
# with a payment session, its payments and refunds lists answer, a refund on
# an unpaid order is refused by Cashfree, and the Payouts pair is reported.
#
# This is the live sandbox, not a mock: the RPC-side money rules stay under
# scripts/rls-proof-payments.ps1 and the webhook route under
# e2e/paid-webhook.spec.ts. Run from the repo root:
#   powershell -File scripts/cashfree-sandbox-proof.ps1
$ErrorActionPreference = "Stop"
$PSDefaultParameterValues = @{ "Invoke-RestMethod:UserAgent" = "danceos-proof"; "Invoke-WebRequest:UserAgent" = "danceos-proof" }

$envFile = Join-Path $PSScriptRoot "..\.env.local"
$vars = @{}
Get-Content $envFile | Where-Object { $_ -match "^\s*[A-Z_]+\s*=" } | ForEach-Object {
  $name, $value = $_ -split "=", 2
  $vars[$name.Trim()] = $value.Trim()
}
$appId = $vars["CASHFREE_APP_ID"]; $secret = $vars["CASHFREE_SECRET_KEY"]
$payId = $vars["CASHFREE_PAYOUT_CLIENT_ID"]; $paySecret = $vars["CASHFREE_PAYOUT_CLIENT_SECRET"]
if (-not $appId -or -not $secret) { throw "CASHFREE_APP_ID / CASHFREE_SECRET_KEY missing from .env.local" }
$base = if ($vars["CASHFREE_ENV"] -eq "production") { "https://api.cashfree.com" } else { "https://sandbox.cashfree.com" }
if ($base -like "*api.cashfree.com*") { throw "refusing to run a proof against production" }

$H = @{ "x-client-id" = $appId; "x-client-secret" = $secret; "x-api-version" = "2025-01-01"; "Content-Type" = "application/json" }
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
$pass = $true
$stamp = Get-Date -Format "HHmmss"
# the same grammar lib/cashfree/api.ts uses: dos_ + a uuid without hyphens
$uuid = [guid]::NewGuid().ToString().Replace("-", "")
$orderId = "dos_$uuid"

# 1. create an order the way startCheckoutAction does
$created = Invoke-RestMethod -Method Post -Uri "$base/pg/orders" -Headers $H -Body (@{
  order_id = $orderId; order_amount = 300; order_currency = "INR"
  customer_details = @{ customer_id = "proof$stamp"; customer_phone = "9999999999"; customer_name = "Proof Learner" }
  order_note = "DanceOS sandbox proof"; order_tags = @{ session_id = "proof"; tenant_id = "proof" } } | ConvertTo-Json -Depth 5)
Check 1 "Order created: $($created.order_status), cf_order_id $($created.cf_order_id), payment session $(if ($created.payment_session_id) {'present'} else {'MISSING'})" (
  ($created.order_status -eq "ACTIVE") -and ($created.order_id -eq $orderId) -and ($created.payment_session_id))

# 2. read it back, and its (empty) payments and refunds
$fetched = Invoke-RestMethod -Method Get -Uri "$base/pg/orders/$orderId" -Headers $H
# PowerShell 5.1 reads a JSON [] as ONE item even through a null filter; count off the text
function Count-Json($content) { $t = ([string]$content).Trim(); if ($t -eq "[]" -or $t -eq "") { return 0 }; return @(($t | ConvertFrom-Json) | ForEach-Object { $_ }).Count }
$paymentsN = Count-Json (Invoke-WebRequest -Method Get -Uri "$base/pg/orders/$orderId/payments" -Headers $H -UseBasicParsing).Content
$refundsN = Count-Json (Invoke-WebRequest -Method Get -Uri "$base/pg/orders/$orderId/refunds" -Headers $H -UseBasicParsing).Content
Check 2 "Fetched: amount $($fetched.order_amount) $($fetched.order_currency); payments $paymentsN, refunds $refundsN" (
  ($fetched.order_amount -eq 300) -and ($paymentsN -eq 0) -and ($refundsN -eq 0))

# 3. a refund against an order nobody paid is refused by Cashfree itself
$noRefund = Fails { Invoke-RestMethod -Method Post -Uri "$base/pg/orders/$orderId/refunds" -Headers $H -Body (@{ refund_id = "rf_$uuid"; refund_amount = 300; refund_note = "proof" } | ConvertTo-Json) }
Check 3 "Refund on an unpaid order refused ($noRefund)" ($noRefund -ne "")

# 4. the wrong secret is turned away
$badH = @{ "x-client-id" = $appId; "x-client-secret" = "cfsk_ma_test_wrong"; "x-api-version" = "2025-01-01"; "Content-Type" = "application/json" }
$badAuth = Fails { Invoke-RestMethod -Method Get -Uri "$base/pg/orders/$orderId" -Headers $badH }
Check 4 "A wrong secret key is refused ($badAuth)" ($badAuth -ne "")

# 5. Payouts: the pair is reported, not asserted -- the sandbox answers 403 until
#    the caller's IPv4 is whitelisted (Developers > Payouts > Two-Factor
#    Authentication > IP Whitelist) or the public-key signature is used
if ($payId -and $paySecret) {
  $PH = @{ "x-client-id" = $payId; "x-client-secret" = $paySecret; "x-api-version" = "2024-01-01" }
  $pay = Fails { Invoke-RestMethod -Method Get -Uri "$base/payout/beneficiary?beneficiary_id=proof_none_$stamp" -Headers $PH }
  if ($pay -eq "") { "5. Payouts pair accepted and the sandbox answered -- OK" }
  elseif ($pay -match "not whitelisted") { "5. Payouts pair is VALID; sandbox answered '$pay' -- whitelist this machine's IPv4 in the dashboard to test payouts (informational)" }
  elseif ($pay -match "not found|does not exist") { "5. Payouts pair accepted (beneficiary lookup answered '$pay') -- OK" }
  else { Check 5 "Payouts pair refused ($pay)" $false }
} else { "5. Payouts keys absent -- skipped" }

if ($pass) { "ALL CASHFREE SANDBOX CHECKS PASSED" } else { "SOME CHECKS FAILED"; exit 1 }
