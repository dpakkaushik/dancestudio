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

. (Join-Path $PSScriptRoot "proof-lib.ps1")   # New-Studio / Subscribe-Studio / Assert-City / Publish-Class (see that file)

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
  # 26 Sep 2026: the organization LOGIN is retired - every account here is a person
  $tok = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $anonH -Body (@{
    email = $email; password = "Proof-passw0rd!" } | ConvertTo-Json)
  return [pscustomobject]@{ id = $u.id; email = $email; token = $tok.access_token }
}
function Add-Member($tenantId, $userId, $memberRole, $byUser) {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/business_members" -Headers $svcH -Body (@{
    business_id = $tenantId; user_id = $userId; member_role = $memberRole
    created_by = $byUser; updated_by = $byUser } | ConvertTo-Json) | Out-Null
}
$in10 = (Get-Date).AddDays(10).ToString("yyyy-MM-dd")
function Send-Enq($user, $tenantId, $type) {
  return Rpc (Api $user.token) "send_enquiry" @{ p_business_id = $tenantId; p_type_key = $type
    p_fields = @(@("Enquiry", "Proof"), @("What for", "Event"), @("Number of performances", "3"))
    p_dates = @($in10); p_where = "Kothrud, Pune"; p_message = "Proof enquiry"; p_mobile = "+91 98765 43210" }
}
# the repository's read, verbatim in shape (repositories/enquiries.ts)
$SEL = "select=id,business_id,from_user_id,type_key,status,enquiry_quotes(id,n,cost_inr,advance_pct,advance_inr,status,advance_paid_at,full_paid_at)"

# 10 Sep 2026: the Artist plan is a PAID subscription (Rs 700 a month through Cashfree), so the free
# RPC refuses it. The service role stands in for an admin's grant - the row admin_grant_subscription
# writes: granted, active, Rs 0, twelve months, no mandate.
function Grant-ArtistPlan($userId) {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/subscriptions" -Headers $svcH -Body (@{
    kind = "artist"; user_id = $userId; plan_key = "artist_monthly"; price_inr = 0; period = "monthly"; status = "active"
    current_period_start = (Get-Date).ToString("yyyy-MM-dd"); current_period_end = (Get-Date).AddMonths(12).ToString("yyyy-MM-dd"); granted = $true
    note = "Granted by a proof script - nothing charged"; created_by = $userId; updated_by = $userId } | ConvertTo-Json) | Out-Null
}

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$ownerA = New-EmailUser "enq-ownera-$stamp@example.com" "Owner A $stamp" "user"
$staffA = New-EmailUser "enq-staffa-$stamp@example.com" "Staff A $stamp" "user"
$ownerB = New-EmailUser "enq-ownerb-$stamp@example.com" "Artist B $stamp" "user"
$l1 = New-EmailUser "enq-l1-$stamp@example.com" "Sender One $stamp" "user"
$l2 = New-EmailUser "enq-l2-$stamp@example.com" "Bystander $stamp" "user"

$ta = New-Studio $ownerA.token "Enquiry Proof Studio $stamp" "Kothrud" "Pune"
Subscribe-Studio ([string]$ta.id)
# 8 Sep 2026: an artist page is a Pro USER's - the plan comes first. 10 Sep 2026: the plan is PAID
# (Rs 700 a month), so the free RPC refuses it; the service role grants one as an admin would
Grant-ArtistPlan $ownerB.id
$tb = New-Artist-Page $ownerB.token "Artist Business $stamp" "Baner" "Pune"
$tc = New-Studio $ownerA.token "Private Studio $stamp" "Andheri" "Mumbai"
Subscribe-Studio ([string]$tc.id)
Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$($tc.id)" -Headers $svcH -Body (@{ visibility = "unlisted" } | ConvertTo-Json) | Out-Null
Add-Member $ta.id $staffA.id "staff" $ownerA.id

