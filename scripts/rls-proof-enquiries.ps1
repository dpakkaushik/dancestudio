# Proof for Step 18 - the Inbox's enquiries: who may send, who may read, who may
# quote, who may answer, who may record money, and what a quote's history keeps.
#
# The prototype's own correction is the design under test (4939-4952): a quote
# is a conversation, not a field - revising SUPERSEDES rather than erases, the
# person quoted is the one who accepts, and the stage is DERIVED from the live
# quote rather than typed twice.
#
# Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-enquiries.ps1
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
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body ($body | ConvertTo-Json -Depth 6)
}
function Get-Rows($headers, $path) {
  $res = Invoke-WebRequest -Method Get -Uri "$base/rest/v1/$path" -Headers $headers -UseBasicParsing
  return ,@(($res.Content | ConvertFrom-Json) | Where-Object { $null -ne $_ })
}
function Fails($script) {
  try { & $script | Out-Null; return "" }
  catch {
    $msg = $_.Exception.Message
    # PowerShell 5.1 does not always surface the response body in ErrorDetails;
    # read the stream so the refusal's own words are what gets asserted
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
function Add-Member($tenantId, $userId, $memberRole, $byUser) {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/tenant_members" -Headers $svcH -Body (@{
    tenant_id = $tenantId; user_id = $userId; member_role = $memberRole
    created_by = $byUser; updated_by = $byUser } | ConvertTo-Json) | Out-Null
}
$in10 = (Get-Date).AddDays(10).ToString("yyyy-MM-dd")
function Send-Enq($user, $tenantId, $type) {
  return Rpc (Api $user.token) "send_enquiry" @{ p_tenant_id = $tenantId; p_type_key = $type
    p_fields = @(@("Enquiry", "Proof"), @("Type of event", "Sangeet"), @("Number of performances", "3"))
    p_dates = @($in10); p_where = "Kothrud, Pune"; p_message = "Proof enquiry"; p_mobile = "+91 98765 43210" }
}
# the repository's read, verbatim in shape (repositories/enquiries.ts)
$SEL = "select=id,tenant_id,from_user_id,type_key,status,enquiry_quotes(id,n,cost_inr,advance_pct,advance_inr,status,advance_paid_at,full_paid_at)"

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$ownerA = New-EmailUser "enq-ownera-$stamp@example.com" "Owner A $stamp" "studio"
$staffA = New-EmailUser "enq-staffa-$stamp@example.com" "Staff A $stamp" "dancer"
$ownerB = New-EmailUser "enq-ownerb-$stamp@example.com" "Artist B $stamp" "trainer"
$l1 = New-EmailUser "enq-l1-$stamp@example.com" "Sender One $stamp" "dancer"
$l2 = New-EmailUser "enq-l2-$stamp@example.com" "Bystander $stamp" "dancer"

