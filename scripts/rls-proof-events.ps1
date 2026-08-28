# Proof for Step 21 - events, competitions, ticketing: who may run an event,
# what publishing demands (in the prototype's own sentences), who may book a
# seat or an entry and under what rules, that a cancelled seat goes back on
# sale by arithmetic, that the door is the organiser's, and that a draft is
# dark to everybody but the organiser.
#
# Money, honestly: every seat and entry here is FREE, because the rail has no
# account behind it. A priced tier or entry is refused with Step 9's sentence
# and this proof pins that down rather than pretending.
#
# Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-events.ps1
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
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body ($body | ConvertTo-Json -Depth 8)
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
$in11 = (Get-Date).AddDays(11).ToString("yyyy-MM-dd")
# the event as the form sends it (repositories/events.ts EventPayload)
function Ev($cat, $title, $ticketsOn, $tiers, $entries) {
  return @{ cat = $cat; title = $title; style = "All styles"; start_date = $in10; end_date = $in11; start_time = "18:00"
    venue = "Proof Hall"; address = "Kothrud"; city = "Pune"; maps_url = "https://maps.google.com/?q=Proof+Hall"; about = "Proof event"
    entry_format = $(if ($entries.Count -eq 3) { "all" } elseif ($entries.Count -eq 1) { $entries[0].format } elseif ($entries.Count -eq 0) { "none" } else { "mixed" })
    bracket = $(if ($cat -eq "battle") { 16 } else { 0 }); rounds = $(if ($cat -eq "tournament") { 3 } else { 0 })
    prizes = @(5000, 2000, 1000); tickets_on = $ticketsOn; entry_tiers = $entries; ticket_tiers = $tiers }
}
function Book($user, $eventId, $kind, $tierId, $qty, $format, $entrant, $partner) {
  $body = @{ p_event_id = $eventId; p_kind = $kind; p_qty = $qty }
  if ($tierId) { $body.p_ticket_tier_id = $tierId }
  if ($format) { $body.p_format = $format }
  if ($entrant) { $body.p_entrant_name = $entrant }
  if ($partner) { $body.p_partner_name = $partner }
  return Rpc (Api $user.token) "book_event" $body
}
$EVSEL = "select=id,title,status,share_slug,deleted_at,event_ticket_tiers(id,name,price_inr,capacity),event_entry_tiers(id,format,fee_inr,capacity)"
$BKSEL = "select=id,event_id,user_id,kind,ticket_tier_id,entry_format,qty,entrant_name,partner_name,amount_inr,status,checked_in_at"

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$ownerA = New-EmailUser "ev-ownera-$stamp@example.com" "Owner A $stamp" "studio"
$staffA = New-EmailUser "ev-staffa-$stamp@example.com" "Staff A $stamp" "dancer"
$ownerB = New-EmailUser "ev-ownerb-$stamp@example.com" "Owner B $stamp" "studio"
$l1 = New-EmailUser "ev-l1-$stamp@example.com" "Dancer One $stamp" "dancer"
$l2 = New-EmailUser "ev-l2-$stamp@example.com" "Dancer Two $stamp" "dancer"

