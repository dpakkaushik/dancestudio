# Proof for the profile-page re-cut of 19 Sep 2026 - the five migrations
# 20260919120000 .. 20260919124000, as real roles against the live database.
#
# The claims under test: a CREW can be followed (one door, idempotent; not by an
# organization, not by its own leader or members; a stranger reads the count and
# the leader reads who); a PUBLIC organization can be followed while a private one
# cannot, and an organization account still follows nobody; an ORGANIZATION takes
# an enquiry through its hosting row for a celebration, a corporate show or a
# collaboration and nothing else; a CONTACT EMAIL lands on a profile, a business
# and a crew through the three doors, is refused when it is not an address,
# clears on an empty string, and reaches a stranger through public_organization
# and public_artist; a listed studio's TEAM (owner, faculty, visiting faculty) is a
# stranger's to read and an unlisted one's is its members' alone; header pictures
# are capped by KIND (a user one, an artist five, an organization ten); a crew's
# header is the leader's to add (five at most, in the crew's own folder) and
# anybody's to read, with no direct write anywhere.
#
# ASCII ONLY (the 11 Sep 2026 lesson). Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-profile-pages.ps1
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
  if ($role -eq "org") {
    # 8 Sep 2026: a studio is public only under a VERIFIED organization - the service role stands in for the admin here
    Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/profiles?id=eq.$($u.id)" -Headers $svcH -Body (@{ verified_at = [DateTime]::UtcNow.ToString("o") } | ConvertTo-Json) | Out-Null
  }
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
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$tenantId" -Headers $svcH -Body (@{ visibility = "listed" } | ConvertTo-Json) | Out-Null
}
# the Artist plan as an admin's grant (the enquiries proof's helper): granted, active, Rs 0
function Grant-ArtistPlan($userId) {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/subscriptions" -Headers $svcH -Body (@{
    kind = "artist"; user_id = $userId; plan_key = "artist_monthly"; price_inr = 0; period = "monthly"; status = "active"
    current_period_start = (Get-Date).ToString("yyyy-MM-dd"); current_period_end = (Get-Date).AddMonths(12).ToString("yyyy-MM-dd"); granted = $true
    note = "Granted by a proof script - nothing charged"; created_by = $userId; updated_by = $userId } | ConvertTo-Json) | Out-Null
}
$in10 = (Get-Date).AddDays(10).ToString("yyyy-MM-dd")

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$org = New-EmailUser "prof-org-$stamp@example.com" "Prof Org $stamp" "org"
$private = New-EmailUser "prof-private-$stamp@example.com" "Prof Private Org $stamp" "org"
# a PRIVATE organization: the tick taken off again, no GST, no listed studio
Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/profiles?id=eq.$($private.id)" -Headers $svcH -Body (@{ verified_at = $null } | ConvertTo-Json) | Out-Null
$lead = New-EmailUser "prof-lead-$stamp@example.com" "Prof Lead $stamp" "user"
$member = New-EmailUser "prof-member-$stamp@example.com" "Prof Member $stamp" "user"
$fan = New-EmailUser "prof-fan-$stamp@example.com" "Prof Fan $stamp" "user"
$artist = New-EmailUser "prof-artist-$stamp@example.com" "Prof Artist $stamp" "user"
Grant-ArtistPlan $artist.id
$studio = Rpc (Api $org.token) "create_business_with_owner" @{ p_name = "Prof Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune"; p_styles = @("Hip-Hop") }
Subscribe-Studio ([string]$studio.id)
# the organization's hosting row (R15) - what an enquiry to it is sent to
# ($host is PowerShell's READ-ONLY automatic variable, like $pid - never a name here)
$hostRow = [string](Rpc (Api $org.token) "my_org_business" @{})
$hostPriv = [string](Rpc (Api $private.token) "my_org_business" @{})

