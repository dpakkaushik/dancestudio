# Proof for 20260920100000_the_team_by_profile_type (20 Sep 2026), as real roles
# against the live database. Runs ONLY on the migrated schema.
#
# !! THIS MIGRATION HAD NO ROLLED-BACK DRY RUN (no pg module in this tree), so
# this script IS its cover. Rule 9: check 5 grants a REAL OWNER SEAT on a studio.
#
# The claims under test:
#   * `assistant` is a seat BOTH tables admit - business_members and the table
#     that FEEDS it, business_invites (the 19 Sep bug, one day old, not repeated)
#   * an organization's three labels (owner, event team, member), keyed on the
#     org BUSINESS since 26 Sep 2026 (the organization login is retired); the
#     `studio_owner` label and its seat grant are GONE - an organization runs no
#     studios - so the grant checks (5, 7, 8) are inverted or deleted below
#   * `public_organization_team` prints Owner / Event team to a stranger and
#     leaves a plain `member` OUT
#   * `public_studio_team` carries assistants
#   * `person_associations` names listed businesses only, never a `staff` seat,
#     and answers a STRANGER for an artist alone
#
# ASCII ONLY (the 11 Sep 2026 lesson). Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-org-team.ps1
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

. (Join-Path $PSScriptRoot "proof-lib.ps1")   # New-Studio / Subscribe-Studio / Assert-City

function Api($token) { return @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" } }
function Rpc($headers, $fn, $body) {
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body ($body | ConvertTo-Json -Depth 8)
}
# an RPC's rows counted off the raw text - PowerShell 5.1 reads a JSON [] as one item
function Rpc-Rows($headers, $fn, $body) {
  $res = Invoke-WebRequest -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body ($body | ConvertTo-Json -Depth 8) -UseBasicParsing
  if ($res.Content.Trim() -eq "[]") { return ,@() }
  return ,@(($res.Content | ConvertFrom-Json) | Where-Object { $null -ne $_ })
}
function Get-Rows($headers, $path) {
  $res = Invoke-WebRequest -Method Get -Uri "$base/rest/v1/$path" -Headers $headers -UseBasicParsing
  if ($res.Content.Trim() -eq "[]") { return ,@() }
  return ,@(($res.Content | ConvertFrom-Json) | Where-Object { $null -ne $_ })
}
function Insert($path, $body) {
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/$path" -Headers $svcH -Body ($body | ConvertTo-Json -Depth 8)
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
  $styles = @()
  if ($role -eq "user") { $styles = @("Hip-Hop") }
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/profiles" -Headers $svcH -Body (@{
    id = $u.id; full_name = $name; role = $role; city = "Pune"; styles = $styles; created_by = $u.id; updated_by = $u.id } | ConvertTo-Json) | Out-Null
  # 26 Sep 2026: the organization LOGIN is retired - every account here is a person
  $tok = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $anonH -Body (@{
    email = $email; password = "Proof-passw0rd!" } | ConvertTo-Json)
  return [pscustomobject]@{ id = $u.id; email = $email; name = $name; token = $tok.access_token }
}
function Grant-ArtistPlan($userId) {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/subscriptions" -Headers $svcH -Body (@{
    kind = "artist"; user_id = $userId; plan_key = "artist_monthly"; price_inr = 0; period = "monthly"; status = "active"
    current_period_start = (Get-Date).ToString("yyyy-MM-dd"); current_period_end = (Get-Date).AddMonths(12).ToString("yyyy-MM-dd"); granted = $true
    note = "Granted by a proof script - nothing charged"; created_by = $userId; updated_by = $userId } | ConvertTo-Json) | Out-Null
}
# owner rows on a business, live only
function Owners($businessId) {
  return Get-Rows $svcH "business_members?business_id=eq.$businessId&member_role=eq.owner&deleted_at=is.null&select=user_id"
}

Assert-City "Pune"

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$org = New-EmailUser "orgteam-org-$stamp@example.com" "OrgTeam Org $stamp" "user"
$boss = New-EmailUser "orgteam-boss-$stamp@example.com" "OrgTeam Boss $stamp" "user"
$hand = New-EmailUser "orgteam-hand-$stamp@example.com" "OrgTeam Hand $stamp" "user"
$artist = New-EmailUser "orgteam-artist-$stamp@example.com" "OrgTeam Artist $stamp" "user"
$fan = New-EmailUser "orgteam-fan-$stamp@example.com" "OrgTeam Fan $stamp" "user"
Grant-ArtistPlan $artist.id
$studio = New-Studio $org.token "OrgTeam Studio $stamp" "Kothrud" "Pune"
$studioId = [string]$studio.id
Subscribe-Studio $studioId
# 26 Sep 2026: the organization is a BUSINESS $org opens (the login is retired), PUBLIC through its
# own GST number and its own mandate - which is what lets a stranger read its team below
$orgId = [string](New-Org $org.token "OrgTeam Org Business $stamp" "Pune").id
Verify-Org-Gst $org.token $orgId "OTM$($stamp.Substring(1))" | Out-Null
Subscribe-Org $orgId