try {
  # 1. a person sends a Performer enquiry to the studio: filed New, with its fields.
  #    4 Oct 2026: three kinds can be sent (choreographer, performer, judge); an old kind is refused.
  $e1 = Send-Enq $l1 $ta.id "performer"
  $oldKind = Fails { Send-Enq $l1 $ta.id "celebration" }
  Check 1 "L1 sends to the studio: status $($e1.status), $(@($e1.fields).Count) fields, $(@($e1.dates).Count) date; an old kind refused ($oldKind)" (
    ($e1.status -eq "new") -and (@($e1.fields).Count -eq 3) -and (@($e1.dates).Count -eq 1) -and ($oldKind -match "unknown enquiry type"))

  # 2. Judge / Guest is a person's job: refused for a studio, accepted for an artist business
  $judgeStudio = Fails { Send-Enq $l1 $ta.id "judge" }
  $e2 = Send-Enq $l1 $tb.id "judge"
  Check 2 "Judge / Guest: studio refused ($judgeStudio); artist business accepted ($($e2.type_key))" (
    ($judgeStudio -match "artist") -and ($e2.type_key -eq "judge"))

  # 3. you do not enquire of yourself, and a private business takes no enquiries
  $selfEnq = Fails { Send-Enq $ownerA $ta.id "choreographer" }
  $privEnq = Fails { Send-Enq $l1 $tc.id "choreographer" }
  Check 3 "Own business refused ($selfEnq); private business refused ($privEnq)" (
    ($selfEnq -match "belong") -and ($privEnq -match "not open"))

  # 4. READS ARE THE TWO ENDS: the sender reads theirs, the studio's owner AND staff
  #    read the studio's, the artist reads the artist's, a bystander and the public none
  $l1Rows = Get-Rows (Api $l1.token) "enquiries?$SEL&deleted_at=is.null"
  $ownerRows = Get-Rows (Api $ownerA.token) "enquiries?$SEL&business_id=eq.$($ta.id)"
  $staffRows = Get-Rows (Api $staffA.token) "enquiries?$SEL&business_id=eq.$($ta.id)"
  $artistRows = Get-Rows (Api $ownerB.token) "enquiries?$SEL"
  $l2Rows = Get-Rows (Api $l2.token) "enquiries?$SEL"
  $anonRows = Get-Rows $anonH "enquiries?$SEL"
  Check 4 "Sender reads $($l1Rows.Count); studio owner $($ownerRows.Count), staff $($staffRows.Count); artist $($artistRows.Count); bystander $($l2Rows.Count); public $($anonRows.Count)" (
    ($l1Rows.Count -eq 2) -and ($ownerRows.Count -eq 1) -and ($staffRows.Count -eq 1) -and ($artistRows.Count -eq 1) -and ($l2Rows.Count -eq 0) -and ($anonRows.Count -eq 0))

  # 5. no direct writes
  $direct = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/enquiries" -Headers (Api $l2.token) -Body (@{ business_id = $ta.id; from_user_id = $l2.id; type_key = "choreographer"; message = "x" } | ConvertTo-Json) }
  Check 5 "A direct insert into enquiries is refused ($direct)" ($direct -ne "")

  # 6. (3 Oct 2026) ONLY OWNERS AND MANAGERS WORK AN ENQUIRY: staff read it and are
  #    refused the answer and the quote; the sender cannot quote their own ask; the
  #    owner accepts it and quotes - lines, a 30% advance, valid a week
  $staffAnswers = Fails { Rpc (Api $staffA.token) "respond_to_enquiry" @{ p_enquiry_id = $e1.id; p_accept = $true; p_reason = $null } }
  $staffQuotes = Fails { Rpc (Api $staffA.token) "send_enquiry_quote" @{ p_enquiry_id = $e1.id; p_items = $null; p_lump_inr = 45000; p_advance_pct = 30; p_valid_until = $null; p_note = $null } }
  $senderQuotes = Fails { Rpc (Api $l1.token) "send_enquiry_quote" @{ p_enquiry_id = $e1.id; p_items = $null; p_lump_inr = 1; p_advance_pct = 0; p_valid_until = $null; p_note = $null } }
  Rpc (Api $ownerA.token) "respond_to_enquiry" @{ p_enquiry_id = $e1.id; p_accept = $true; p_reason = $null } | Out-Null
  $week = (Get-Date).AddDays(7).ToString("yyyy-MM-dd")
  $q1 = Rpc (Api $ownerA.token) "send_enquiry_quote" @{ p_enquiry_id = $e1.id
    p_items = @(@{ name = "Choreography"; qty = 3; unit_inr = 10000 }, @{ name = "Costumes"; qty = 1; unit_inr = 15000 })
    p_lump_inr = $null; p_advance_pct = 30; p_valid_until = $week; p_note = "Two rehearsals included" }
  $e1b = (Get-Rows (Api $ownerA.token) "enquiries?$SEL&id=eq.$($e1.id)")[0]
  Check 6 "Staff answering refused ($staffAnswers) and quoting refused ($staffQuotes); sender quoting refused ($senderQuotes); owner quote #$($q1.n) Rs $($q1.cost_inr), advance Rs $($q1.advance_inr); enquiry $($e1b.status)" (
    ($staffAnswers -match "owners and managers") -and ($staffQuotes -match "owners and managers") -and ($senderQuotes -ne "") -and
    ($q1.n -eq 1) -and ($q1.cost_inr -eq 45000) -and ($q1.advance_inr -eq 13500) -and ($q1.status -eq "sent") -and ($e1b.status -eq "quoted"))

  # 7. A REVISION ASKED FOR, THEN SUPERSEDED: the sender asks with a reason (the
  #    quote declines, the enquiry stays open), the owner sends #2 and #1 is kept
  $noReason = Fails { Rpc (Api $l1.token) "answer_enquiry_quote" @{ p_quote_id = $q1.id; p_answer = "revise"; p_reason = $null } }
  Rpc (Api $l1.token) "answer_enquiry_quote" @{ p_quote_id = $q1.id; p_answer = "revise"; p_reason = "Two performances, not three" } | Out-Null
  $q2 = Rpc (Api $ownerA.token) "send_enquiry_quote" @{ p_enquiry_id = $e1.id; p_items = $null; p_lump_inr = 50000; p_advance_pct = 50; p_valid_until = $week; p_note = $null }
  $hist = @((Get-Rows (Api $l1.token) "enquiry_quotes?select=n,status,cost_inr,answer_reason&enquiry_id=eq.$($e1.id)&kind=eq.quote&order=n") | Where-Object { $null -ne $_ })
  Check 7 "Revision without a reason refused ($noReason); #1 $($hist[0].status) with its reason kept; #$($q2.n) Rs $($q2.cost_inr) live" (
    ($noReason -match "what should change") -and ($q2.n -eq 2) -and ($hist.Count -eq 2) -and ($hist[0].answer_reason -eq "Two performances, not three") -and ($hist[1].status -eq "sent"))

  # 8. ONLY THE PERSON QUOTED ANSWERS: the studio cannot accept its own price, a
  #    replaced quote cannot be answered, the sender accepts the live one - the project is ON
  $ownerAccepts = Fails { Rpc (Api $ownerA.token) "answer_enquiry_quote" @{ p_quote_id = $q2.id; p_answer = "accept"; p_reason = $null } }
  $deadAccept = Fails { Rpc (Api $l1.token) "answer_enquiry_quote" @{ p_quote_id = $q1.id; p_answer = "accept"; p_reason = $null } }
  Rpc (Api $l1.token) "answer_enquiry_quote" @{ p_quote_id = $q2.id; p_answer = "accept"; p_reason = $null } | Out-Null
  $e1c = (Get-Rows (Api $l1.token) "enquiries?$SEL&id=eq.$($e1.id)")[0]
  $q2c = @($e1c.enquiry_quotes | Where-Object { $_.id -eq $q2.id })[0]
  Check 8 "Studio answering refused ($ownerAccepts); replaced quote refused ($deadAccept); sender accepts -> quote $($q2c.status), enquiry $($e1c.status)" (
    ($ownerAccepts -match "person who was quoted") -and ($deadAccept -match "no longer") -and ($q2c.status -eq "accepted") -and ($e1c.status -eq "ongoing"))

  # 9. MONEY IS RECORDED BY OWNERS AND MANAGERS: the sender cannot; staff cannot; the
  #    advance once, then the balance; then the project is completed from both ends
  $senderPays = Fails { Rpc (Api $l1.token) "record_enquiry_payment" @{ p_quote_id = $q2.id; p_part = "advance" } }
  $staffPays = Fails { Rpc (Api $staffA.token) "record_enquiry_payment" @{ p_quote_id = $q2.id; p_part = "advance" } }
  $early = Fails { Rpc (Api $ownerA.token) "mark_enquiry_complete" @{ p_enquiry_id = $e1.id } }
  Rpc (Api $ownerA.token) "record_enquiry_payment" @{ p_quote_id = $q2.id; p_part = "advance" } | Out-Null
  $twice = Fails { Rpc (Api $ownerA.token) "record_enquiry_payment" @{ p_quote_id = $q2.id; p_part = "advance" } }
  Rpc (Api $ownerA.token) "record_enquiry_payment" @{ p_quote_id = $q2.id; p_part = "balance" } | Out-Null
  Rpc (Api $ownerA.token) "mark_enquiry_complete" @{ p_enquiry_id = $e1.id } | Out-Null
  $e1d = (Get-Rows (Api $ownerA.token) "enquiries?$SEL&id=eq.$($e1.id)")[0]
  Rpc (Api $l1.token) "mark_enquiry_complete" @{ p_enquiry_id = $e1.id } | Out-Null
  $e1e = (Get-Rows (Api $ownerA.token) "enquiries?$SEL&id=eq.$($e1.id)")[0]
  $q2e = @($e1e.enquiry_quotes | Where-Object { $_.id -eq $q2.id })[0]
  Check 9 "Sender recording refused ($senderPays); staff refused ($staffPays); completing early refused ($early); advance twice refused ($twice); owner marks -> $($e1d.status); sender confirms -> $($e1e.status), full_paid_at set: $([bool]$q2e.full_paid_at)" (
    ($senderPays -ne "") -and ($staffPays -match "owners and managers") -and ($early -match "still due") -and ($twice -match "already") -and
    ($e1d.status -eq "completing") -and ($e1e.status -eq "completed") -and ($null -ne $q2e.full_paid_at))

  # 10. answering a new enquiry is the business's: the sender cannot, staff of another
  #     business cannot; the artist declines theirs with a reason, and a closed enquiry takes no quote
  $senderMoves = Fails { Rpc (Api $l1.token) "respond_to_enquiry" @{ p_enquiry_id = $e2.id; p_accept = $true; p_reason = $null } }
  $strangerMoves = Fails { Rpc (Api $staffA.token) "respond_to_enquiry" @{ p_enquiry_id = $e2.id; p_accept = $true; p_reason = $null } }
  $bareDecline = Fails { Rpc (Api $ownerB.token) "respond_to_enquiry" @{ p_enquiry_id = $e2.id; p_accept = $false; p_reason = $null } }
  Rpc (Api $ownerB.token) "respond_to_enquiry" @{ p_enquiry_id = $e2.id; p_accept = $false; p_reason = "Booked that weekend" } | Out-Null
  $closedQuote = Fails { Rpc (Api $ownerB.token) "send_enquiry_quote" @{ p_enquiry_id = $e2.id; p_items = $null; p_lump_inr = 12000; p_advance_pct = 0; p_valid_until = $null; p_note = $null } }
  $e2b = (Get-Rows (Api $ownerB.token) "enquiries?select=status,close_reason&id=eq.$($e2.id)")[0]
  Check 10 "Sender cannot answer ($senderMoves); another business cannot ($strangerMoves); declining needs a reason ($bareDecline); declined -> $($e2b.status) '$($e2b.close_reason)'; quoting a closed one refused ($closedQuote)" (
    ($senderMoves -ne "") -and ($strangerMoves -ne "") -and ($bareDecline -match "say why") -and ($e2b.status -eq "declined") -and ($e2b.close_reason -eq "Booked that weekend") -and ($closedQuote -match "closed"))

  # 11. quotes are as private as the enquiry: the bystander and the public read none
  $l2Q = Get-Rows (Api $l2.token) "enquiry_quotes?select=id&enquiry_id=eq.$($e1.id)"
  $anonQ = Get-Rows $anonH "enquiry_quotes?select=id&enquiry_id=eq.$($e1.id)"
  $l1Q = Get-Rows (Api $l1.token) "enquiry_quotes?select=id&enquiry_id=eq.$($e1.id)"
  Check 11 "Quotes: sender reads $($l1Q.Count), bystander $($l2Q.Count), public $($anonQ.Count)" (($l1Q.Count -eq 2) -and ($l2Q.Count -eq 0) -and ($anonQ.Count -eq 0))

  # 12. the public cannot send an enquiry at all
  $anonSend = Fails { Rpc $anonH "send_enquiry" @{ p_business_id = $ta.id; p_type_key = "choreographer"; p_fields = @(); p_dates = @($in10); p_where = "x"; p_message = "x" } }
  Check 12 "The public cannot call send_enquiry ($anonSend)" ($anonSend -ne "")
}
finally {
  foreach ($t in @($ta, $tb, $tc)) { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/businesses?id=eq.$($t.id)" -Headers $svcH | Out-Null }
  foreach ($u in @($ownerA, $staffA, $ownerB, $l1, $l2)) {
    Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null
  }
  "   (cleanup: proof studios and throwaway accounts deleted)"
}

if ($pass) { "`nALL ENQUIRY CHECKS PASSED"; exit 0 } else { "`nENQUIRY CHECKS FAILED"; exit 1 }