try {
  # -- A CREW CAN BE FOLLOWED ---------------------------------------------------
  $crew = Rpc (Api $lead.token) "create_crew" @{ p_name = "Prof Crew $stamp"; p_city = "Pune"; p_style = "Hip-Hop"; p_member_ids = @($member.id) }
  $ask = @(Get-Rows (Api $lead.token) "crew_members?crew_id=eq.$($crew.id)&user_id=eq.$($member.id)&select=id")[0]
  Rpc (Api $member.token) "respond_to_crew_ask" @{ p_member_id = $ask.id; p_accept = $true } | Out-Null

  # 1. one door, idempotent, and the count is a stranger's to read
  $c1 = Rpc (Api $fan.token) "set_crew_follow" @{ p_crew_id = $crew.id; p_on = $true }
  $c1b = Rpc (Api $fan.token) "set_crew_follow" @{ p_crew_id = $crew.id; p_on = $true }
  # Rpc-Rows already hands back ONE array (the leading comma stops PowerShell unrolling it);
  # wrapping it in @() again NESTS it, and .Count reads 1 whatever came back
  $anonCount = Rpc-Rows $anonH "crew_follower_counts" @{ p_crew_ids = @($crew.id) }
  $anonN = 0; foreach ($r in $anonCount) { if ($r.crew_id -eq $crew.id) { $anonN = [int]$r.followers } }
  Check 1 "The fan follows the crew: following $($c1.following), $($c1.followers) follower; again still $($c1b.followers); a stranger reads the count $anonN" (
    ($c1.following -eq $true) -and ([int]$c1.followers -eq 1) -and ([int]$c1b.followers -eq 1) -and ($anonN -eq 1))

  # 2. not by the crew itself, not by an organization
  $byLead = Fails { Rpc (Api $lead.token) "set_crew_follow" @{ p_crew_id = $crew.id; p_on = $true } }
  $byMember = Fails { Rpc (Api $member.token) "set_crew_follow" @{ p_crew_id = $crew.id; p_on = $true } }
  $byOrg = Fails { Rpc (Api $org.token) "set_crew_follow" @{ p_crew_id = $crew.id; p_on = $true } }
  $byAnon = Fails { Rpc $anonH "set_crew_follow" @{ p_crew_id = $crew.id; p_on = $true } }
  Check 2 "The leader is refused ($byLead); a member is refused ($byMember); an organization is refused ($byOrg); the public cannot call it ($([bool]$byAnon))" (
    ($byLead -match "in this crew") -and ($byMember -match "in this crew") -and ($byOrg -match "organization") -and ($byAnon -ne ""))

  # 3. WHO follows is the leader's to read; the row is the follower's own; nobody else's; unfollow soft-deletes
  $leadSees = Get-Rows (Api $lead.token) "follows?crew_id=eq.$($crew.id)&deleted_at=is.null&select=id,follower_id"
  $fanSees = Get-Rows (Api $fan.token) "follows?crew_id=eq.$($crew.id)&deleted_at=is.null&select=id"
  $memberSees = Get-Rows (Api $member.token) "follows?crew_id=eq.$($crew.id)&select=id"
  $anonSees = Get-Rows $anonH "follows?crew_id=eq.$($crew.id)&select=id"
  $u1 = Rpc (Api $fan.token) "set_crew_follow" @{ p_crew_id = $crew.id; p_on = $false }
  $allRows = Get-Rows (Api $fan.token) "follows?follower_id=eq.$($fan.id)&crew_id=eq.$($crew.id)&select=id,deleted_at"
  Check 3 "The leader reads $($leadSees.Count) follower; the fan reads their own $($fanSees.Count); a member $($memberSees.Count); the public $($anonSees.Count); unfollow -> $($u1.followers), the row kept ($($allRows.Count), deleted)" (
    ($leadSees.Count -eq 1) -and ($fanSees.Count -eq 1) -and ($memberSees.Count -eq 0) -and ($anonSees.Count -eq 0) -and ([int]$u1.followers -eq 0) -and ($allRows.Count -eq 1) -and ($null -ne $allRows[0].deleted_at))

  # -- AN ORGANIZATION CAN BE FOLLOWED, WHILE IT IS PUBLIC ---------------------
  # 4. a public one yes, a private one no, an organization as the caller never
  $o1 = Rpc (Api $fan.token) "set_person_follow" @{ p_user_id = $org.id; p_on = $true }
  $priv = Fails { Rpc (Api $fan.token) "set_person_follow" @{ p_user_id = $private.id; p_on = $true } }
  $orgCaller = Fails { Rpc (Api $org.token) "set_person_follow" @{ p_user_id = $fan.id; p_on = $true } }
  $anonOrgCount = Rpc-Rows $anonH "person_follower_counts" @{ p_user_ids = @($org.id) }
  $mine = Rpc-Rows (Api $fan.token) "my_followed_organizations" @{}
  Check 4 "The fan follows the public organization ($($o1.followers)); a private one is refused ($priv); an organization following is refused ($orgCaller); a stranger reads the public one's count ($($anonOrgCount.Count) row, $($anonOrgCount[0].followers)); the fan's Following sheet lists $($mine.Count) organization ($($mine[0].name))" (
    ([int]$o1.followers -eq 1) -and ($priv -match "not open to the public") -and ($orgCaller -match "organization") -and ($anonOrgCount.Count -eq 1) -and ([int]$anonOrgCount[0].followers -eq 1) -and ($mine.Count -eq 1) -and ($mine[0].org_id -eq $org.id))

  # -- AN ORGANIZATION TAKES ENQUIRIES ------------------------------------------
  # 5. through its hosting row, for the three kinds it can be asked for
  $enq = Rpc (Api $fan.token) "send_enquiry" @{ p_business_id = $hostRow; p_type_key = "celebration"; p_fields = @(); p_dates = @($in10); p_where = "Pune"; p_message = "A wedding sangeet - can you host?"; p_mobile = $null; p_crew_id = $null }
  $judge = Fails { Rpc (Api $fan.token) "send_enquiry" @{ p_business_id = $hostRow; p_type_key = "judge"; p_fields = @(); p_dates = @($in10); p_where = "Pune"; p_message = "Judge?"; p_mobile = $null; p_crew_id = $null } }
  $privateAsk = Fails { Rpc (Api $fan.token) "send_enquiry" @{ p_business_id = $hostPriv; p_type_key = "celebration"; p_fields = @(); p_dates = @($in10); p_where = "Pune"; p_message = "Hello?"; p_mobile = $null; p_crew_id = $null } }
  $orgReads = Get-Rows (Api $org.token) "enquiries?business_id=eq.$hostRow&select=id,type_key,status"
  $fanReads = Get-Rows (Api $fan.token) "enquiries?id=eq.$($enq.id)&select=id"
  $leadReads = Get-Rows (Api $lead.token) "enquiries?id=eq.$($enq.id)&select=id"
  $told = @(Get-Rows (Api $org.token) "notifications?select=id,title,body&deleted_at=is.null" | Where-Object { ($_.title + " " + $_.body) -match "enquir" }).Count
  Check 5 "A celebration reaches the organization (status $($enq.status)); judging is refused ($judge); a private organization is refused ($privateAsk); the organization reads $($orgReads.Count), the sender $($fanReads.Count), a bystander $($leadReads.Count); the organization was told ($told)" (
    ($enq.status -eq "new") -and ($judge -match "celebration, a corporate show or a collaboration") -and ($privateAsk -match "not open to the public") -and ($orgReads.Count -eq 1) -and ($fanReads.Count -eq 1) -and ($leadReads.Count -eq 0) -and ($told -ge 1))

  # -- A CONTACT EMAIL, THROUGH THREE DOORS ------------------------------------
  # 6. the person's door: checked, set, cleared; a stranger reads an artist's through public_artist
  $bad = Fails { Rpc (Api $artist.token) "update_my_profile" @{ p_full_name = $artist.name; p_city = "Pune"; p_age = $null; p_about = $null; p_socials = @(); p_styles = @("Hip-Hop"); p_phone = $null; p_contact_email = "not-an-address" } }
  Rpc (Api $artist.token) "update_my_profile" @{ p_full_name = $artist.name; p_city = "Pune"; p_age = $null; p_about = $null; p_socials = @(); p_styles = @("Hip-Hop"); p_phone = $null; p_contact_email = "artist@example.com" } | Out-Null
  $artistRow = @(Get-Rows $svcH "profiles?id=eq.$($artist.id)&select=contact_email")[0]
  $pubArtist = Rpc-Rows $anonH "public_artist" @{ p_user_id = $artist.id }
  Rpc (Api $artist.token) "update_my_profile" @{ p_full_name = $artist.name; p_city = "Pune"; p_age = $null; p_about = $null; p_socials = @(); p_styles = @("Hip-Hop"); p_phone = $null; p_contact_email = "" } | Out-Null
  $cleared = @(Get-Rows $svcH "profiles?id=eq.$($artist.id)&select=contact_email")[0]
  Check 6 "A bad address is refused ($bad); a good one lands ($($artistRow.contact_email)) and a stranger reads it off public_artist ($($pubArtist[0].contact_email)); an empty string clears it (now '$($cleared.contact_email)')" (
    ($bad -match "not an email address") -and ($artistRow.contact_email -eq "artist@example.com") -and ($pubArtist.Count -eq 1) -and ($pubArtist[0].contact_email -eq "artist@example.com") -and ([string]$cleared.contact_email -eq ""))

  # 7. the business door and the crew door; the organization's through public_organization, with its phone
  Rpc (Api $org.token) "update_business_profile" @{ p_business_id = $studio.id; p_about = "A studio"; p_founded_year = 2016; p_phone = "+91 98765 43210"; p_socials = @(); p_enquiry_types = $null; p_accepts_upi = $true; p_accepts_cards = $true; p_accepts_cash = $true; p_accepts_bank = $true; p_name = $null; p_contact_email = "hello@studio.example" } | Out-Null
  $bizRow = @(Get-Rows $anonH "businesses?id=eq.$($studio.id)&select=contact_email,phone")[0]
  $bizBad = Fails { Rpc (Api $org.token) "update_business_profile" @{ p_business_id = $studio.id; p_about = "A studio"; p_founded_year = 2016; p_phone = "+91 98765 43210"; p_socials = @(); p_enquiry_types = $null; p_accepts_upi = $true; p_accepts_cards = $true; p_accepts_cash = $true; p_accepts_bank = $true; p_name = $null; p_contact_email = "nope" } }
  $crewRow = Rpc (Api $lead.token) "update_crew" @{ p_crew_id = $crew.id; p_name = $crew.name; p_city = "Pune"; p_style = "Hip-Hop"; p_contact_email = "crew@example.com" }
  $crewBad = Fails { Rpc (Api $lead.token) "update_crew" @{ p_crew_id = $crew.id; p_name = $crew.name; p_city = "Pune"; p_style = "Hip-Hop"; p_contact_email = "nope" } }
  $crewOutsider = Fails { Rpc (Api $fan.token) "update_crew" @{ p_crew_id = $crew.id; p_name = "Taken"; p_city = "Pune"; p_style = "Hip-Hop"; p_contact_email = $null } }
  Rpc (Api $org.token) "update_my_profile" @{ p_full_name = $org.name; p_city = "Pune"; p_age = $null; p_about = "We run studios"; p_socials = @(); p_styles = @(); p_phone = "+91 91234 56789"; p_contact_email = "org@example.com" } | Out-Null
  $pubOrg = Rpc-Rows $anonH "public_organization" @{ p_org_id = $org.id }
  Check 7 "The studio's lands ($($bizRow.contact_email)) and a bad one is refused ($bizBad); the crew's lands ($($crewRow.contact_email)), a bad one is refused ($crewBad), an outsider is refused ($crewOutsider); a stranger reads the organization's phone ($($pubOrg[0].phone)) and email ($($pubOrg[0].contact_email)) off its page" (
    ($bizRow.contact_email -eq "hello@studio.example") -and ($bizBad -match "not an email address") -and ($crewRow.contact_email -eq "crew@example.com") -and ($crewBad -match "not an email address") -and ($crewOutsider -match "leader") -and ($pubOrg.Count -eq 1) -and ($pubOrg[0].phone -eq "+91 91234 56789") -and ($pubOrg[0].contact_email -eq "org@example.com"))

  # -- A STUDIO'S PUBLIC TEAM ---------------------------------------------------
  # 8. the owner (an organization) and a trainer, to a stranger; exactly the five columns; an unlisted studio's to its team alone
  Rpc (Api $org.token) "invite_to_business" @{ p_business_id = $studio.id; p_name = $member.name; p_email = $member.email; p_role = "trainer" } | Out-Null
  $inv = @(Get-Rows (Api $org.token) "business_invites?business_id=eq.$($studio.id)&status=eq.pending&select=code")[0]
  Rpc (Api $member.token) "accept_business_invite" @{ p_code = $inv.code } | Out-Null
  $team = Rpc-Rows $anonH "public_studio_team" @{ p_business_id = $studio.id }
  $cols = @($team[0].PSObject.Properties | ForEach-Object { $_.Name } | Sort-Object) -join ","
  $ownerRow = @($team | Where-Object { $_.member_role -eq "owner" })[0]
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$($studio.id)" -Headers $svcH -Body (@{ visibility = "unlisted" } | ConvertTo-Json) | Out-Null
  $hidden = Rpc-Rows $anonH "public_studio_team" @{ p_business_id = $studio.id }
  $teamSees = Rpc-Rows (Api $member.token) "public_studio_team" @{ p_business_id = $studio.id }
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$($studio.id)" -Headers $svcH -Body (@{ visibility = "listed" } | ConvertTo-Json) | Out-Null
  Check 8 "A stranger reads the listed studio's team ($($team.Count) rows: $(@($team | ForEach-Object { $_.member_role }) -join ', '); owner is_org $($ownerRow.is_org); columns $cols); unlisted -> a stranger reads $($hidden.Count), a member $($teamSees.Count)" (
    ($team.Count -eq 2) -and ($team[0].member_role -eq "owner") -and ($ownerRow.is_org -eq $true) -and ($ownerRow.full_name -eq $org.name) -and ($cols -eq "full_name,is_org,member_role,photo_path,user_id") -and ($hidden.Count -eq 0) -and ($teamSees.Count -eq 2))

  # -- HEADER PICTURES BY KIND --------------------------------------------------
  # 9. a user holds one, an artist five, an organization more than one; a file outside your folder is refused
  Rpc (Api $fan.token) "add_my_header_photo" @{ p_path = "gallery/$($fan.id)/one.jpg" } | Out-Null
  $userSecond = Fails { Rpc (Api $fan.token) "add_my_header_photo" @{ p_path = "gallery/$($fan.id)/two.jpg" } }
  1..5 | ForEach-Object { Rpc (Api $artist.token) "add_my_header_photo" @{ p_path = "gallery/$($artist.id)/p$_.jpg" } | Out-Null }
  $artistSixth = Fails { Rpc (Api $artist.token) "add_my_header_photo" @{ p_path = "gallery/$($artist.id)/p6.jpg" } }
  Rpc (Api $org.token) "add_my_header_photo" @{ p_path = "gallery/$($org.id)/h1.jpg" } | Out-Null
  $orgSecond = Rpc (Api $org.token) "add_my_header_photo" @{ p_path = "gallery/$($org.id)/h2.jpg" }
  $wrongFolder = Fails { Rpc (Api $fan.token) "add_my_header_photo" @{ p_path = "gallery/$($artist.id)/steal.jpg" } }
  $artistRows = Get-Rows $anonH "profile_header_photos?user_id=eq.$($artist.id)&deleted_at=is.null&select=id"
  Check 9 "A user's second is refused ($userSecond); an artist's sixth is refused ($artistSixth) with $($artistRows.Count) held; an organization's second lands ($([bool]$orgSecond)); somebody else's folder is refused ($wrongFolder)" (
    ($userSecond -match "one header picture") -and ($artistSixth -match "five") -and ($artistRows.Count -eq 5) -and ([string]$orgSecond -ne "") -and ($wrongFolder -match "own folder"))

  # 10. a crew's header: the leader's to add, five at most, in the crew's own folder; anybody's to read; no direct writes
  $ids = @()
  1..5 | ForEach-Object { $ids += [string](Rpc (Api $lead.token) "add_crew_header_photo" @{ p_crew_id = $crew.id; p_path = "crews/$($crew.id)/h$_.jpg" }) }
  $sixth = Fails { Rpc (Api $lead.token) "add_crew_header_photo" @{ p_crew_id = $crew.id; p_path = "crews/$($crew.id)/h6.jpg" } }
  $elsewhere = Fails { Rpc (Api $lead.token) "add_crew_header_photo" @{ p_crew_id = $crew.id; p_path = "crews/$($fan.id)/h9.jpg" } }
  $notLeader = Fails { Rpc (Api $member.token) "add_crew_header_photo" @{ p_crew_id = $crew.id; p_path = "crews/$($crew.id)/m1.jpg" } }
  $anonHeader = Get-Rows $anonH "crew_header_photos?crew_id=eq.$($crew.id)&deleted_at=is.null&select=id,path"
  $direct = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/crew_header_photos" -Headers (Api $lead.token) -Body (@{ crew_id = $crew.id; path = "crews/$($crew.id)/direct.jpg" } | ConvertTo-Json) }
  $directDel = Fails { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/crew_header_photos?id=eq.$($ids[0])" -Headers (Api $lead.token) }
  $removed = Rpc (Api $lead.token) "remove_crew_header_photo" @{ p_id = $ids[0] }
  $notLeaderRemove = Fails { Rpc (Api $member.token) "remove_crew_header_photo" @{ p_id = $ids[1] } }
  $after = Get-Rows $anonH "crew_header_photos?crew_id=eq.$($crew.id)&deleted_at=is.null&select=id"
  $stillThere = Get-Rows $svcH "crew_header_photos?id=eq.$($ids[0])&select=id,deleted_at"
  Check 10 "Five land; a sixth is refused ($sixth); another folder is refused ($elsewhere); a member is refused ($notLeader); a stranger reads $($anonHeader.Count); a direct insert is refused ($([bool]$direct)) and a direct delete changes nothing ($([bool]$directDel) / row kept: $($stillThere.Count)); the leader's remove hands back the path ($removed) and leaves $($after.Count); a member cannot remove ($notLeaderRemove)" (
    ($ids.Count -eq 5) -and ($sixth -match "five header pictures") -and ($elsewhere -match "does not belong") -and ($notLeader -match "leader") -and ($anonHeader.Count -eq 5) -and ($direct -ne "") -and ($stillThere.Count -eq 1) -and ($removed -eq "crews/$($crew.id)/h1.jpg") -and ($after.Count -eq 4) -and ($notLeaderRemove -match "leader"))
}
finally {
  # the crew's header rows and the crew go BEFORE its leader: until 20260919130000 lands, deleting the
  # leader's account with header rows still on the crew answers 500 (the FK to auth.users on the
  # audit columns fires an UPDATE on rows the crews cascade is removing) - the bug that proof found
  if ($crew) {
    Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/crew_header_photos?crew_id=eq.$($crew.id)" -Headers $svcH | Out-Null
    Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/crews?id=eq.$($crew.id)" -Headers $svcH | Out-Null
  }
  foreach ($bid in @([string]$studio.id, $hostRow, $hostPriv)) { if ($bid) { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/businesses?id=eq.$bid" -Headers $svcH | Out-Null } }
  foreach ($u in @($org, $private, $lead, $member, $fan, $artist)) {
    if ($u) { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null }
  }
  "   (cleanup: proof studio, hosting rows, crew and throwaway accounts deleted)"
}

if ($pass) { "`nALL PROFILE PAGE CHECKS PASSED"; exit 0 } else { "`nPROFILE PAGE CHECKS FAILED"; exit 1 }