$ta = Rpc (Api $ownerA.token) "create_tenant_with_owner" @{ p_name = "Event Proof Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }
$tb = Rpc (Api $ownerB.token) "create_tenant_with_owner" @{ p_name = "Rival Studio $stamp"; p_type = "studio"; p_area = "Baner"; p_city = "Pune" }
Add-Member $ta.id $staffA.id "staff" $ownerA.id

try {
  # 1. the owner saves a battle as a DRAFT: three ways in (solo has ONE place), a
  #    free General tier with ONE seat and a priced VIP tier. The owner reads it;
  #    the public and a signed-in stranger read nothing by its slug.
  $battle = Ev "battle" "Proof Battle $stamp" $true @(
    @{ name = "General"; price_inr = 0; capacity = 1; sort = 0 },
    @{ name = "VIP"; price_inr = 500; capacity = 10; sort = 1 }) @(
    @{ format = "solo"; fee_inr = 0; capacity = 1 },
    @{ format = "duo"; fee_inr = 0; capacity = 5 },
    @{ format = "crew"; fee_inr = 0; capacity = 5 })
  $bId = Rpc (Api $ownerA.token) "save_event" @{ p_tenant_id = $ta.id; p_event_id = $null; p_event = $battle }
  $bRow = (Get-Rows (Api $ownerA.token) "events?$EVSEL&id=eq.$bId")[0]
  $slug = $bRow.share_slug
  $anonDraft = Get-Rows $anonH "events?$EVSEL&share_slug=eq.$slug"
  $l1Draft = Get-Rows (Api $l1.token) "events?$EVSEL&share_slug=eq.$slug"
  Check 1 "Draft saved ($($bRow.status), slug $slug, $(@($bRow.event_ticket_tiers).Count) tiers, $(@($bRow.event_entry_tiers).Count) ways in); public reads $($anonDraft.Count), stranger reads $($l1Draft.Count)" (
    ($bRow.status -eq "draft") -and ($slug -match "^proof-battle") -and (@($bRow.event_ticket_tiers).Count -eq 2) -and (@($bRow.event_entry_tiers).Count -eq 3) -and ($anonDraft.Count -eq 0) -and ($l1Draft.Count -eq 0))

  # 2. PUBLISH BLOCKERS, IN THE PROTOTYPE'S WORDS (dosEventBlockers 3061): a
  #    showcase with tickets off, a battle with tickets on and no tier, and the
  #    same battle with tickets off and no way in
  $showOff = Rpc (Api $ownerA.token) "save_event" @{ p_tenant_id = $ta.id; p_event_id = $null; p_event = (Ev "showcase" "Proof Showcase $stamp" $false @() @()) }
  $b1 = Fails { Rpc (Api $ownerA.token) "publish_event" @{ p_event_id = $showOff } }
  $bare = Rpc (Api $ownerA.token) "save_event" @{ p_tenant_id = $ta.id; p_event_id = $null; p_event = (Ev "battle" "Bare Battle $stamp" $true @() @()) }
  $b2 = Fails { Rpc (Api $ownerA.token) "publish_event" @{ p_event_id = $bare } }
  Rpc (Api $ownerA.token) "save_event" @{ p_tenant_id = $ta.id; p_event_id = $bare; p_event = (Ev "battle" "Bare Battle $stamp" $false @() @()) } | Out-Null
  $b3 = Fails { Rpc (Api $ownerA.token) "publish_event" @{ p_event_id = $bare } }
  # the sentence must be the WHOLE message: the first cut of event_blockers appended
  # with text[] || literal, which Postgres read as array || array, so the caller got
  # "malformed array literal: ..." wrapped round the words (fixed in 20260828210000)
  Check 2 "Blockers: showcase [$b1]; no tier [$b2]; no way in [$b3]" (
    ($b1 -match "^A showcase is watched") -and ($b2 -match "^Add a ticket tier") -and ($b3 -match "^Open at least one way in"))

  # 3. WHO MAY RUN EVENTS: a rival owner cannot publish it, staff cannot save
  #    one; the owner publishes, and now the public reads it WITH its tiers
  $rivalPub = Fails { Rpc (Api $ownerB.token) "publish_event" @{ p_event_id = $bId } }
  $staffSave = Fails { Rpc (Api $staffA.token) "save_event" @{ p_tenant_id = $ta.id; p_event_id = $null; p_event = (Ev "showcase" "Staff Try $stamp" $true @(@{ name = "X"; price_inr = 0; capacity = 5; sort = 0 }) @()) } }
  Rpc (Api $ownerA.token) "publish_event" @{ p_event_id = $bId } | Out-Null
  $pub = Get-Rows $anonH "events?$EVSEL&share_slug=eq.$slug"
  $general = @($pub[0].event_ticket_tiers | Where-Object { $_.name -eq "General" })[0]
  $vip = @($pub[0].event_ticket_tiers | Where-Object { $_.name -eq "VIP" })[0]
  Check 3 "Rival publish refused ($rivalPub); staff save refused ($staffSave); published: public reads $($pub.Count) with $(@($pub[0].event_ticket_tiers).Count) tiers and $(@($pub[0].event_entry_tiers).Count) ways in" (
    ($rivalPub -match "owner or a trainer") -and ($staffSave -match "owner or a trainer") -and ($pub.Count -eq 1) -and ($pub[0].status -eq "published") -and (@($pub[0].event_ticket_tiers).Count -eq 2) -and (@($pub[0].event_entry_tiers).Count -eq 3))

  # 4. A FREE SEAT UNDER CAPACITY BOOKS; the count is public, the name is not
  $t1 = Book $l1 $bId "spectator" $general.id 1 $null $null $null
  $counts = @((Rpc $anonH "event_counts" @{ p_event_ids = @($bId) }) | Where-Object { $_.ticket_tier_id -eq $general.id })
  Check 4 "L1 books General: $($t1.status), qty $($t1.qty), Rs $($t1.amount_inr); public count for General = $($counts[0].n)" (
    ($t1.status -eq "booked") -and ($t1.qty -eq 1) -and ($t1.amount_inr -eq 0) -and ($counts.Count -eq 1) -and ($counts[0].n -eq 1))

  # 5. A PRICED TIER IS REFUSED WITH STEP 9'S SENTENCE
  $priced = Fails { Book $l1 $bId "spectator" $vip.id 1 $null $null $null }
  Check 5 "VIP (Rs 500) refused: $priced" ($priced -match "switched on")

  # 6. THE PEOPLE WHO RUN IT DO NOT BOOK IT (13273) - owner and staff alike
  $ownerBooks = Fails { Book $ownerA $bId "spectator" $general.id 1 $null $null $null }
  $staffBooks = Fails { Book $staffA $bId "participant" $null 1 "duo" $null "Somebody" }
  Check 6 "Owner refused ($ownerBooks); staff refused ($staffBooks)" (
    ($ownerBooks -match "run this event") -and ($staffBooks -match "run this event"))

  # 7. A SHOWCASE TAKES NO ENTRIES (13245): publish one with a free tier, then try
  $show = Rpc (Api $ownerA.token) "save_event" @{ p_tenant_id = $ta.id; p_event_id = $null; p_event = (Ev "showcase" "Open Showcase $stamp" $true @(@{ name = "Free entry"; price_inr = 0; capacity = 50; sort = 0 }) @()) }
  Rpc (Api $ownerA.token) "publish_event" @{ p_event_id = $show } | Out-Null
  $showEntry = Fails { Book $l1 $show "participant" $null 1 "solo" $null $null }
  $showRow = (Get-Rows $anonH "events?$EVSEL&id=eq.$show")[0]
  $freeTier = @($showRow.event_ticket_tiers)[0]
  $showSeat = Book $l1 $show "spectator" $freeTier.id 2 $null $null $null
  Check 7 "Showcase entry refused ($showEntry); a showcase seat books fine (qty $($showSeat.qty))" (
    ($showEntry -match "invite-only") -and ($showSeat.status -eq "booked") -and ($showSeat.qty -eq 2))

  # 8. A DUET NEEDS A PARTNER; A CREW NEEDS A NAME
  $noPartner = Fails { Book $l1 $bId "participant" $null 1 "duo" $null $null }
  $noCrew = Fails { Book $l1 $bId "participant" $null 1 "crew" $null $null }
  Check 8 "Duet without partner ($noPartner); crew without name ($noCrew)" (
    ($noPartner -match "needs your partner") -and ($noCrew -match "name the crew"))

  # 9. A SOLO ENTRY BOOKS ONCE; the one solo place is then FULL for the next person
  $solo = Book $l1 $bId "participant" $null 1 "solo" $null $null
  $again = Fails { Book $l1 $bId "participant" $null 1 "solo" $null $null }
  $full = Fails { Book $l2 $bId "participant" $null 1 "solo" $null $null }
  Check 9 "L1 enters solo ($($solo.entry_format), $($solo.status)); again refused ($again); L2 finds it full ($full)" (
    ($solo.entry_format -eq "solo") -and ($solo.status -eq "booked") -and ($again -match "already entered") -and ($full -match "places are full"))

  # 10. CANCELLING FREES THE SEAT BY ARITHMETIC: General holds one seat and L1 has
  #     it, so L2 is refused; L1 cancels; L2 books it. And L2 cannot cancel L1's entry.
  $noSeat = Fails { Book $l2 $bId "spectator" $general.id 1 $null $null $null }
  Rpc (Api $l1.token) "cancel_event_booking" @{ p_booking_id = $t1.id } | Out-Null
  $t2 = Book $l2 $bId "spectator" $general.id 1 $null $null $null
  $crossCancel = Fails { Rpc (Api $l2.token) "cancel_event_booking" @{ p_booking_id = $solo.id } }
  Check 10 "L2 refused while full ($noSeat); after L1 cancels, L2 books ($($t2.status)); L2 cancelling L1's entry refused ($crossCancel)" (
    ($noSeat -match "only 0 left") -and ($t2.status -eq "booked") -and ($crossCancel -match "booking not found"))

  # 11. WHO READS WHAT: a holder their own rows (live and cancelled), every member
  #     of the organiser the register, a rival and the public nothing
  $l1Rows = Get-Rows (Api $l1.token) "event_bookings?$BKSEL&event_id=eq.$bId"
  $l2Rows = Get-Rows (Api $l2.token) "event_bookings?$BKSEL&event_id=eq.$bId"
  $ownerRows = Get-Rows (Api $ownerA.token) "event_bookings?$BKSEL&event_id=eq.$bId"
  $staffRows = Get-Rows (Api $staffA.token) "event_bookings?$BKSEL&event_id=eq.$bId"
  $rivalRows = Get-Rows (Api $ownerB.token) "event_bookings?$BKSEL&event_id=eq.$bId"
  $anonRows = Get-Rows $anonH "event_bookings?$BKSEL&event_id=eq.$bId"
  Check 11 "L1 reads $($l1Rows.Count) (own ticket + entry), L2 $($l2Rows.Count), owner $($ownerRows.Count), staff $($staffRows.Count), rival $($rivalRows.Count), public $($anonRows.Count)" (
    ($l1Rows.Count -eq 2) -and ($l2Rows.Count -eq 1) -and ($ownerRows.Count -eq 3) -and ($staffRows.Count -eq 3) -and ($rivalRows.Count -eq 0) -and ($anonRows.Count -eq 0))

  # 12. THE DOOR IS THE ORGANISER'S: a holder cannot check themselves in, staff can;
  #     the holder reads their own check-in
  $selfIn = Fails { Rpc (Api $l2.token) "check_in_event_booking" @{ p_booking_id = $t2.id; p_in = $true } }
  Rpc (Api $staffA.token) "check_in_event_booking" @{ p_booking_id = $t2.id; p_in = $true } | Out-Null
  $t2Now = (Get-Rows (Api $l2.token) "event_bookings?$BKSEL&id=eq.$($t2.id)")[0]
  Rpc (Api $staffA.token) "check_in_event_booking" @{ p_booking_id = $t2.id; p_in = $false } | Out-Null
  $t2Out = (Get-Rows (Api $ownerA.token) "event_bookings?$BKSEL&id=eq.$($t2.id)")[0]
  Check 12 "Self check-in refused ($selfIn); staff checks L2 in (checked_in_at set: $($null -ne $t2Now.checked_in_at)) and out again (cleared: $($null -eq $t2Out.checked_in_at))" (
    ($selfIn -match "run the door") -and ($null -ne $t2Now.checked_in_at) -and ($null -eq $t2Out.checked_in_at))

  # 13. A WALK-IN IS RECORDED, NOT ASKED: by name, no account, checked in on the
  #     spot; a holder cannot add one
  $walk = Rpc (Api $staffA.token) "add_event_walk_in" @{ p_event_id = $bId; p_kind = "spectator"; p_name = "Gate Walkin"; p_ticket_tier_id = $vip.id }
  $l1Walk = Fails { Rpc (Api $l1.token) "add_event_walk_in" @{ p_event_id = $bId; p_kind = "spectator"; p_name = "Sneak"; p_ticket_tier_id = $vip.id } }
  Check 13 "Walk-in: user_id null=$($null -eq $walk.user_id), name '$($walk.entrant_name)', checked in=$($null -ne $walk.checked_in_at), Rs $($walk.amount_inr); a holder adding one refused ($l1Walk)" (
    ($null -eq $walk.user_id) -and ($walk.entrant_name -eq "Gate Walkin") -and ($null -ne $walk.checked_in_at) -and ($walk.amount_inr -eq 0) -and ($l1Walk -match "run the door"))

  # 14. NO DIRECT WRITES: not to bookings, not to events - even by the owner
  $directB = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/event_bookings" -Headers (Api $l1.token) -Body (@{ event_id = $bId; tenant_id = $ta.id; user_id = $l1.id; kind = "spectator"; ticket_tier_id = $general.id } | ConvertTo-Json) }
  $directE = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/events" -Headers (Api $ownerA.token) -Body (@{ tenant_id = $ta.id; cat = "battle"; title = "Direct"; style = "x"; start_date = $in10; end_date = $in10; venue = "v"; city = "Pune"; maps_url = "m" } | ConvertTo-Json) }
  Check 14 "Direct booking insert refused ($directB); direct event insert refused ($directE)" (($directB -ne "") -and ($directE -ne ""))

  # 15. DUET AND CREW ENTRIES CARRY THEIR NAMES; the public counts each format
  $duo = Book $l2 $bId "participant" $null 1 "duo" $null "Partner Person"
  $crew = Book $l2 $bId "participant" $null 1 "crew" "Proof Crew" $null
  $pc = @((Rpc $anonH "event_counts" @{ p_event_ids = @($bId) }) | Where-Object { $_.kind -eq "participant" })
  $perFmt = ($pc | Sort-Object entry_format | ForEach-Object { "$($_.entry_format)=$($_.n)" }) -join ","
  Check 15 "Duet with '$($duo.partner_name)', crew named '$($crew.entrant_name)'; public entry counts $perFmt" (
    ($duo.partner_name -eq "Partner Person") -and ($crew.entrant_name -eq "Proof Crew") -and ($perFmt -eq "crew=1,duo=1,solo=1"))

  # 16. DELETE IS SOFT AND THE ORGANISER'S: the rival cannot; the owner does; the
  #     public no longer finds the showcase while the owner still reads the record
  $rivalDel = Fails { Rpc (Api $ownerB.token) "delete_event" @{ p_event_id = $show } }
  Rpc (Api $ownerA.token) "delete_event" @{ p_event_id = $show } | Out-Null
  $anonShow = Get-Rows $anonH "events?$EVSEL&id=eq.$show"
  $ownerShow = (Get-Rows (Api $ownerA.token) "events?$EVSEL&id=eq.$show")[0]
  Check 16 "Rival delete refused ($rivalDel); deleted: public reads $($anonShow.Count), owner still reads it with deleted_at set ($($null -ne $ownerShow.deleted_at))" (
    ($rivalDel -match "owner or a trainer") -and ($anonShow.Count -eq 0) -and ($null -ne $ownerShow.deleted_at))
}
finally {
  # tenants cascade events -> tiers -> bookings; users cascade profiles
  foreach ($t in @($ta, $tb)) {
    try { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($t.id)" -Headers $svcH | Out-Null } catch {}
  }
  foreach ($u in @($ownerA, $staffA, $ownerB, $l1, $l2)) {
    try { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null } catch {}
  }
}

if ($pass) { "ALL EVENT CHECKS PASSED" } else { "SOME CHECKS FAILED"; exit 1 }
