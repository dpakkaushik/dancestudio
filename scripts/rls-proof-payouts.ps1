# Proof for Step 13 (Earnings & payouts). The money questions this has to answer:
#   * only the OWNER sets what a session pays, and only the owner records money
#   * the AMOUNT is never the client's to state - it is counted from the rates
#   * a session can NEVER be paid twice
#   * changing a rate cannot rewrite what was already settled
#   * somebody taken off the team is still owed for the sessions they taught
#   * pay is private: not the public, not a rival, not even a teammate
#
# Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-payouts.ps1
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
# PS 5.1 unwraps a one-element array on its way through ConvertTo-Json, which
# would send a uuid where the function wants uuid[] - so the array is written out
function RpcRaw($headers, $fn, $json) {
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body $json
}
function IdsJson($ids) { return "[" + (($ids | ForEach-Object { '"' + $_ + '"' }) -join ",") + "]" }
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

# consent is proven in rls-proof-staff.ps1 (invite -> accept); here the seat is
# made directly with the service role so this script stays about the money
function Add-Member($tenantId, $userId, $memberRole, $byUser) {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/tenant_members" -Headers $svcH -Body (@{
    tenant_id = $tenantId; user_id = $userId; member_role = $memberRole
    created_by = $byUser; updated_by = $byUser } | ConvertTo-Json) | Out-Null
}

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$owner = New-EmailUser "payproof-owner-$stamp@example.com" "Owner $stamp" "studio"
$artist = New-EmailUser "payproof-artist-$stamp@example.com" "Nikhil $stamp" "trainer"
$trainer = New-EmailUser "payproof-trainer-$stamp@example.com" "Trainer $stamp" "trainer"
$ghost = New-EmailUser "payproof-ghost-$stamp@example.com" "Priya $stamp" "dancer"
$rival = New-EmailUser "payproof-rival-$stamp@example.com" "Rival $stamp" "studio"

