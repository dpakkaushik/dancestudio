# Proof for the profile-page re-cut of 19 Sep 2026 - the five migrations
# 20260919120000 .. 20260919124000, as real roles against the live database.
#
# The claims under test: a CREW can be followed (one door, idempotent; not by its
# own leader or members; a stranger reads the count and the leader reads who); a
# CONTACT EMAIL lands on a profile, a business and a crew through the three doors,
# is refused when it is not an address, clears on an empty string, and reaches a
# stranger through public_artist; a listed studio's TEAM (owner, faculty,
# visiting faculty) is a stranger's to read and an unlisted one's is its members'
# alone; header pictures are capped by KIND (a user one, an artist five); a
# crew's header is the leader's to add (five at most, in the crew's own folder)
# and anybody's to read, with no direct write anywhere.
#
# !! THE ORGANIZATION CLAIMS - it can be followed while public, it takes an
# enquiry for three kinds, its email reaches a stranger through
# public_organization - went with organizations on 29 Sep 2026 (see the note
# above check 6).
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
  return [pscustomobject]@{ id = $u.id; email = $email; name = $name; token = $tok.access_token }
}
# the Artist plan as an admin's grant (the enquiries proof's helper): granted, active, Rs 0
function Grant-ArtistPlan($userId) {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/subscriptions" -Headers $svcH -Body (@{
    kind = "artist"; user_id = $userId; plan_key = "artist_monthly"; price_inr = 0; period = "monthly"; status = "active"
    current_period_start = (Get-Date).ToString("yyyy-MM-dd"); current_period_end = (Get-Date).AddMonths(12).ToString("yyyy-MM-dd"); granted = $true
    note = "Granted by a proof script - nothing charged"; created_by = $userId; updated_by = $userId } | ConvertTo-Json) | Out-Null
}
$pass = $true
$stamp = Get-Date -Format "HHmmss"
$org = New-EmailUser "prof-org-$stamp@example.com" "Prof Org $stamp" "user"
$lead = New-EmailUser "prof-lead-$stamp@example.com" "Prof Lead $stamp" "user"
$member = New-EmailUser "prof-member-$stamp@example.com" "Prof Member $stamp" "user"
$fan = New-EmailUser "prof-fan-$stamp@example.com" "Prof Fan $stamp" "user"
$artist = New-EmailUser "prof-artist-$stamp@example.com" "Prof Artist $stamp" "user"
Grant-ArtistPlan $artist.id
$studio = New-Studio $org.token "Prof Studio $stamp" "Kothrud" "Pune"
Subscribe-Studio ([string]$studio.id)
# !! THE TWO ORG BUSINESSES, AND THE SECOND ACCOUNT THAT OWNED ONE, WENT WITH
# ORGANIZATIONS (29 Sep 2026) - see the note above check 6. `$org` is an ordinary
# person now; the name is kept so every check below still reads as written.

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

  # 2. not by the crew itself; a bystander may (the studio's owner here - a plain
  #    person since 26 Sep 2026, so this is the ordinary rule; the rules that
  #    remain are the ones about the CREW - its leader and its confirmed members
  #    are the crew).
  $byLead = Fails { Rpc (Api $lead.token) "set_crew_follow" @{ p_crew_id = $crew.id; p_on = $true } }
  $byMember = Fails { Rpc (Api $member.token) "set_crew_follow" @{ p_crew_id = $crew.id; p_on = $true } }
  $byOrg = Rpc (Api $org.token) "set_crew_follow" @{ p_crew_id = $crew.id; p_on = $true }
  Rpc (Api $org.token) "set_crew_follow" @{ p_crew_id = $crew.id; p_on = $false } | Out-Null
  $byAnon = Fails { Rpc $anonH "set_crew_follow" @{ p_crew_id = $crew.id; p_on = $true } }
  Check 2 "The leader is refused ($byLead); a member is refused ($byMember); a bystander FOLLOWS the crew ($($byOrg.following), $($byOrg.followers) followers) and unfollows again; the public cannot call it ($([bool]$byAnon))" (
    ($byLead -match "in this crew") -and ($byMember -match "in this crew") -and ($byOrg.following -eq $true) -and ([int]$byOrg.followers -eq 2) -and ($byAnon -ne ""))

  # 3. WHO follows is the leader's to read; the row is the follower's own; nobody else's; unfollow soft-deletes
  $leadSees = Get-Rows (Api $lead.token) "follows?crew_id=eq.$($crew.id)&deleted_at=is.null&select=id,follower_id"
  $fanSees = Get-Rows (Api $fan.token) "follows?crew_id=eq.$($crew.id)&deleted_at=is.null&select=id"
  $memberSees = Get-Rows (Api $member.token) "follows?crew_id=eq.$($crew.id)&select=id"
  $anonSees = Get-Rows $anonH "follows?crew_id=eq.$($crew.id)&select=id"
  $u1 = Rpc (Api $fan.token) "set_crew_follow" @{ p_crew_id = $crew.id; p_on = $false }
  $allRows = Get-Rows (Api $fan.token) "follows?follower_id=eq.$($fan.id)&crew_id=eq.$($crew.id)&select=id,deleted_at"
  Check 3 "The leader reads $($leadSees.Count) follower; the fan reads their own $($fanSees.Count); a member $($memberSees.Count); the public $($anonSees.Count); unfollow -> $($u1.followers), the row kept ($($allRows.Count), deleted)" (
    ($leadSees.Count -eq 1) -and ($fanSees.Count -eq 1) -and ($memberSees.Count -eq 0) -and ($anonSees.Count -eq 0) -and ([int]$u1.followers -eq 0) -and ($allRows.Count -eq 1) -and ($null -ne $allRows[0].deleted_at))

  # !! CHECKS 4 AND 5 WENT WITH ORGANIZATIONS (29 Sep 2026, the user: "remove
  # Organization and Events completely"). They were the whole of "an organization
  # can be followed while it is public" (4) and "an organization takes enquiries"
  # (5), and both needed the three-step org world - a business of type `org`, its
  # GST number verified, its own mandate live - which is gone.
  #
  # !! WHAT IS NOT LOST: a STUDIO's follow is checks 2 and 3 above and a CREW's is
  # check 1; `send_enquiry` for a business is `rls-proof-enquiries`'s and for a
  # crew is `rls-proof-crews`'s. What is genuinely gone is the ORGANIZATION arm of
  # each, which is the point.

  # -- A CONTACT EMAIL, THROUGH THREE DOORS ------------------------------------
  # 6. the person's door: checked, set, cleared; a stranger reads an artist's through public_artist
  $bad = Fails { Rpc (Api $artist.token) "update_my_profile" @{ p_full_name = $artist.name; p_city = "Pune"; p_age = $null; p_socials = @(); p_styles = @("Hip-Hop"); p_phone = $null; p_contact_email = "not-an-address" } }
  Rpc (Api $artist.token) "update_my_profile" @{ p_full_name = $artist.name; p_city = "Pune"; p_age = $null; p_socials = @(); p_styles = @("Hip-Hop"); p_phone = $null; p_contact_email = "artist@example.com" } | Out-Null
  $artistRow = @(Get-Rows $svcH "profiles?id=eq.$($artist.id)&select=contact_email")[0]
  $pubArtist = Rpc-Rows $anonH "public_artist" @{ p_user_id = $artist.id }
  Rpc (Api $artist.token) "update_my_profile" @{ p_full_name = $artist.name; p_city = "Pune"; p_age = $null; p_socials = @(); p_styles = @("Hip-Hop"); p_phone = $null; p_contact_email = "" } | Out-Null
  $cleared = @(Get-Rows $svcH "profiles?id=eq.$($artist.id)&select=contact_email")[0]
  Check 6 "A bad address is refused ($bad); a good one lands ($($artistRow.contact_email)) and a stranger reads it off public_artist ($($pubArtist[0].contact_email)); an empty string clears it (now '$($cleared.contact_email)')" (
    ($bad -match "not an email address") -and ($artistRow.contact_email -eq "artist@example.com") -and ($pubArtist.Count -eq 1) -and ($pubArtist[0].contact_email -eq "artist@example.com") -and ([string]$cleared.contact_email -eq ""))

  # 7. the business door and the crew door
  #    !! the organization's third arm - its phone and email written through
  #    update_business_profile on the org row and read back off
  #    public_organization - went with organizations on 29 Sep 2026
  Rpc (Api $org.token) "update_business_profile" @{ p_business_id = $studio.id; p_founded_year = 2016; p_phone = "+91 98765 43210"; p_socials = @(); p_enquiry_types = $null; p_accepts_upi = $true; p_accepts_cards = $true; p_accepts_cash = $true; p_accepts_bank = $true; p_name = $null; p_contact_email = "hello@studio.example" } | Out-Null
  $bizRow = @(Get-Rows $anonH "businesses?id=eq.$($studio.id)&select=contact_email,phone")[0]
  $bizBad = Fails { Rpc (Api $org.token) "update_business_profile" @{ p_business_id = $studio.id; p_founded_year = 2016; p_phone = "+91 98765 43210"; p_socials = @(); p_enquiry_types = $null; p_accepts_upi = $true; p_accepts_cards = $true; p_accepts_cash = $true; p_accepts_bank = $true; p_name = $null; p_contact_email = "nope" } }
  $crewRow = Rpc (Api $lead.token) "update_crew" @{ p_crew_id = $crew.id; p_name = $crew.name; p_city = "Pune"; p_style = "Hip-Hop"; p_contact_email = "crew@example.com" }
  $crewBad = Fails { Rpc (Api $lead.token) "update_crew" @{ p_crew_id = $crew.id; p_name = $crew.name; p_city = "Pune"; p_style = "Hip-Hop"; p_contact_email = "nope" } }
  $crewOutsider = Fails { Rpc (Api $fan.token) "update_crew" @{ p_crew_id = $crew.id; p_name = "Taken"; p_city = "Pune"; p_style = "Hip-Hop"; p_contact_email = $null } }
  Check 7 "The studio's lands ($($bizRow.contact_email)) and a bad one is refused ($bizBad); the crew's lands ($($crewRow.contact_email)), a bad one is refused ($crewBad), an outsider is refused ($crewOutsider)" (
    ($bizRow.contact_email -eq "hello@studio.example") -and ($bizBad -match "not an email address") -and ($crewRow.contact_email -eq "crew@example.com") -and ($crewBad -match "not an email address") -and ($crewOutsider -match "leader"))

  # -- A STUDIO'S PUBLIC TEAM ---------------------------------------------------
  # 8. the owner (a PERSON since 26 Sep 2026 - is_org reads false) and a trainer, to a stranger; exactly the five columns; an unlisted studio's to its team alone
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
    ($team.Count -eq 2) -and ($team[0].member_role -eq "owner") -and ($ownerRow.is_org -eq $false) -and ($ownerRow.full_name -eq $org.name) -and ($cols -eq "full_name,is_org,member_role,photo_path,user_id") -and ($hidden.Count -eq 0) -and ($teamSees.Count -eq 2))

  # -- HEADER PICTURES BY KIND --------------------------------------------------
  # 9. a user holds one, an artist five; a file outside your folder is refused.
  #    (26 Sep 2026: "an organization holds ten" is DELETED here - the organization
  #    login is retired, and an org BUSINESS's header is its studio_photos rows,
  #    which business_header_photos reads for type 'org' as it does for a studio;
  #    the owner's own profile holds a user's one.)
  Rpc (Api $fan.token) "add_my_header_photo" @{ p_path = "gallery/$($fan.id)/one.jpg" } | Out-Null
  $userSecond = Fails { Rpc (Api $fan.token) "add_my_header_photo" @{ p_path = "gallery/$($fan.id)/two.jpg" } }
  1..5 | ForEach-Object { Rpc (Api $artist.token) "add_my_header_photo" @{ p_path = "gallery/$($artist.id)/p$_.jpg" } | Out-Null }
  $artistSixth = Fails { Rpc (Api $artist.token) "add_my_header_photo" @{ p_path = "gallery/$($artist.id)/p6.jpg" } }
  $wrongFolder = Fails { Rpc (Api $fan.token) "add_my_header_photo" @{ p_path = "gallery/$($artist.id)/steal.jpg" } }
  $artistRows = Get-Rows $anonH "profile_header_photos?user_id=eq.$($artist.id)&deleted_at=is.null&select=id"
  Check 9 "A user's second is refused ($userSecond); an artist's sixth is refused ($artistSixth) with $($artistRows.Count) held; somebody else's folder is refused ($wrongFolder)" (
    ($userSecond -match "one header picture") -and ($artistSixth -match "five") -and ($artistRows.Count -eq 5) -and ($wrongFolder -match "own folder"))

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
  if ($studio) { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/businesses?id=eq.$([string]$studio.id)" -Headers $svcH | Out-Null }
  foreach ($u in @($org, $lead, $member, $fan, $artist)) {
    if ($u) { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null }
  }
  "   (cleanup: proof studio, crew and throwaway accounts deleted)"
}

if ($pass) { "`nALL PROFILE PAGE CHECKS PASSED"; exit 0 } else { "`nPROFILE PAGE CHECKS FAILED"; exit 1 }
