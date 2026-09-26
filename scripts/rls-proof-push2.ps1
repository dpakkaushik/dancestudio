# Proof for PUSH 2 of 19 Sep 2026 - the five migrations 20260919130000 and
# 20260919140000 .. 20260919143000, as real roles against the live database.
# Mirrors the rolled-back dry run (dryrunF.js, 22/22) over PostgREST, so it runs
# ONLY on the migrated schema.
#
# The claims under test: an ORGANIZATION names people on its public page (asked,
# then confirmed; only the person asked answers; Owner / Team are labels; a private
# organization's team reaches nobody; no direct write) - keyed on the org BUSINESS
# since 26 Sep 2026, the organization login being retired; CALL IS A TOGGLE for an
# artist (public_artist hands a stranger the number only while the switch is on)
# and for a crew (the policy on crew_contacts IS the switch - off, neither a
# stranger nor a signed-in bystander reads it, the leader still does); a PUBLIC
# organization's page is a stranger's to read by its business id and a private
# one's is nobody's (set_my_place is dropped - the pin is the business row's); STATS FOR
# SOMEBODY ELSE'S PROFILE (entity_chart_row: a listed studio's, a public artist's
# and a live crew's row to a stranger, a plain user's to a signed-in reader only,
# an unlisted studio's to nobody; dance_chart still refuses a stranger and the
# ungated core is executable by no client role).
#
# ASCII ONLY (the 11 Sep 2026 lesson). Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-push2.ps1
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

. (Join-Path $PSScriptRoot "proof-lib.ps1")   # New-Studio / Subscribe-Studio / Assert-City / Publish-Class (see that file)

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
# 10 Sep 2026: a studio is born UNLISTED and goes public when ITS OWN subscription is live. The
# service role stands in for an admin's grant here - a granted, active row at Rs 0 - and lists it.
function Subscribe-Studio($tenantId) {
  $ownerRows = @(Invoke-RestMethod -Method Get -Uri "$base/rest/v1/business_members?business_id=eq.$tenantId&member_role=eq.owner&deleted_at=is.null&select=user_id" -Headers $svcH)
  $ownerId = [string]$ownerRows[0].user_id
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/subscriptions" -Headers $svcH -Body (@{
    kind = "studio"; user_id = $ownerId; business_id = $tenantId; plan_key = "studio_monthly"; price_inr = 0; period = "monthly"; status = "active"
    current_period_start = (Get-Date).ToString("yyyy-MM-dd"); current_period_end = (Get-Date).AddYears(1).ToString("yyyy-MM-dd"); granted = $true
    note = "Granted by a proof script - nothing charged"; created_by = $ownerId; updated_by = $ownerId } | ConvertTo-Json) | Out-Null
  # the badge and the listing are the service role's to give (the guard triggers read the JWT)
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$tenantId" -Headers $svcH -Body (@{ verified_at = [DateTime]::UtcNow.ToString("o") } | ConvertTo-Json) | Out-Null
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$tenantId" -Headers $svcH -Body (@{ visibility = "listed" } | ConvertTo-Json) | Out-Null
}
# the Artist plan as an admin's grant: granted, active, Rs 0
function Grant-ArtistPlan($userId) {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/subscriptions" -Headers $svcH -Body (@{
    kind = "artist"; user_id = $userId; plan_key = "artist_monthly"; price_inr = 0; period = "monthly"; status = "active"
    current_period_start = (Get-Date).ToString("yyyy-MM-dd"); current_period_end = (Get-Date).AddMonths(12).ToString("yyyy-MM-dd"); granted = $true
    note = "Granted by a proof script - nothing charged"; created_by = $userId; updated_by = $userId } | ConvertTo-Json) | Out-Null
}
# the person's door, with the switch as the last argument (null = leave it alone)
function Set-Profile($u, $phone, $phonePublic) {
  return Rpc (Api $u.token) "update_my_profile" @{ p_full_name = $u.name; p_city = "Pune"; p_age = $null; p_socials = @(); p_styles = @("Hip-Hop"); p_phone = $phone; p_contact_email = $null; p_phone_public = $phonePublic }
}
function Set-Crew($u, $crewId, $name, $phone, $phonePublic) {
  return Rpc (Api $u.token) "update_crew" @{ p_crew_id = $crewId; p_name = $name; p_city = "Pune"; p_style = "Hip-Hop"; p_contact_email = $null; p_phone = $phone; p_phone_public = $phonePublic }
}

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$org = New-EmailUser "p2-org-$stamp@example.com" "P2 Org $stamp" "user"
$private = New-EmailUser "p2-private-$stamp@example.com" "P2 Private Org $stamp" "user"
$lead = New-EmailUser "p2-lead-$stamp@example.com" "P2 Leader $stamp" "user"
$artist = New-EmailUser "p2-artist-$stamp@example.com" "P2 Artist $stamp" "user"
$fan = New-EmailUser "p2-fan-$stamp@example.com" "P2 Fan $stamp" "user"
Grant-ArtistPlan $artist.id
$studio = New-Studio $org.token "P2 Studio $stamp" "Kothrud" "Pune"
Subscribe-Studio ([string]$studio.id)
$studioId = [string]$studio.id
# 26 Sep 2026: an organization is a BUSINESS its owner opens (the login is retired). $org's is
# PUBLIC (its own GST number verified, its own mandate live - org_is_public); $private's has
# neither, which is what a private organization IS now. The team hangs off the business id.
$hostRow = [string](New-Org $org.token "P2 Org Business $stamp" "Pune").id
Verify-Org-Gst $org.token $hostRow "PTW$($stamp.Substring(1))" | Out-Null
Subscribe-Org $hostRow
$hostPriv = [string](New-Org $private.token "P2 Private Business $stamp" "Pune").id
$crew = $null
$crewId = $null