$ta = Rpc (Api $ownerA.token) "create_tenant_with_owner" @{ p_name = "Enquiry Proof Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }
$tb = Rpc (Api $ownerB.token) "create_tenant_with_owner" @{ p_name = "Artist Business $stamp"; p_type = "trainer_business"; p_area = "Baner"; p_city = "Pune" }
$tc = Rpc (Api $ownerA.token) "create_tenant_with_owner" @{ p_name = "Private Studio $stamp"; p_type = "studio"; p_area = "Andheri"; p_city = "Mumbai" }
Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenants?id=eq.$($tc.id)" -Headers $svcH -Body (@{ visibility = "unlisted" } | ConvertTo-Json) | Out-Null
Add-Member $ta.id $staffA.id "staff" $ownerA.id

try {
  # 1. a person sends a celebration enquiry to the studio: filed New, with its fields
  $e1 = Send-Enq $l1 $ta.id "celebration"
  Check 1 "L1 sends to the studio: status $($e1.status), $(@($e1.fields).Count) fields, $(@($e1.dates).Count) date" (
    ($e1.status -eq "new") -and (@($e1.fields).Count -eq 3) -and (@($e1.dates).Count -eq 1))

  # 2. judging is a person's job: refused for a studio, accepted for an artist business
  $judgeStudio = Fails { Send-Enq $l1 $ta.id "judge" }
  $e2 = Send-Enq $l1 $tb.id "judge"
  Check 2 "Invite as Judge: studio refused ($judgeStudio); artist business accepted ($($e2.type_key))" (
    ($judgeStudio -match "artist") -and ($e2.type_key -eq "judge"))

  # 3. you do not enquire of yourself, and a private business takes no enquiries
  $selfEnq = Fails { Send-Enq $ownerA $ta.id "corporate" }
  $privEnq = Fails { Send-Enq $l1 $tc.id "corporate" }
  Check 3 "Own business refused ($selfEnq); private business refused ($privEnq)" (
    ($selfEnq -match "belong") -and ($privEnq -match "not open"))

  # 4. READS ARE THE TWO ENDS: the sender reads theirs, the studio's owner AND staff
  #    read the studio's, the artist reads the artist's, a bystander and the public none
  $l1Rows = Get-Rows (Api $l1.token) "enquiries?$SEL&deleted_at=is.null"
  $ownerRows = Get-Rows (Api $ownerA.token) "enquiries?$SEL&tenant_id=eq.$($ta.id)"
  $staffRows = Get-Rows (Api $staffA.token) "enquiries?$SEL&tenant_id=eq.$($ta.id)"
  $artistRows = Get-Rows (Api $ownerB.token) "enquiries?$SEL"
  $l2Rows = Get-Rows (Api $l2.token) "enquiries?$SEL"
  $anonRows = Get-Rows $anonH "enquiries?$SEL"
  Check 4 "Sender reads $($l1Rows.Count); studio owner $($ownerRows.Count), staff $($staffRows.Count); artist $($artistRows.Count); bystander $($l2Rows.Count); public $($anonRows.Count)" (
    ($l1Rows.Count -eq 2) -and ($ownerRows.Count -eq 1) -and ($staffRows.Count -eq 1) -and ($artistRows.Count -eq 1) -and ($l2Rows.Count -eq 0) -and ($anonRows.Count -eq 0))

  # 5. no direct writes
  $direct = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/enquiries" -Headers (Api $l2.token) -Body (@{ tenant_id = $ta.id; from_user_id = $l2.id; type_key = "corporate"; message = "x" } | ConvertTo-Json) }
  Check 5 "A direct insert into enquiries is refused ($direct)" ($direct -ne "")

  # 6. STAFF QUOTE (the desk is the studio's CRM); the sender cannot quote their own ask
  $q1 = Rpc (Api $staffA.token) "send_enquiry_quote" @{ p_enquiry_id = $e1.id; p_cost_inr = 45000; p_advance_pct = 30 }
  $senderQuotes = Fails { Rpc (Api $l1.token) "send_enquiry_quote" @{ p_enquiry_id = $e1.id; p_cost_inr = 1; p_advance_pct = 0 } }
  $e1b = (Get-Rows (Api $ownerA.token) "enquiries?$SEL&id=eq.$($e1.id)")[0]
  Check 6 "Staff quote #$($q1.n): Rs $($q1.cost_inr), advance Rs $($q1.advance_inr) ($($q1.advance_pct)%); enquiry now $($e1b.status); sender quoting refused ($senderQuotes)" (
    ($q1.n -eq 1) -and ($q1.advance_inr -eq 13500) -and ($q1.status -eq "sent") -and ($e1b.status -eq "quoted") -and ($senderQuotes -match "business"))

  # 7. A REVISION SUPERSEDES, IT DOES NOT ERASE: #2 is live, #1 is kept as superseded
  $q2 = Rpc (Api $ownerA.token) "send_enquiry_quote" @{ p_enquiry_id = $e1.id; p_cost_inr = 50000; p_advance_pct = 50 }
  $hist = @((Get-Rows (Api $l1.token) "enquiry_quotes?select=n,status,cost_inr&enquiry_id=eq.$($e1.id)&order=n") | Where-Object { $null -ne $_ })
  Check 7 "Revised: #$($q2.n) Rs $($q2.cost_inr) live; history $(($hist | ForEach-Object { "#$($_.n)=$($_.status)" }) -join ', ')" (
    ($q2.n -eq 2) -and ($hist.Count -eq 2) -and ($hist[0].status -eq "superseded") -and ($hist[1].status -eq "sent"))

  # 8. ONLY THE PERSON QUOTED ANSWERS: the studio cannot accept its own price, a
  #    superseded quote cannot be answered, the sender accepts the live one
  $ownerAccepts = Fails { Rpc (Api $ownerA.token) "answer_enquiry_quote" @{ p_quote_id = $q2.id; p_accept = $true } }
  $deadAccept = Fails { Rpc (Api $l1.token) "answer_enquiry_quote" @{ p_quote_id = $q1.id; p_accept = $true } }
  $acc = Rpc (Api $l1.token) "answer_enquiry_quote" @{ p_quote_id = $q2.id; p_accept = $true }
  $e1c = (Get-Rows (Api $l1.token) "enquiries?$SEL&id=eq.$($e1.id)")[0]
  Check 8 "Studio answering refused ($ownerAccepts); superseded quote refused ($deadAccept); sender accepts -> $($acc.status), enquiry $($e1c.status)" (
    ($ownerAccepts -match "quoted") -and ($deadAccept -match "no longer") -and ($acc.status -eq "accepted") -and ($e1c.status -eq "confirmed"))

  # 9. MONEY IS RECORDED BY THE BUSINESS: the sender cannot; the advance once,
  #    then the balance closes it as Won
  $senderPays = Fails { Rpc (Api $l1.token) "record_enquiry_payment" @{ p_quote_id = $q2.id; p_part = "advance" } }
  $adv = Rpc (Api $ownerA.token) "record_enquiry_payment" @{ p_quote_id = $q2.id; p_part = "advance" }
  $twice = Fails { Rpc (Api $ownerA.token) "record_enquiry_payment" @{ p_quote_id = $q2.id; p_part = "advance" } }
  $e1d = (Get-Rows (Api $ownerA.token) "enquiries?$SEL&id=eq.$($e1.id)")[0]
  $bal = Rpc (Api $ownerA.token) "record_enquiry_payment" @{ p_quote_id = $q2.id; p_part = "balance" }
  $e1e = (Get-Rows (Api $ownerA.token) "enquiries?$SEL&id=eq.$($e1.id)")[0]
  Check 9 "Sender recording refused ($senderPays); advance -> $($e1d.status); again refused ($twice); balance -> $($e1e.status), full_paid_at set: $([bool]$bal.full_paid_at)" (
    ($senderPays -match "business") -and ($null -ne $adv.advance_paid_at) -and ($e1d.status -eq "advance_paid") -and ($twice -match "already") -and ($null -ne $bal.full_paid_at) -and ($e1e.status -eq "won"))

  # 10. the stage menu is the business's: the sender cannot move it; staff of another
  #     business cannot; the artist moves their own to Lost, and a lost enquiry takes no quote
  $senderMoves = Fails { Rpc (Api $l1.token) "set_enquiry_status" @{ p_enquiry_id = $e2.id; p_status = "in_talks" } }
  $strangerMoves = Fails { Rpc (Api $staffA.token) "set_enquiry_status" @{ p_enquiry_id = $e2.id; p_status = "in_talks" } }
  Rpc (Api $ownerB.token) "set_enquiry_status" @{ p_enquiry_id = $e2.id; p_status = "lost" } | Out-Null
  $closedQuote = Fails { Rpc (Api $ownerB.token) "send_enquiry_quote" @{ p_enquiry_id = $e2.id; p_cost_inr = 12000; p_advance_pct = 0 } }
  $e2b = (Get-Rows (Api $ownerB.token) "enquiries?$SEL&id=eq.$($e2.id)")[0]
  Check 10 "Sender cannot move the stage ($senderMoves); another business cannot ($strangerMoves); the artist marks Lost -> $($e2b.status); quoting a closed one refused ($closedQuote)" (
    ($senderMoves -ne "") -and ($strangerMoves -ne "") -and ($e2b.status -eq "lost") -and ($closedQuote -match "closed"))

  # 11. quotes are as private as the enquiry: the bystander and the public read none
  $l2Q = Get-Rows (Api $l2.token) "enquiry_quotes?select=id&enquiry_id=eq.$($e1.id)"
  $anonQ = Get-Rows $anonH "enquiry_quotes?select=id&enquiry_id=eq.$($e1.id)"
  $l1Q = Get-Rows (Api $l1.token) "enquiry_quotes?select=id&enquiry_id=eq.$($e1.id)"
  Check 11 "Quotes: sender reads $($l1Q.Count), bystander $($l2Q.Count), public $($anonQ.Count)" (($l1Q.Count -eq 2) -and ($l2Q.Count -eq 0) -and ($anonQ.Count -eq 0))

  # 12. the public cannot send an enquiry at all
  $anonSend = Fails { Rpc $anonH "send_enquiry" @{ p_tenant_id = $ta.id; p_type_key = "corporate"; p_fields = @(); p_dates = @($in10); p_where = "x"; p_message = "x" } }
  Check 12 "The public cannot call send_enquiry ($anonSend)" ($anonSend -ne "")
}
finally {
  foreach ($t in @($ta, $tb, $tc)) { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($t.id)" -Headers $svcH | Out-Null }
  foreach ($u in @($ownerA, $staffA, $ownerB, $l1, $l2)) {
    Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null
  }
  "   (cleanup: proof studios and throwaway accounts deleted)"
}

if ($pass) { "`nALL ENQUIRY CHECKS PASSED"; exit 0 } else { "`nENQUIRY CHECKS FAILED"; exit 1 }
