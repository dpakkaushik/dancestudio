# Proof for Step 22 - crews.
#
# The claims under test: a crew is a public record whose CONFIRMED roster
# anybody reads, while an unanswered ask is the leader's and the asked person's
# to see; nobody is put on a roster without saying yes (only the person asked
# answers); every write is an RPC (no direct inserts); the leader alone asks,
# withdraws, removes, promotes, hands the crew over and arranges the roster; a
# member may leave but the leader cannot; and the two things Step 21 left
# waiting - a crew entry is made by the crew's LEADER from a crew they lead, and
# a duet partner is a PERSON on DanceOS who is asked and answers - hold at the
# database, with the crew's entries readable as its public battle record.
#
# Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-crews.ps1
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
  # PowerShell 5.1 reads a JSON [] as one item even through a null filter - count off the text
  if ($res.Content.Trim() -eq "[]") { return ,@() }
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
  $tok = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $anonH -Body (@{
    email = $email; password = "Proof-passw0rd!" } | ConvertTo-Json)
  return [pscustomobject]@{ id = $u.id; email = $email; token = $tok.access_token }
}
# the confirmed roster as a stranger reads it (repositories/crews.ts findCrewMembers, public policy)
function Roster($headers, $crewId) { return Get-Rows $headers "crew_members?crew_id=eq.$crewId&deleted_at=is.null&select=id,user_id,role,status,sort&order=sort.asc" }
function Count-Of($headers, $crewId) {
  $rows = @((Rpc $headers "crew_member_counts" @{ p_crew_ids = @($crewId) }) | Where-Object { $null -ne $_ })
  if ($rows.Count -eq 0) { return $null }
  return [int]$rows[0].members
}
$in10 = (Get-Date).AddDays(10).ToString("yyyy-MM-dd")

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$lead = New-EmailUser "crew-lead-$stamp@example.com" "Crew Lead $stamp" "dancer"
$m1 = New-EmailUser "crew-m1-$stamp@example.com" "Member One $stamp" "dancer"
$m2 = New-EmailUser "crew-m2-$stamp@example.com" "Member Two $stamp" "dancer"
$out = New-EmailUser "crew-out-$stamp@example.com" "Outsider $stamp" "dancer"
$owner = New-EmailUser "crew-owner-$stamp@example.com" "Owner $stamp" "studio"
$ta = Rpc (Api $owner.token) "create_tenant_with_owner" @{ p_name = "Crew Proof Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }

try {
  # 1. CREATE: the leader is on the roster confirmed; everyone named is ASKED, not written
  $crew = Rpc (Api $lead.token) "create_crew" @{ p_name = "Proof Crew $stamp"; p_city = "Pune"; p_style = "Hip-Hop"; p_member_ids = @($m1.id) }
  $leadRows = Roster (Api $lead.token) $crew.id
  $leaderRow = @($leadRows | Where-Object { $_.user_id -eq $lead.id })[0]
  $m1Row = @($leadRows | Where-Object { $_.user_id -eq $m1.id })[0]
  Check 1 "Crew '$($crew.name)' led by its creator; the leader reads $($leadRows.Count) rows - leader $($leaderRow.role)/$($leaderRow.status), M1 $($m1Row.role)/$($m1Row.status)" (
    ($crew.leader_id -eq $lead.id) -and ($leadRows.Count -eq 2) -and ($leaderRow.role -eq "leader") -and ($leaderRow.status -eq "confirmed") -and ($m1Row.status -eq "asked"))

  # 2. PUBLIC: a stranger reads the crew and the CONFIRMED roster only; the count agrees
  $anonCrew = Get-Rows $anonH "crews?id=eq.$($crew.id)&select=id,name,city,style"
  $anonRoster = Roster $anonH $crew.id
  $outRoster = Roster (Api $out.token) $crew.id
  $c0 = Count-Of $anonH $crew.id
  Check 2 "A stranger reads the crew ($($anonCrew.Count)) and $($anonRoster.Count) confirmed row (the ask is dark); a signed-in bystander $($outRoster.Count); public count $c0" (
    ($anonCrew.Count -eq 1) -and ($anonRoster.Count -eq 1) -and ($anonRoster[0].status -eq "confirmed") -and ($outRoster.Count -eq 1) -and ($c0 -eq 1))

  # 3. THE ASKED PERSON reads their own ask; nobody else can answer it
  $m1Own = Get-Rows (Api $m1.token) "crew_members?crew_id=eq.$($crew.id)&user_id=eq.$($m1.id)&select=id,status"
  $outAnswers = Fails { Rpc (Api $out.token) "respond_to_crew_ask" @{ p_member_id = $m1Row.id; p_accept = $true } }
  $leadAnswers = Fails { Rpc (Api $lead.token) "respond_to_crew_ask" @{ p_member_id = $m1Row.id; p_accept = $true } }
  Check 3 "M1 reads their ask ($($m1Own.Count), $($m1Own[0].status)); a bystander cannot answer it ($outAnswers); nor can the leader ($leadAnswers)" (
    ($m1Own.Count -eq 1) -and ($m1Own[0].status -eq "asked") -and ($outAnswers -match "not found") -and ($leadAnswers -match "not found"))

  # 4. NO DIRECT WRITES - not to crews, not to the roster
  $directC = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/crews" -Headers (Api $lead.token) -Body (@{ name = "Direct"; city = "Pune"; leader_id = $lead.id } | ConvertTo-Json) }
  $directM = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/crew_members" -Headers (Api $lead.token) -Body (@{ crew_id = $crew.id; user_id = $m2.id; status = "confirmed" } | ConvertTo-Json) }
  Check 4 "Direct crew insert refused ($directC); direct roster insert refused ($directM)" (($directC -ne "") -and ($directM -ne ""))

  # 5. M1 CONFIRMS: the public roster and the count move; a bystander cannot ask people onto the crew
  Rpc (Api $m1.token) "respond_to_crew_ask" @{ p_member_id = $m1Row.id; p_accept = $true } | Out-Null
  $anonRoster2 = Roster $anonH $crew.id
  $c1 = Count-Of $anonH $crew.id
  $outAsks = Fails { Rpc (Api $out.token) "ask_crew_member" @{ p_crew_id = $crew.id; p_user_id = $m2.id } }
  Check 5 "M1 confirmed: public roster $($anonRoster2.Count), count $c1; a bystander cannot ask ($outAsks)" (
    ($anonRoster2.Count -eq 2) -and ($c1 -eq 2) -and ($outAsks -match "leader"))

  # 6. A NO IS A NO, AND A FRESH ASK IS A FRESH ROW: M2 rejects, is asked again, the old row is kept soft-deleted
  $ask2 = Rpc (Api $lead.token) "ask_crew_member" @{ p_crew_id = $crew.id; p_user_id = $m2.id }
  Rpc (Api $m2.token) "respond_to_crew_ask" @{ p_member_id = $ask2.id; p_accept = $false } | Out-Null
  $again = Fails { Rpc (Api $m2.token) "respond_to_crew_ask" @{ p_member_id = $ask2.id; p_accept = $true } }
  $ask2b = Rpc (Api $lead.token) "ask_crew_member" @{ p_crew_id = $crew.id; p_user_id = $m2.id }
  $m2All = Get-Rows (Api $lead.token) "crew_members?crew_id=eq.$($crew.id)&user_id=eq.$($m2.id)&select=id,status,deleted_at"
  $m2Live = @($m2All | Where-Object { -not $_.deleted_at })
  $dupAsk = Fails { Rpc (Api $lead.token) "ask_crew_member" @{ p_crew_id = $crew.id; p_user_id = $m1.id } }
  Check 6 "M2 rejected; answering twice refused ($again); re-asked -> $($m2All.Count) rows, $($m2Live.Count) live ($($m2Live[0].status)); asking a member again refused ($dupAsk)" (
    ($again -match "already answered") -and ($m2All.Count -eq 2) -and ($m2Live.Count -eq 1) -and ($m2Live[0].status -eq "asked") -and ($dupAsk -match "already"))

  # 7. WITHDRAW is the leader's, and only for an unanswered ask
  $outWithdraw = Fails { Rpc (Api $out.token) "withdraw_crew_ask" @{ p_member_id = $ask2b.id } }
  $m1Withdraw = Fails { Rpc (Api $lead.token) "withdraw_crew_ask" @{ p_member_id = $m1Row.id } }
  Rpc (Api $lead.token) "withdraw_crew_ask" @{ p_member_id = $ask2b.id } | Out-Null
  $m2After = Get-Rows (Api $m2.token) "crew_members?crew_id=eq.$($crew.id)&user_id=eq.$($m2.id)&deleted_at=is.null&select=id"
  Check 7 "Bystander cannot withdraw ($outWithdraw); a confirmed row cannot be withdrawn ($m1Withdraw); the leader withdraws -> M2 has $($m2After.Count) live rows" (
    ($outWithdraw -match "not found") -and ($m1Withdraw -match "unanswered") -and ($m2After.Count -eq 0))

  # 8. ROLES: a bystander cannot promote; MAKE LEADER hands the crew over; the old leader is a member; the new leader hands it back
  $outRole = Fails { Rpc (Api $out.token) "set_crew_member_role" @{ p_member_id = $m1Row.id; p_role = "trainee" } }
  Rpc (Api $lead.token) "set_crew_member_role" @{ p_member_id = $m1Row.id; p_role = "leader" } | Out-Null
  $crewNow = (Get-Rows $anonH "crews?id=eq.$($crew.id)&select=leader_id")[0]
  $oldLeadRow = (Get-Rows $anonH "crew_members?crew_id=eq.$($crew.id)&user_id=eq.$($lead.id)&deleted_at=is.null&select=id,role")[0]
  $oldLeadAsks = Fails { Rpc (Api $lead.token) "ask_crew_member" @{ p_crew_id = $crew.id; p_user_id = $m2.id } }
  Rpc (Api $m1.token) "set_crew_member_role" @{ p_member_id = $oldLeadRow.id; p_role = "leader" } | Out-Null
  $crewBack = (Get-Rows $anonH "crews?id=eq.$($crew.id)&select=leader_id")[0]
  $m1RowNow = (Get-Rows $anonH "crew_members?crew_id=eq.$($crew.id)&user_id=eq.$($m1.id)&deleted_at=is.null&select=id,role")[0]
  Check 8 "Bystander refused ($outRole); handed to M1 (leader_id moved: $($crewNow.leader_id -eq $m1.id), old leader now $($oldLeadRow.role), cannot ask: $($oldLeadAsks -ne '')); handed back (leader_id: $($crewBack.leader_id -eq $lead.id), M1 now $($m1RowNow.role))" (
    ($outRole -match "leader") -and ($crewNow.leader_id -eq $m1.id) -and ($oldLeadRow.role -eq "member") -and ($oldLeadAsks -match "leader") -and ($crewBack.leader_id -eq $lead.id) -and ($m1RowNow.role -eq "member"))

  # 9. THE LEADER CANNOT LEAVE; a bystander cannot remove; a member may leave; the leader removes
  $ask3 = Rpc (Api $lead.token) "ask_crew_member" @{ p_crew_id = $crew.id; p_user_id = $m2.id }
  Rpc (Api $m2.token) "respond_to_crew_ask" @{ p_member_id = $ask3.id; p_accept = $true } | Out-Null
  $leaderLeaves = Fails { Rpc (Api $lead.token) "remove_crew_member" @{ p_member_id = $oldLeadRow.id } }
  $outRemoves = Fails { Rpc (Api $out.token) "remove_crew_member" @{ p_member_id = $ask3.id } }
  Rpc (Api $m2.token) "remove_crew_member" @{ p_member_id = $ask3.id } | Out-Null
  $c2 = Count-Of $anonH $crew.id
  Rpc (Api $lead.token) "reorder_crew_members" @{ p_crew_id = $crew.id; p_member_ids = @($m1RowNow.id, $oldLeadRow.id) } | Out-Null
  $ordered = Roster $anonH $crew.id
  Check 9 "Leader cannot leave ($leaderLeaves); bystander cannot remove ($outRemoves); M2 left -> count $c2; leader reorders -> first row is M1: $($ordered[0].user_id -eq $m1.id)" (
    ($leaderLeaves -match "cannot leave") -and ($outRemoves -match "leader") -and ($c2 -eq 2) -and ($ordered[0].user_id -eq $m1.id))

  # 10. STEP 21's DEBT, PART ONE - a crew entry is the LEADER's, from a crew they lead
  $ev = Rpc (Api $owner.token) "save_event" @{ p_tenant_id = $ta.id; p_event_id = $null; p_event = @{
    cat = "battle"; title = "Crew Battle $stamp"; style = "All styles"; start_date = $in10; end_date = $in10; start_time = "18:00"
    venue = "Proof Hall"; address = "Kothrud"; city = "Pune"; maps_url = "https://maps.google.com/?q=Proof+Hall"; about = "Proof"
    entry_format = "mixed"; bracket = 16; rounds = 0; prizes = @(); tickets_on = $false; ticket_tiers = @()
    entry_tiers = @(@{ format = "crew"; fee_inr = 0; capacity = 8 }, @{ format = "duo"; fee_inr = 0; capacity = 8 }) } }
  Rpc (Api $owner.token) "publish_event" @{ p_event_id = $ev } | Out-Null
  $noCrew = Fails { Rpc (Api $lead.token) "book_event" @{ p_event_id = $ev; p_kind = "participant"; p_format = "crew" } }
  $m1Enters = Fails { Rpc (Api $m1.token) "book_event" @{ p_event_id = $ev; p_kind = "participant"; p_format = "crew"; p_crew_id = $crew.id } }
  $entry = Rpc (Api $lead.token) "book_event" @{ p_event_id = $ev; p_kind = "participant"; p_format = "crew"; p_crew_id = $crew.id }
  $twice = Fails { Rpc (Api $lead.token) "book_event" @{ p_event_id = $ev; p_kind = "participant"; p_format = "crew"; p_crew_id = $crew.id } }
  Check 10 "Crew entry without a crew refused ($noCrew); a member who does not lead it refused ($m1Enters); the leader enters as '$($entry.entrant_name)' (crew_id set: $($entry.crew_id -eq $crew.id)); twice refused ($twice)" (
    ($noCrew -match "pick the crew") -and ($m1Enters -match "leads") -and ($entry.entrant_name -eq "Proof Crew $stamp") -and ($entry.crew_id -eq $crew.id) -and ($twice -match "already"))

  # 11. THE BATTLE RECORD IS PUBLIC: a stranger reads the crew's entry and no other booking
  $anonEntries = Get-Rows $anonH "event_bookings?crew_id=eq.$($crew.id)&status=eq.booked&deleted_at=is.null&select=id,entrant_name,events(title)"
  $anonAll = Get-Rows $anonH "event_bookings?event_id=eq.$ev&select=id"
  Check 11 "A stranger reads the crew's $($anonEntries.Count) entry ('$($anonEntries[0].events.title)') and $($anonAll.Count) booking on the event in all (only the crew's)" (
    ($anonEntries.Count -eq 1) -and ($anonEntries[0].events.title -eq "Crew Battle $stamp") -and ($anonAll.Count -eq 1))

  # 12. STEP 21's DEBT, PART TWO - a duet partner is a PERSON on DanceOS, asked
  $typed = Fails { Rpc (Api $m1.token) "book_event" @{ p_event_id = $ev; p_kind = "participant"; p_format = "duo"; p_partner_name = "Somebody" } }
  $selfP = Fails { Rpc (Api $m1.token) "book_event" @{ p_event_id = $ev; p_kind = "participant"; p_format = "duo"; p_partner_id = $m1.id } }
  $duo = Rpc (Api $m1.token) "book_event" @{ p_event_id = $ev; p_kind = "participant"; p_format = "duo"; p_partner_id = $m2.id }
  Check 12 "A typed partner refused ($typed); yourself refused ($selfP); M1 enters with '$($duo.partner_name)' - partner_id set: $($duo.partner_id -eq $m2.id), status $($duo.partner_status)" (
    ($typed -match "needs your partner") -and ($selfP -match "somebody else") -and ($duo.partner_name -eq "Member Two $stamp") -and ($duo.partner_id -eq $m2.id) -and ($duo.partner_status -eq "asked"))

  # 13. THE PARTNER READS THE ENTRY THAT NAMES THEM AND ANSWERS IT; nobody else can
  $m2Sees = Get-Rows (Api $m2.token) "event_bookings?partner_id=eq.$($m2.id)&select=id,partner_status"
  $outSees = Get-Rows (Api $out.token) "event_bookings?id=eq.$($duo.id)&select=id"
  $outAnswers2 = Fails { Rpc (Api $out.token) "respond_to_partner_ask" @{ p_booking_id = $duo.id; p_accept = $true } }
  $m1Answers = Fails { Rpc (Api $m1.token) "respond_to_partner_ask" @{ p_booking_id = $duo.id; p_accept = $true } }
  Rpc (Api $m2.token) "respond_to_partner_ask" @{ p_booking_id = $duo.id; p_accept = $true } | Out-Null
  $duoNow = (Get-Rows (Api $m1.token) "event_bookings?id=eq.$($duo.id)&select=partner_status")[0]
  $again2 = Fails { Rpc (Api $m2.token) "respond_to_partner_ask" @{ p_booking_id = $duo.id; p_accept = $false } }
  Check 13 "M2 reads $($m2Sees.Count) entry naming them; a bystander reads $($outSees.Count) and cannot answer ($outAnswers2); the entrant cannot answer for them ($m1Answers); M2 confirms -> $($duoNow.partner_status); twice refused ($again2)" (
    ($m2Sees.Count -eq 1) -and ($outSees.Count -eq 0) -and ($outAnswers2 -match "not found") -and ($m1Answers -match "not found") -and ($duoNow.partner_status -eq "confirmed") -and ($again2 -match "already answered"))

  # 14. THE HUB'S TWO LISTS come off real rows: the leader leads 1 and is in 0; M1 leads 0 and is in 1
  $leadLeads = Get-Rows (Api $lead.token) "crews?leader_id=eq.$($lead.id)&deleted_at=is.null&select=id"
  $m1In = Get-Rows (Api $m1.token) "crew_members?user_id=eq.$($m1.id)&status=eq.confirmed&role=neq.leader&deleted_at=is.null&select=id"
  $leadIn = Get-Rows (Api $lead.token) "crew_members?user_id=eq.$($lead.id)&status=eq.confirmed&role=neq.leader&deleted_at=is.null&select=id"
  Check 14 "Leader: leads $($leadLeads.Count), in $($leadIn.Count); M1: in $($m1In.Count)" (
    ($leadLeads.Count -eq 1) -and ($leadIn.Count -eq 0) -and ($m1In.Count -eq 1))
}
finally {
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers $svcH | Out-Null
  foreach ($u in @($lead, $m1, $m2, $out, $owner)) {
    Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null
  }
  "   (cleanup: proof studio, crew and throwaway accounts deleted - the crew cascades with its leader)"
}

if ($pass) { "`nALL CREW CHECKS PASSED"; exit 0 } else { "`nCREW CHECKS FAILED"; exit 1 }