try {
  # -- 1. `assistant` IS A SEAT, AND SO IS THE INVITE THAT CARRIES IT ------------
  # The 19 Sep bug in one line: a value added to one table's vocabulary does not
  # reach the tables that FEED it. Both are asserted, and both are cleaned up.
  $seat = Insert "business_members" @{ business_id = $studioId; user_id = $artist.id; member_role = "assistant"; created_by = $org.id; updated_by = $org.id }
  $invite = Insert "business_invites" @{ business_id = $studioId; user_id = $fan.id; member_role = "assistant"; code = "orgt$stamp"; name = "OrgTeam Probe"; created_by = $org.id; updated_by = $org.id }
  $bogus = Fails { Insert "business_members" @{ business_id = $studioId; user_id = $fan.id; member_role = "chief"; created_by = $org.id; updated_by = $org.id } }
  Check 1 "A studio seats an assistant and INVITES one - both tables admit the word; an invented seat is refused ($bogus)" (
    ($seat.member_role -eq "assistant") -and ($invite.member_role -eq "assistant") -and ($bogus -ne ""))
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/business_invites?id=eq.$([string]$invite.id)" -Headers $svcH | Out-Null

  # -- 2. THE ASK OFFERS THREE LABELS, NEVER studio_owner ------------------------
  # (26 Sep 2026: an organization runs NO studios, so studio_owner is refused for
  # good rather than deferred to a yes; the ask is keyed on the org business)
  $askStudioOwner = Fails { Rpc (Api $org.token) "ask_organization_member" @{ p_org_id = $orgId; p_user_id = $boss.id; p_role = "studio_owner" } }
  $ask = Rpc (Api $org.token) "ask_organization_member" @{ p_org_id = $orgId; p_user_id = $boss.id; p_role = "event_team" }
  $memberId = [string]$ask.id
  $askNonsense = Fails { Rpc (Api $org.token) "ask_organization_member" @{ p_org_id = $orgId; p_user_id = $hand.id; p_role = "chief" } }
  Check 2 "studio_owner cannot be ASKED ($askStudioOwner); event_team can (status $($ask.status)); an invented label is refused ($askNonsense)" (
    ($askStudioOwner -ne "") -and ($ask.status -eq "asked") -and ($ask.role -eq "event_team") -and ($askNonsense -ne ""))

  # -- 3. ONLY THE PERSON ASKED ANSWERS, AND ONLY THE ORGANIZATION RELABELS -------
  $fanAnswers = Fails { Rpc (Api $fan.token) "respond_to_organization_ask" @{ p_member_id = $memberId; p_accept = $true } }
  Rpc (Api $boss.token) "respond_to_organization_ask" @{ p_member_id = $memberId; p_accept = $true } | Out-Null
  $fanRelabels = Fails { Rpc (Api $fan.token) "set_organization_member_role" @{ p_member_id = $memberId; p_role = "owner"; p_business_id = $null } }
  Check 3 "A bystander cannot answer ($fanAnswers) and cannot relabel ($fanRelabels); the person asked confirms" (
    ($fanAnswers -ne "") -and ($fanRelabels -ne ""))

  # -- 4. studio_owner IS NOT A LABEL ANY MORE, AND A STUDIO IS NEVER NAMED ------
  # !! INVERTED 26 Sep 2026: an organization runs NO studios (20260926120000), so
  # `set_organization_member_role` refuses studio_owner outright and refuses ANY
  # label carrying a p_business_id - where it used to grant a real owner seat on
  # the studio named. The seat the grant used to write is asserted NOT to appear.
  $before = (Owners $studioId).Count
  $studioOwner = Fails { Rpc (Api $org.token) "set_organization_member_role" @{ p_member_id = $memberId; p_role = "studio_owner"; p_business_id = $studioId } }
  $memberWithStudio = Fails { Rpc (Api $org.token) "set_organization_member_role" @{ p_member_id = $memberId; p_role = "member"; p_business_id = $studioId } }
  $after = (Owners $studioId)
  $seated = @($after | Where-Object { [string]$_.user_id -eq $boss.id }).Count
  Check 4 "studio_owner is refused ($studioOwner); a label WITH a studio is refused ($memberWithStudio); the studio's owners are still $($after.Count) of $before and the boss is seated $seated times" (
    ($studioOwner -match "owner, event team or a member") -and ($memberWithStudio -match "studio") -and ($after.Count -eq $before) -and ($seated -eq 0))

  # -- 5. DELETED 26 Sep 2026: "the grant writes a REAL OWNER SEAT, idempotently" -
  #       there is no grant; an organization runs no studios. Check 4 is its inverse.

  # -- 6. A STRANGER READS THE PUBLISHED LABELS AND NOT `member` -----------------
  $askHand = Rpc (Api $org.token) "ask_organization_member" @{ p_org_id = $orgId; p_user_id = $hand.id; p_role = "member" }
  Rpc (Api $hand.token) "respond_to_organization_ask" @{ p_member_id = [string]$askHand.id; p_accept = $true } | Out-Null
  $team = Rpc-Rows $anonH "public_organization_team" @{ p_org_id = $orgId }
  $bossRow = @($team | Where-Object { [string]$_.user_id -eq $boss.id })[0]
  $handRows = @($team | Where-Object { [string]$_.user_id -eq $hand.id }).Count
  Check 6 "A stranger reads $($team.Count) named on the org business: the boss as $($bossRow.role); an Other team member appears $handRows times" (
    ($team.Count -eq 1) -and ($bossRow.role -eq "event_team") -and ($handRows -eq 0))

  # -- 7. RELABELLING IS A WORD, AND ONLY A WORD --------------------------------
  # (26 Sep 2026: there is no seat to take back; the label moves and the studio's
  # owner rows do not)
  Rpc (Api $org.token) "set_organization_member_role" @{ p_member_id = $memberId; p_role = "owner"; p_business_id = $null } | Out-Null
  $relabelled = @(Get-Rows $svcH "organization_members?id=eq.$memberId&select=role,business_id")[0]
  $afterBack = (Owners $studioId)
  Check 7 "Relabelling to Owner moves the word ($($relabelled.role), no studio: $($null -eq $relabelled.business_id)) and the studio's owners stay $($afterBack.Count) of $before" (
    ($relabelled.role -eq "owner") -and ($null -eq $relabelled.business_id) -and ($afterBack.Count -eq $before))
  Rpc (Api $org.token) "set_organization_member_role" @{ p_member_id = $memberId; p_role = "event_team"; p_business_id = $null } | Out-Null

  # -- 8. DELETED 26 Sep 2026: "the grant never removes the last owner" - no grant,
  #       no seat, nothing to remove. The last-owner rule itself is rls-proof-staff's.
  $soloId = $null

  # -- 9. A STUDIO'S PUBLIC TEAM CARRIES ASSISTANTS ------------------------------
  $studioTeam = Rpc-Rows $anonH "public_studio_team" @{ p_business_id = $studioId }
  $assistantRows = @($studioTeam | Where-Object { $_.member_role -eq "assistant" })
  Check 9 "A stranger reads the studio's team ($($studioTeam.Count)) with the assistant among them ($($assistantRows.Count))" (
    ($studioTeam.Count -ge 1) -and ($assistantRows.Count -eq 1) -and ($assistantRows[0].full_name -eq $artist.name))

  # -- 10. person_associations: SEATS, NOT CLASSES -------------------------------
  # the artist holds an `assistant` seat on a LISTED studio and has taught nothing
  $assocSigned = Rpc-Rows (Api $fan.token) "person_associations" @{ p_user_id = $artist.id }
  $assocAnon = Rpc-Rows $anonH "person_associations" @{ p_user_id = $artist.id }
  $teaches = Rpc-Rows (Api $fan.token) "person_teaches_at" @{ p_user_id = $artist.id }
  $row = @($assocSigned | Where-Object { [string]$_.business_id -eq $studioId })[0]
  Check 10 "A seat is not a class: the artist is associated with $($assocSigned.Count) and teaches at $($teaches.Count); the row says $($row.member_role) at '$($row.business_name)' and carries its owner ($([bool]$row.owner_id)); a stranger reads an ARTIST's ($($assocAnon.Count))" (
    ($assocSigned.Count -eq 1) -and ($teaches.Count -eq 0) -and ($row.member_role -eq "assistant") -and ($null -ne $row.owner_id) -and ($assocAnon.Count -eq 1))

  # -- 11. A `staff` SEAT IS NEVER AN ASSOCIATION, AND AN UNLISTED STUDIO NEVER ---
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/business_members?business_id=eq.$studioId&user_id=eq.$($artist.id)" -Headers $svcH -Body (@{ member_role = "staff" } | ConvertTo-Json) | Out-Null
  $assocStaff = Rpc-Rows (Api $fan.token) "person_associations" @{ p_user_id = $artist.id }
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/business_members?business_id=eq.$studioId&user_id=eq.$($artist.id)" -Headers $svcH -Body (@{ member_role = "trainer" } | ConvertTo-Json) | Out-Null
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$studioId" -Headers $svcH -Body (@{ visibility = "unlisted" } | ConvertTo-Json) | Out-Null
  $assocUnlisted = Rpc-Rows (Api $fan.token) "person_associations" @{ p_user_id = $artist.id }
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$studioId" -Headers $svcH -Body (@{ visibility = "listed" } | ConvertTo-Json) | Out-Null
  # !! AND THE SAME RULE AT THE CEILING, WHICH IS WHERE IT WAS NOT KEPT (20 Sep 2026).
  # `public_organization_team` has always left `member` out; the TABLE POLICY beside
  # it did not, so a plain GET /organization_members handed a stranger the
  # front-desk seat the page hides - found by scripts/stranger-smoke.ps1 on its
  # first run, closed by 20260920150000. RLS IS THE CEILING: a rule kept only in
  # the definer read is kept only at the door you went in by.
  Rpc (Api $org.token) "set_organization_member_role" @{ p_member_id = $memberId; p_role = "member"; p_business_id = $null } | Out-Null
  $anonMembers = Get-Rows $anonH "organization_members?org_id=eq.$orgId&select=role"
  $anonFrontDesk = Get-Rows $anonH "organization_members?org_id=eq.$orgId&role=eq.member&select=role"
  $ownMembers = Get-Rows (Api $org.token) "organization_members?org_id=eq.$orgId&role=eq.member&select=role"
  Check 11 "A front-desk seat is not a public association ($($assocStaff.Count)); an unlisted studio is named to nobody ($($assocUnlisted.Count)); a STRANGER reads $($anonFrontDesk.Count) front-desk rows off the table itself while the organization reads its own ($($ownMembers.Count))" (
    ($assocStaff.Count -eq 0) -and ($assocUnlisted.Count -eq 0) -and
    ($anonFrontDesk.Count -eq 0) -and ($anonMembers.Count -eq 0) -and ($ownMembers.Count -ge 1))

  # -- 12. A PLAIN USER'S SEATS ARE NOT A STRANGER'S TO READ ---------------------
  Insert "business_members" @{ business_id = $studioId; user_id = $fan.id; member_role = "trainer"; created_by = $org.id; updated_by = $org.id } | Out-Null
  $fanToStranger = Rpc-Rows $anonH "person_associations" @{ p_user_id = $fan.id }
  $fanToSignedIn = Rpc-Rows (Api $boss.token) "person_associations" @{ p_user_id = $fan.id }
  $noDirect = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/organization_members" -Headers (Api $fan.token) -Body (@{ org_id = $orgId; user_id = $fan.id; role = "owner" } | ConvertTo-Json) }
  Check 12 "A plain user's seats reach a stranger $($fanToStranger.Count) times and a signed-in reader $($fanToSignedIn.Count); nobody writes organization_members directly ($noDirect)" (
    ($fanToStranger.Count -eq 0) -and ($fanToSignedIn.Count -eq 1) -and ($noDirect -ne ""))

  # -- 13. AN ASK THROUGH THE PICKER STILL CARRIES ITS CODE ---------------------
  # !! 20260920100000 re-typed invite_person_to_business and lost the code, which
  # is NOT NULL - so EVERY ask through the people picker answered a constraint
  # violation. Found by the happy path, fixed by 20260920120000. The code is the
  # QR and the link, and asking twice is still refused rather than re-coded.
  $asked = Rpc (Api $org.token) "invite_person_to_business" @{ p_business_id = $studioId; p_user_id = $hand.id; p_role = "assistant" }
  $twiceAsked = Fails { Rpc (Api $org.token) "invite_person_to_business" @{ p_business_id = $studioId; p_user_id = $hand.id; p_role = "assistant" } }
  $asOwner = Fails { Rpc (Api $org.token) "invite_person_to_business" @{ p_business_id = $studioId; p_user_id = $boss.id; p_role = "owner" } }
  Check 13 "An ask carries a code ('$($asked.code)', $($asked.member_role)); asking again is refused ($twiceAsked); owner is not a seat that can be given away ($asOwner)" (
    ($asked.code) -and ($asked.code.Length -ge 6) -and ($asked.member_role -eq "assistant") -and ($twiceAsked -match "already been asked") -and ($asOwner -match "not a seat"))

  if ($pass) { "ALL ORG TEAM CHECKS PASSED" } else { "-- FAIL: see above" }
}
finally {
  # the businesses first - the studio AND the org business (a business whose owner is gone is the #0aa pile growing back)
  foreach ($id in @($studioId, $orgId, $soloId)) {
    if ($id) { try { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/businesses?id=eq.$id" -Headers $svcH | Out-Null } catch {} }
  }
  foreach ($u in @($org, $boss, $hand, $artist, $fan)) {
    if ($u) { try { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null } catch {} }
  }
}