$ta = Rpc (Api $owner.token) "create_tenant_with_owner" @{ p_name = "Pay Proof Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }
$tb = Rpc (Api $rival.token) "create_tenant_with_owner" @{ p_name = "Rival Studio $stamp"; p_type = "studio"; p_area = "Andheri"; p_city = "Mumbai" }
Add-Member $ta.id $artist.id "trainer" $owner.id
Add-Member $ta.id $trainer.id "trainer" $owner.id
Add-Member $ta.id $ghost.id "staff" $owner.id

try {
  $soon = (Get-Date).AddDays(3)
  $mk = { param($d, $h) $d.ToString("yyyy-MM-ddT$($h):00:00zzz") }

  # a class with a session, then two more sessions, all pushed into the past with
  # the service role: create_class_with_session quite rightly makes future ones
  $c1 = Rpc (Api $owner.token) "create_class_with_session" @{ p_tenant_id = $ta.id; p_title = "Pay Class $stamp";
    p_style = "Hip-Hop"; p_level = "beginner"; p_room = $null; p_price_inr = 0; p_capacity = 12;
    p_status = "published"; p_starts_at = (& $mk $soon 19); p_ends_at = (& $mk $soon 20) }
  $s1row = Get-Rows $svcH "class_sessions?class_id=eq.$($c1.id)&select=id"
  $s1 = $s1row[0].id
  $past1 = (Get-Date).AddDays(-9)
  $past2 = (Get-Date).AddDays(-2)
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/class_sessions?id=eq.$s1" -Headers $svcH -Body (@{
    starts_at = (& $mk $past1 19); ends_at = (& $mk $past1 20) } | ConvertTo-Json) | Out-Null
  $s2res = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/class_sessions" -Headers $svcH -Body (@{
    class_id = $c1.id; tenant_id = $ta.id; starts_at = (& $mk $past2 19); ends_at = (& $mk $past2 20)
    created_by = $owner.id; updated_by = $owner.id } | ConvertTo-Json)
  $s2 = $s2res[0].id

  # a second class whose session really has not happened yet
  $c2 = Rpc (Api $owner.token) "create_class_with_session" @{ p_tenant_id = $ta.id; p_title = "Future Class $stamp";
    p_style = "Contemporary"; p_level = "all"; p_room = $null; p_price_inr = 0; p_capacity = 10;
    p_status = "published"; p_starts_at = (& $mk $soon 17); p_ends_at = (& $mk $soon 18) }
  $s3 = (Get-Rows $svcH "class_sessions?class_id=eq.$($c2.id)&select=id")[0].id

  # and a class belonging to the rival studio
  $c3 = Rpc (Api $rival.token) "create_class_with_session" @{ p_tenant_id = $tb.id; p_title = "Rival Class $stamp";
    p_style = "Salsa"; p_level = "all"; p_room = $null; p_price_inr = 0; p_capacity = 10;
    p_status = "published"; p_starts_at = (& $mk $soon 18); p_ends_at = (& $mk $soon 19) }
  $s4 = (Get-Rows $svcH "class_sessions?class_id=eq.$($c3.id)&select=id")[0].id

  # 1. the owner asks somebody onto the class AT A RATE, and the rate is theirs to set
  $claim = Rpc (Api $owner.token) "claim_person" @{ p_class_id = $c1.id; p_user_id = $artist.id;
    p_kind = "artist"; p_can_attendance = $true; p_can_refunds = $false; p_pay_per_session_inr = 900 }
  Rpc (Api $artist.token) "respond_to_claim" @{ p_claim_id = $claim.id; p_accept = $true } | Out-Null
  Check 1 "Owner sets the rate on the ask (Rs $($claim.pay_per_session_inr), status $($claim.status))" (
    ($claim.pay_per_session_inr -eq 900) -and ($claim.status -eq "asked"))

  # 2. a trainer may put people on a class, but may not attach money to it
  $trainerRateBlocked = Expect-Fail {
    Rpc (Api $trainer.token) "claim_person" @{ p_class_id = $c1.id; p_user_id = $ghost.id;
      p_kind = "assistant"; p_can_attendance = $false; p_can_refunds = $false; p_pay_per_session_inr = 700 }
  }
  Check 2 "A trainer cannot attach a rate to an ask" $trainerRateBlocked

  # 3. nor change one afterwards
  $trainerSetPayBlocked = Expect-Fail {
    Rpc (Api $trainer.token) "set_claim_pay" @{ p_claim_id = $claim.id; p_pay_per_session_inr = 5000 }
  }
  Check 3 "A trainer cannot change what a session pays" $trainerSetPayBlocked

  # 4. money is never written directly - the table has no write policy at all
  $anonInsertBlocked = Expect-Fail {
    Invoke-RestMethod -Method Post -Uri "$base/rest/v1/payouts" -Headers $anonH -Body (@{
      tenant_id = $ta.id; user_id = $artist.id; amount_inr = 99999 } | ConvertTo-Json)
  }
  $ownerInsertBlocked = Expect-Fail {
    Invoke-RestMethod -Method Post -Uri "$base/rest/v1/payouts" -Headers (Api $owner.token) -Body (@{
      tenant_id = $ta.id; user_id = $artist.id; amount_inr = 99999 } | ConvertTo-Json)
  }
  Check 4 "No direct writes to payouts, not even by the owner" ($anonInsertBlocked -and $ownerInsertBlocked)

  # 5. recording money is the owner's act alone
  $trainerPayBlocked = Expect-Fail {
    RpcRaw (Api $trainer.token) "record_payout" "{""p_tenant_id"":""$($ta.id)"",""p_user_id"":""$($artist.id)"",""p_session_ids"":$(IdsJson @($s1))}"
  }
  Check 5 "A trainer cannot record a payout" $trainerPayBlocked

  # 6. you cannot pay for teaching that has not happened
  $futureBlocked = Expect-Fail {
    RpcRaw (Api $owner.token) "record_payout" "{""p_tenant_id"":""$($ta.id)"",""p_user_id"":""$($artist.id)"",""p_session_ids"":$(IdsJson @($s3))}"
  }
  Check 6 "A session that has not run yet cannot be paid" $futureBlocked

  # 7. the real thing: two past sessions at Rs 900, counted server-side
  $payout = RpcRaw (Api $owner.token) "record_payout" "{""p_tenant_id"":""$($ta.id)"",""p_user_id"":""$($artist.id)"",""p_session_ids"":$(IdsJson @($s1,$s2)),""p_method"":""upi"",""p_status"":""done"",""p_provider_ref"":""UTR-$stamp""}"
  $lines = Get-Rows $svcH "payout_lines?payout_id=eq.$($payout.id)&deleted_at=is.null&select=id,rate_inr"
  Check 7 "Owner records 2 sessions -> Rs $($payout.amount_inr) counted from the rates, $($lines.Count) lines" (
    ($payout.amount_inr -eq 1800) -and ($lines.Count -eq 2) -and ($lines[0].rate_inr -eq 900))

  # 8. THE ONE THAT MATTERS: the same session cannot be paid twice
  $doublePayBlocked = Expect-Fail {
    RpcRaw (Api $owner.token) "record_payout" "{""p_tenant_id"":""$($ta.id)"",""p_user_id"":""$($artist.id)"",""p_session_ids"":$(IdsJson @($s1))}"
  }
  Check 8 "The same session cannot be paid twice" $doublePayBlocked

  # 9. pay is private: the payee reads their own, and nobody else reads it
  $payeeSees = Get-Rows (Api $artist.token) "payouts?id=eq.$($payout.id)&select=id,amount_inr"
  $rivalSees = Get-Rows (Api $rival.token) "payouts?id=eq.$($payout.id)&select=id"
  $mateSees = Get-Rows (Api $trainer.token) "payouts?id=eq.$($payout.id)&select=id"
  $anonSees = Get-Rows $anonH "payouts?select=id"
  Check 9 "Payee reads their own ($($payeeSees.Count)); rival ($($rivalSees.Count)), teammate ($($mateSees.Count)) and public ($($anonSees.Count)) read none" (
    ($payeeSees.Count -eq 1) -and ($payeeSees[0].amount_inr -eq 1800) -and
    ($rivalSees.Count -eq 0) -and ($mateSees.Count -eq 0) -and ($anonSees.Count -eq 0))

  # 10. raising the rate later cannot rewrite what was already settled
  Rpc (Api $owner.token) "set_claim_pay" @{ p_claim_id = $claim.id; p_pay_per_session_inr = 1500 } | Out-Null
  $after = Get-Rows $svcH "payouts?id=eq.$($payout.id)&select=amount_inr"
  $lineAfter = Get-Rows $svcH "payout_lines?payout_id=eq.$($payout.id)&deleted_at=is.null&select=rate_inr&limit=1"
  Check 10 "Rate raised to Rs 1500; the settled payout stays Rs $($after[0].amount_inr) on a Rs $($lineAfter[0].rate_inr) line" (
    ($after[0].amount_inr -eq 1800) -and ($lineAfter[0].rate_inr -eq 900))

  # 11. voiding a mis-recorded payment releases its sessions and keeps the record
  Rpc (Api $owner.token) "void_payout" @{ p_payout_id = $payout.id } | Out-Null
  $voided = Get-Rows $svcH "payouts?id=eq.$($payout.id)&select=deleted_at"
  $liveLines = Get-Rows $svcH "payout_lines?payout_id=eq.$($payout.id)&deleted_at=is.null&select=id"
  $repay = RpcRaw (Api $owner.token) "record_payout" "{""p_tenant_id"":""$($ta.id)"",""p_user_id"":""$($artist.id)"",""p_session_ids"":$(IdsJson @($s1))}"
  Check 11 "Void keeps the record (deleted $([bool]$voided[0].deleted_at), $($liveLines.Count) live lines) and the session is payable again (Rs $($repay.amount_inr) at the new rate)" (
    ($null -ne $voided[0].deleted_at) -and ($liveLines.Count -eq 0) -and ($repay.amount_inr -eq 1500))

  # 12. taken off the team, still owed for what they taught
  $gclaim = Rpc (Api $owner.token) "claim_person" @{ p_class_id = $c1.id; p_user_id = $ghost.id;
    p_kind = "assistant"; p_can_attendance = $true; p_can_refunds = $false; p_pay_per_session_inr = 500 }
  Rpc (Api $ghost.token) "respond_to_claim" @{ p_claim_id = $gclaim.id; p_accept = $true } | Out-Null
  Rpc (Api $owner.token) "remove_tenant_member" @{ p_tenant_id = $ta.id; p_user_id = $ghost.id } | Out-Null
  $ghostClaimGone = Get-Rows $svcH "class_claims?id=eq.$($gclaim.id)&deleted_at=is.null&select=id"
  $ghostPay = RpcRaw (Api $owner.token) "record_payout" "{""p_tenant_id"":""$($ta.id)"",""p_user_id"":""$($ghost.id)"",""p_session_ids"":$(IdsJson @($s2))}"
  Check 12 "Removed from the team (claim closed: $($ghostClaimGone.Count) live) and still paid Rs $($ghostPay.amount_inr) for the session they taught" (
    ($ghostClaimGone.Count -eq 0) -and ($ghostPay.amount_inr -eq 500))

  # 13. a payout has to be worth something
  $zclaim = Rpc (Api $owner.token) "claim_person" @{ p_class_id = $c1.id; p_user_id = $trainer.id;
    p_kind = "assistant"; p_can_attendance = $false; p_can_refunds = $false; p_pay_per_session_inr = 0 }
  Rpc (Api $trainer.token) "respond_to_claim" @{ p_claim_id = $zclaim.id; p_accept = $true } | Out-Null
  $zeroBlocked = Expect-Fail {
    RpcRaw (Api $owner.token) "record_payout" "{""p_tenant_id"":""$($ta.id)"",""p_user_id"":""$($trainer.id)"",""p_session_ids"":$(IdsJson @($s1))}"
  }
  Check 13 "Sessions that pay nothing cannot become a payout" $zeroBlocked

  # 14. and you cannot settle another studio's session out of your own ledger
  $crossBlocked = Expect-Fail {
    RpcRaw (Api $owner.token) "record_payout" "{""p_tenant_id"":""$($ta.id)"",""p_user_id"":""$($artist.id)"",""p_session_ids"":$(IdsJson @($s4))}"
  }
  Check 14 "A rival studio's session cannot be paid from your ledger" $crossBlocked
}
finally {
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers $svcH | Out-Null
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($tb.id)" -Headers $svcH | Out-Null
  foreach ($u in @($owner, $artist, $trainer, $ghost, $rival)) {
    Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null
  }
  "   (cleanup: proof studios and throwaway accounts deleted)"
}

if ($pass) { "`nALL PAYOUT CHECKS PASSED"; exit 0 } else { "`nPAYOUT CHECKS FAILED"; exit 1 }