try {
  # -- the world a board can count: a class that ran yesterday at the studio, the artist teaching it, the fan on the floor --
  $cls = Insert "classes" @{ business_id = $studioId; title = "Hip-Hop . All levels"; style = "Hip-Hop"; level = "all"; price_inr = 0; capacity = 20; status = "draft"; created_by = $org.id; updated_by = $org.id }
  $clsId = [string]$cls.id
  Insert "class_people" @{ class_id = $clsId; business_id = $studioId; user_id = $artist.id; kind = "artist"; status = "confirmed"; created_by = $org.id; updated_by = $org.id } | Out-Null
  $ses = Insert "class_sessions" @{ class_id = $clsId; business_id = $studioId; starts_at = [DateTime]::UtcNow.AddHours(-25).ToString("o"); ends_at = [DateTime]::UtcNow.AddHours(-24).ToString("o"); created_by = $org.id; updated_by = $org.id }
  $sesId = [string]$ses.id
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/classes?id=eq.$clsId" -Headers $svcH -Body (@{ status = "published" } | ConvertTo-Json) | Out-Null
  $booking = Insert "class_bookings" @{ session_id = $sesId; class_id = $clsId; business_id = $studioId; user_id = $fan.id; status = "enrolled"; created_by = $fan.id; updated_by = $fan.id }
  Insert "attendance" @{ class_booking_id = [string]$booking.id; session_id = $sesId; class_id = $clsId; business_id = $studioId; user_id = $fan.id; created_by = $org.id; updated_by = $org.id } | Out-Null
  # a crew led by the leader (create_crew seats the leader confirmed)
  $crew = Rpc (Api $lead.token) "create_crew" @{ p_name = "P2 Crew $stamp"; p_city = "Pune"; p_style = "Hip-Hop"; p_member_ids = @() }
  $crewId = [string]$crew.id

  # -- A. THE ORGANIZATION'S TEAM ----------------------------------------------
  # 1. asked, not added; the person reads their ask, a bystander nothing, a stranger no team; the person was told
  $ask = Rpc (Api $org.token) "ask_organization_member" @{ p_org_id = $hostRow; p_user_id = $lead.id; p_role = "owner" }
  $memberId = [string]$ask.id
  $leadReads = Get-Rows (Api $lead.token) "organization_members?org_id=eq.$hostRow&select=id,status"
  $fanReads = Get-Rows (Api $fan.token) "organization_members?org_id=eq.$hostRow&select=id"
  $anonTeam0 = Rpc-Rows $anonH "public_organization_team" @{ p_org_id = $hostRow }
  $told = @(Get-Rows (Api $lead.token) "notifications?select=title&deleted_at=is.null&kind=eq.people" | Where-Object { $_.title -match "wants you on its team as owner" }).Count
  Check 1 "The organization asks the leader as owner (status $($ask.status), role $($ask.role)); they read their ask ($($leadReads.Count)); a bystander reads $($fanReads.Count); a stranger sees $($anonTeam0.Count) on the team; they were told ($told)" (
    ($ask.status -eq "asked") -and ($ask.role -eq "owner") -and ($leadReads.Count -eq 1) -and ($fanReads.Count -eq 0) -and ($anonTeam0.Count -eq 0) -and ($told -ge 1))

  # 2. only the person asked answers; confirmed, a stranger reads them as Owner; the organization was told
  $fanAnswers = Fails { Rpc (Api $fan.token) "respond_to_organization_ask" @{ p_member_id = $memberId; p_accept = $true } }
  Rpc (Api $lead.token) "respond_to_organization_ask" @{ p_member_id = $memberId; p_accept = $true } | Out-Null
  $anonTeam1 = Rpc-Rows $anonH "public_organization_team" @{ p_org_id = $hostRow }
  # "joined the team of {org}" since 26 Sep 2026 - the notification names the BUSINESS
  $orgTold = @(Get-Rows (Api $org.token) "notifications?select=title&deleted_at=is.null&kind=eq.people" | Where-Object { $_.title -match "joined the team of" }).Count
  Check 2 "A bystander cannot answer ($fanAnswers); the leader confirms and a stranger reads $($anonTeam1.Count) on the team - $($anonTeam1[0].full_name) as $($anonTeam1[0].role), is_artist $($anonTeam1[0].is_artist); the organization was told ($orgTold)" (
    ($fanAnswers -match "request not found") -and ($anonTeam1.Count -eq 1) -and ($anonTeam1[0].role -eq "owner") -and ($anonTeam1[0].full_name -eq $lead.name) -and ($anonTeam1[0].is_artist -eq $false) -and ($orgTold -ge 1))

  # 3. refused in words
  #    26 Sep 2026: "asking an ORGANIZATION" is DELETED - there is no organization
  #    login to ask any more; the private organization's owner is a person and a
  #    perfectly good team member. What replaces it: somebody who does not OWN the
  #    business cannot ask on its behalf (the lead asks, and is refused as not the owner).
  $again = Fails { Rpc (Api $org.token) "ask_organization_member" @{ p_org_id = $hostRow; p_user_id = $lead.id; p_role = "member" } }
  $userAsks = Fails { Rpc (Api $lead.token) "ask_organization_member" @{ p_org_id = $hostRow; p_user_id = $fan.id; p_role = "member" } }
  $badRole = Fails { Rpc (Api $org.token) "ask_organization_member" @{ p_org_id = $hostRow; p_user_id = $fan.id; p_role = "boss" } }
  $selfAsk = Fails { Rpc (Api $org.token) "ask_organization_member" @{ p_org_id = $hostRow; p_user_id = $org.id; p_role = "member" } }
  Check 3 "Asking twice ($again); somebody who is not the owner asking ($userAsks); an invented role ($badRole); the owner asking themselves ($selfAsk)" (
    # 20 Sep 2026: the ask offers THREE labels now (owner, event team, member) and
    # refuses studio_owner, which is a seat granted after a yes - so the sentence
    # is longer than "an owner or a member". It still names what may be asked.
    ($again -match "already") -and ($userAsks -match "owner") -and ($badRole -match "event team") -and ($selfAsk -match "own this organization"))

  # 4. a PRIVATE organization's confirmed team is nobody else's
  $privAsk = Rpc (Api $private.token) "ask_organization_member" @{ p_org_id = $hostPriv; p_user_id = $lead.id; p_role = "member" }
  Rpc (Api $lead.token) "respond_to_organization_ask" @{ p_member_id = [string]$privAsk.id; p_accept = $true } | Out-Null
  $anonPriv = Rpc-Rows $anonH "public_organization_team" @{ p_org_id = $hostPriv }
  $anonPrivTable = Get-Rows $anonH "organization_members?org_id=eq.$hostPriv&select=id"
  $privReads = Get-Rows (Api $private.token) "organization_members?org_id=eq.$hostPriv&select=id,status"
  Check 4 "A private organization's team: the definer read hands a stranger $($anonPriv.Count), the table $($anonPrivTable.Count); the organization reads its own ($($privReads.Count), $($privReads[0].status))" (
    ($anonPriv.Count -eq 0) -and ($anonPrivTable.Count -eq 0) -and ($privReads.Count -eq 1) -and ($privReads[0].status -eq "confirmed"))

  # 5. relabel; a bystander cannot remove; the person may leave (soft); no direct insert even for the organization
  Rpc (Api $private.token) "set_organization_member_role" @{ p_member_id = [string]$privAsk.id; p_role = "owner" } | Out-Null
  $relabelled = @(Get-Rows $svcH "organization_members?id=eq.$($privAsk.id)&select=role")[0]
  $fanRemoves = Fails { Rpc (Api $fan.token) "remove_organization_member" @{ p_member_id = [string]$privAsk.id } }
  Rpc (Api $lead.token) "remove_organization_member" @{ p_member_id = [string]$privAsk.id } | Out-Null
  $left = @(Get-Rows $svcH "organization_members?id=eq.$($privAsk.id)&select=deleted_at")[0]
  $direct = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/organization_members" -Headers (Api $org.token) -Body (@{ org_id = $hostRow; user_id = $fan.id } | ConvertTo-Json) }
  Check 5 "Relabelled to $($relabelled.role); a bystander cannot remove ($fanRemoves); the person leaves and the row is kept, deleted ($([bool]$left.deleted_at)); a direct insert is refused ($([bool]$direct))" (
    ($relabelled.role -eq "owner") -and ($fanRemoves -match "only the organization") -and ($null -ne $left.deleted_at) -and ($direct -ne ""))

  # -- B. CALL IS A TOGGLE ------------------------------------------------------
  # 6. an artist's switch
  Set-Profile $artist "+91 98765 43210" $true | Out-Null
  $pubOn = Rpc-Rows $anonH "public_artist" @{ p_user_id = $artist.id }
  Set-Profile $artist "+91 98765 43210" $false | Out-Null
  $pubOff = Rpc-Rows $anonH "public_artist" @{ p_user_id = $artist.id }
  $rowB = @(Get-Rows $svcH "profiles?id=eq.$($artist.id)&select=phone,phone_public")[0]
  Set-Profile $artist "+91 98765 43210" $null | Out-Null
  $rowB2 = @(Get-Rows $svcH "profiles?id=eq.$($artist.id)&select=phone_public")[0]
  Check 6 "Switch on: a stranger reads the number off public_artist ($($pubOn[0].phone)); off: they read none ('$($pubOff[0].phone)') while the record keeps it ($($rowB.phone), public $($rowB.phone_public)); null leaves the switch alone ($($rowB2.phone_public))" (
    ($pubOn.Count -eq 1) -and ($pubOn[0].phone -eq "+91 98765 43210") -and ($pubOff.Count -eq 1) -and ($null -eq $pubOff[0].phone) -and ($rowB.phone -eq "+91 98765 43210") -and ($rowB.phone_public -eq $false) -and ($rowB2.phone_public -eq $false))

  # 7. a crew's number - the policy is the switch
  Set-Crew $lead $crewId $crew.name "+91 91234 56789" $true | Out-Null
  $anonOn = Get-Rows $anonH "crew_contacts?crew_id=eq.$crewId&select=phone"
  $fanOn = Get-Rows (Api $fan.token) "crew_contacts?crew_id=eq.$crewId&select=phone"
  Set-Crew $lead $crewId $crew.name $null $false | Out-Null
  $anonOff = Get-Rows $anonH "crew_contacts?crew_id=eq.$crewId&select=phone"
  $fanOff = Get-Rows (Api $fan.token) "crew_contacts?crew_id=eq.$crewId&select=phone"
  $leaderReads = Get-Rows (Api $lead.token) "crew_contacts?crew_id=eq.$crewId&select=phone,phone_public"
  $badPhone = Fails { Set-Crew $lead $crewId $crew.name "abc" $null }
  $fanEdits = Fails { Set-Crew $fan $crewId $crew.name "+91 90000 00000" $true }
  $oldShape = Rpc (Api $lead.token) "update_crew" @{ p_crew_id = $crewId; p_name = $crew.name; p_city = "Pune"; p_style = "Hip-Hop" }
  Check 7 "On: a stranger reads $($anonOn.Count) ($($anonOn[0].phone)), a bystander $($fanOn.Count); off: a stranger $($anonOff.Count), a bystander $($fanOff.Count), the leader $($leaderReads.Count) ($($leaderReads[0].phone), public $($leaderReads[0].phone_public)); a bad number ($badPhone); a non-leader ($fanEdits); the old four-argument call still resolves ($([bool]$oldShape))" (
    ($anonOn.Count -eq 1) -and ($anonOn[0].phone -eq "+91 91234 56789") -and ($fanOn.Count -eq 1) -and ($anonOff.Count -eq 0) -and ($fanOff.Count -eq 0) -and ($leaderReads.Count -eq 1) -and ($leaderReads[0].phone -eq "+91 91234 56789") -and ($leaderReads[0].phone_public -eq $false) -and ($badPhone -match "8 to 18 digits") -and ($fanEdits -match "leader") -and ($null -ne $oldShape))

  # 8. no direct write on crew_contacts, even by the leader
  $directContact = Fails { Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/crew_contacts?crew_id=eq.$crewId" -Headers (Api $lead.token) -Body (@{ phone_public = $true } | ConvertTo-Json) }
  $stillOff = @(Get-Rows $svcH "crew_contacts?crew_id=eq.$crewId&select=phone_public")[0]
  Check 8 "A direct PATCH by the leader changes nothing (refused: $([bool]$directContact); still public $($stillOff.phone_public))" (
    ($stillOff.phone_public -eq $false))

  # -- C. AN ORGANIZATION'S PLACE ----------------------------------------------
  # 9. DELETED 26 Sep 2026: `set_my_place` is DROPPED with the organization login
  #    (20260926120000) - an organization's pin is its BUSINESS row's now, the same
  #    `lat/lng/location_set_at` a studio carries, and public_organization reads it
  #    off the business. What is kept of the old check is the half that is about
  #    the PAGE, not the door: a stranger reads a public organization's page by its
  #    business id, and a private one's page reaches nobody.
  $pubOrg = Rpc-Rows $anonH "public_organization" @{ p_org_id = $hostRow }
  Check 9 "A stranger reads the public organization's page by its business id ($($pubOrg.Count) row, host $($pubOrg[0].host_business_id -eq $hostRow), verified $($pubOrg[0].verified))" (
    ($pubOrg.Count -eq 1) -and ([string]$pubOrg[0].host_business_id -eq $hostRow) -and ($pubOrg[0].verified -eq $true))

  # 10. a private organization's page reaches nobody (no GST number, no mandate)
  $privPub = Rpc-Rows $anonH "public_organization" @{ p_org_id = $hostPriv }
  Check 10 "A private organization's page: public_organization hands a stranger $($privPub.Count) rows" ($privPub.Count -eq 0)

  # -- D. STATS FOR SOMEBODY ELSE'S PROFILE ------------------------------------
  # 11. the board still refuses a stranger; the ungated core is executable by no client role
  $anonBoard = Fails { Rpc $anonH "dance_chart" @{ p_segment = "studio" } }
  $anonCore = Fails { Rpc $anonH "dance_chart_all" @{ p_segment = "studio" } }
  $authCore = Fails { Rpc (Api $lead.token) "dance_chart_all" @{ p_segment = "studio" } }
  Check 11 "dance_chart refuses a stranger ($anonBoard); dance_chart_all refuses anon ($anonCore) and a signed-in caller ($authCore)" (
    ($anonBoard -ne "") -and ($anonCore -match "permission denied|not find") -and ($authCore -match "permission denied|not find"))

  # 12. a stranger reads a LISTED studio's row, nationally and in its city
  $studioRow = Rpc-Rows $anonH "entity_chart_row" @{ p_segment = "studio"; p_id = $studioId }
  $studioCity = Rpc-Rows $anonH "entity_chart_row" @{ p_segment = "studio"; p_id = $studioId; p_city = "Pune" }
  Check 12 "The studio's row to a stranger: $($studioRow[0].conducted) session held, $($studioRow[0].extra) on the floor, #$($studioRow[0].place) of $($studioRow[0].population) nationally; in Pune #$($studioCity[0].place) of $($studioCity[0].population)" (
    ($studioRow.Count -eq 1) -and ([int]$studioRow[0].conducted -eq 1) -and ([int]$studioRow[0].extra -eq 1) -and ([int]$studioRow[0].place -ge 1) -and ([int]$studioRow[0].population -ge 1) -and ($studioCity.Count -eq 1) -and ([int]$studioCity[0].population -le [int]$studioRow[0].population))

  # 13. an ARTIST's and a live CREW's row to a stranger; a plain user's to a signed-in reader only
  $artistRow = Rpc-Rows $anonH "entity_chart_row" @{ p_segment = "artist"; p_id = $artist.id }
  $plainRow = Rpc-Rows $anonH "entity_chart_row" @{ p_segment = "dancer"; p_id = $fan.id }
  $plainSigned = Rpc-Rows (Api $lead.token) "entity_chart_row" @{ p_segment = "dancer"; p_id = $fan.id }
  $crewRow = Rpc-Rows $anonH "entity_chart_row" @{ p_segment = "crew"; p_id = $crewId }
  Check 13 "A stranger reads the artist's row ($($artistRow.Count), conducted $($artistRow[0].conducted)) and the crew's ($($crewRow.Count), $($crewRow[0].extra) member); NOTHING for a plain user ($($plainRow.Count)), whose row a signed-in reader gets ($($plainSigned.Count), attended $($plainSigned[0].attended))" (
    ($artistRow.Count -eq 1) -and ([int]$artistRow[0].conducted -eq 1) -and ($plainRow.Count -eq 0) -and ($plainSigned.Count -eq 1) -and ([int]$plainSigned[0].attended -eq 1) -and ($crewRow.Count -eq 1) -and ([int]$crewRow[0].extra -eq 1))

  # 14. an UNLISTED studio's row is nobody's to read signed out; the signed-in board still lists the artist; an invented segment is refused
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$studioId" -Headers $svcH -Body (@{ visibility = "unlisted" } | ConvertTo-Json) | Out-Null
  $hidden = Rpc-Rows $anonH "entity_chart_row" @{ p_segment = "studio"; p_id = $studioId }
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$studioId" -Headers $svcH -Body (@{ visibility = "listed" } | ConvertTo-Json) | Out-Null
  $board = Rpc-Rows (Api $lead.token) "dance_chart" @{ p_segment = "artist"; p_city = "Pune" }
  $onBoard = @($board | Where-Object { $_.id -eq $artist.id }).Count
  $bad = Fails { Rpc $anonH "entity_chart_row" @{ p_segment = "gods"; p_id = $artist.id } }
  Check 14 "Unlisted, the studio's row reaches a stranger $($hidden.Count) times; the signed-in artist board lists the artist ($onBoard); an invented segment is refused ($bad)" (
    ($hidden.Count -eq 0) -and ($onBoard -eq 1) -and ($bad -match "unknown chart"))
}
finally {
  if ($crewId) {
    Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/crew_header_photos?crew_id=eq.$crewId" -Headers $svcH | Out-Null
    Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/crews?id=eq.$crewId" -Headers $svcH | Out-Null
  }
  # the studio and the two org businesses go BEFORE their owners (26 Sep 2026)
  foreach ($bid in @($studioId, $hostRow, $hostPriv)) {
    if ($bid) { try { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/businesses?id=eq.$bid" -Headers $svcH | Out-Null } catch {} }
  }
  foreach ($u in @($org, $private, $lead, $artist, $fan)) {
    if ($u) { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null }
  }
  "   (cleanup: proof studio, the two org businesses, crew and throwaway accounts deleted)"
}

if ($pass) { "`nALL PUSH 2 CHECKS PASSED"; exit 0 } else { "`nPUSH 2 CHECKS FAILED"; exit 1 }
