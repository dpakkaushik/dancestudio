# Proof for the person-pages parity slice.
#
# The claims under test: a person page is SIGNED-IN ONLY, and a stranger gets
# nothing from any of its reads (the profile row, the record, where they teach,
# the follower counts, the search's People section); a person's record is the
# same arithmetic Step 25 already publishes beside their name, so the page shows
# nothing new; "teaches at" comes off PUBLIC rows only - a draft class or an
# unlisted business never puts a name anywhere; the crews listed are the
# CONFIRMED ones (an unanswered ask is not a membership); following a person is
# one bit, idempotent, refuses yourself and a stranger, and the follows table
# still cannot hold a row that names both a business and a person, or neither;
# and a person's followers are theirs and the follower's to see, nobody else's.
#
# Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-person-pages.ps1
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
  if ($res.Content.Trim() -eq "[]") { return ,@() }
  $out = @(); foreach ($x in ($res.Content | ConvertFrom-Json)) { if ($null -ne $x) { $out += $x } }
  # and a function returning a ONE-element array unrolls it to a scalar, which
  # loses .Count - the comma keeps it an array
  return ,$out
}
# PowerShell 5.1 does not enumerate a parsed JSON array down the pipeline, so
# every RPC that returns a set is read with foreach
function Rows($headers, $fn, $body) {
  $res = Invoke-WebRequest -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body ($body | ConvertTo-Json -Depth 8) -UseBasicParsing
  if ($res.Content.Trim() -eq "[]") { return ,@() }
  $out = @(); foreach ($x in ($res.Content | ConvertFrom-Json)) { if ($null -ne $x) { $out += $x } }
  return ,$out
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
function New-EmailUser($email, $name, $role, $city) {
  $u = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/admin/users" -Headers $adminH -Body (@{
    email = $email; password = "Proof-passw0rd!"; email_confirm = $true } | ConvertTo-Json)
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/profiles" -Headers $svcH -Body (@{
    id = $u.id; full_name = $name; role = $role; city = $city; created_by = $u.id; updated_by = $u.id } | ConvertTo-Json) | Out-Null
  $tok = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $anonH -Body (@{
    email = $email; password = "Proof-passw0rd!" } | ConvertTo-Json)
  return [pscustomobject]@{ id = $u.id; email = $email; name = $name; token = $tok.access_token }
}

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$city = "Ahmedabad"   # a city the demo world does not use
$owner = New-EmailUser "pp-owner-$stamp@example.com" "PP Owner $stamp" "studio" $city
$teacher = New-EmailUser "pp-teacher-$stamp@example.com" "PP Teacher $stamp" "trainer" $city
$fan = New-EmailUser "pp-fan-$stamp@example.com" "PP Fan $stamp" "dancer" $city
$other = New-EmailUser "pp-other-$stamp@example.com" "PP Other $stamp" "dancer" $city
$ta = Rpc (Api $owner.token) "create_tenant_with_owner" @{ p_name = "PP Listed Studio $stamp"; p_type = "studio"; p_area = "Navrangpura"; p_city = $city }
$tb = Rpc (Api $owner.token) "create_tenant_with_owner" @{ p_name = "PP Private Studio $stamp"; p_type = "studio"; p_area = "Bodakdev"; p_city = $city }
Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenants?id=eq.$($tb.id)" -Headers $svcH -Body (@{ visibility = "unlisted" } | ConvertTo-Json) | Out-Null
$soon = (Get-Date).AddDays(9)

try {
  # the teacher joins both studios and is confirmed on: a PUBLISHED class of the
  # listed one, a DRAFT class of the listed one, and a published class of the
  # UNLISTED one. Only the first may ever appear on their page.
  foreach ($t in @($ta, $tb)) {
    Rpc (Api $owner.token) "invite_to_tenant" @{ p_tenant_id = $t.id; p_name = $teacher.name; p_email = $teacher.email; p_role = "trainer" } | Out-Null
  }
  foreach ($inv in (Get-Rows (Api $owner.token) "tenant_invites?select=code&status=eq.pending")) {
    Rpc (Api $teacher.token) "accept_tenant_invite" @{ p_code = $inv.code } | Out-Null
  }
  $mk = {
    param($tenantId, $title, $style, $status)
    $c = Rpc (Api $owner.token) "create_class_with_session" @{ p_tenant_id = $tenantId; p_title = $title; p_style = $style;
      p_level = "all"; p_room = $null; p_price_inr = 0; p_capacity = 10; p_status = $status;
      p_starts_at = $soon.ToString("yyyy-MM-ddT19:00:00zzz"); p_ends_at = $soon.ToString("yyyy-MM-ddT20:00:00zzz") }
    return $c
  }
  $pub = & $mk $ta.id "PP Public $stamp" "Hip-Hop" "published"
  $draft = & $mk $ta.id "PP Draft $stamp" "Kathak" "draft"
  $hidden = & $mk $tb.id "PP Hidden $stamp" "Salsa" "published"
  foreach ($c in @($pub, $draft, $hidden)) {
    $k = Rpc (Api $owner.token) "claim_person" @{ p_class_id = $c.id; p_user_id = $teacher.id; p_kind = "artist"; p_pay_per_session_inr = 0 }
    Rpc (Api $teacher.token) "respond_to_claim" @{ p_claim_id = $k.id; p_accept = $true } | Out-Null
  }

  # and one session that has ENDED, so the record has a real number in it (a
  # record of nothing agrees with anything, which is not a test)
  $sess = (Get-Rows (Api $owner.token) "class_sessions?class_id=eq.$($pub.id)&select=id")[0]
  $past = (Get-Date).ToUniversalTime().AddHours(-26)
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/class_sessions?id=eq.$($sess.id)" -Headers $svcH -Body (@{
    starts_at = $past.ToString("yyyy-MM-ddTHH:mm:ssZ"); ends_at = $past.AddHours(1).ToString("yyyy-MM-ddTHH:mm:ssZ") } | ConvertTo-Json) | Out-Null

  # 1. A STRANGER GETS NOTHING - not the profile row, not the record, not the page's lists
  $anonProfile = Get-Rows $anonH "profiles?id=eq.$($teacher.id)&select=id,full_name"
  $anonStats = Fails { Rpc $anonH "person_dance_stats" @{ p_user_id = $teacher.id } }
  $anonTeaches = Fails { Rpc $anonH "person_teaches_at" @{ p_user_id = $teacher.id } }
  $anonCounts = Fails { Rpc $anonH "person_follower_counts" @{ p_user_ids = @($teacher.id) } }
  Check 1 "A stranger reads $($anonProfile.Count) profile rows, and is refused the record ($anonStats), the teaches list ($anonTeaches) and the counts ($anonCounts)" (
    ($anonProfile.Count -eq 0) -and ($anonStats -ne "") -and ($anonTeaches -ne "") -and ($anonCounts -ne ""))

  # 2. A SIGNED-IN PERSON SEES THE PAGE'S PARTS
  $seen = Get-Rows (Api $fan.token) "profiles?id=eq.$($teacher.id)&select=id,full_name,role,city"
  $stats = (Rows (Api $fan.token) "person_dance_stats" @{ p_user_id = $teacher.id })[0]
  Check 2 "A signed-in dancer reads the teacher's profile ($($seen[0].full_name), $($seen[0].city)) and their record (conducted $($stats.sessions_conducted) for $($stats.hours_conducted)h, points $($stats.points))" (
    ($seen.Count -eq 1) -and ($seen[0].full_name -eq $teacher.name) -and ([int]$stats.sessions_conducted -eq 1) -and ([decimal]$stats.points -eq 2.5))

  # 3. TEACHES AT IS PUBLIC ROWS ONLY: the listed studio's published class, and nothing else
  $teaches = Rows (Api $fan.token) "person_teaches_at" @{ p_user_id = $teacher.id }
  $names = (@($teaches | ForEach-Object { $_.tenant_name }) -join ", ")
  Check 3 "Teaches at: $names ($($teaches.Count) row) - the draft's studio counts once, the unlisted one never" (
    ($teaches.Count -eq 1) -and ($teaches[0].tenant_name -eq "PP Listed Studio $stamp") -and ($teaches[0].classes -eq 1))

  # 4. THE RECORD MATCHES STEP 25's BOARD - the same arithmetic, so the page shows nothing new
  $mine = (Rows (Api $teacher.token) "my_dance_stats" @{})[0]
  Check 4 "The teacher's own record and the one their page shows agree (conducted $($mine.sessions_conducted)/$($stats.sessions_conducted), points $($mine.points)/$($stats.points)) - and it is not vacuously zero" (
    ([int]$mine.sessions_conducted -eq [int]$stats.sessions_conducted) -and ([decimal]$mine.points -eq [decimal]$stats.points) -and ([int]$mine.sessions_conducted -ge 1))

  # 5. CREWS ON A PAGE ARE THE CONFIRMED ONES
  $crew = Rpc (Api $teacher.token) "create_crew" @{ p_name = "PP Crew $stamp"; p_city = $city; p_style = "Hip-Hop"; p_member_ids = @($fan.id, $other.id) }
  $asks = Get-Rows (Api $teacher.token) "crew_members?crew_id=eq.$($crew.id)&status=eq.asked&select=id,user_id"
  $fanAsk = @($asks | Where-Object { $_.user_id -eq $fan.id })[0]
  Rpc (Api $fan.token) "respond_to_crew_ask" @{ p_member_id = $fanAsk.id; p_accept = $true } | Out-Null
  # the page's read: confirmed rows for this person
  $fanCrews = Get-Rows (Api $fan.token) "crew_members?user_id=eq.$($fan.id)&status=eq.confirmed&deleted_at=is.null&select=role,crews(name)"
  $otherCrews = Get-Rows (Api $other.token) "crew_members?user_id=eq.$($other.id)&status=eq.confirmed&deleted_at=is.null&select=role"
  Check 5 "The fan who confirmed is in $($fanCrews.Count) crew ($($fanCrews[0].crews.name)); the one still asked is in $($otherCrews.Count)" (
    ($fanCrews.Count -eq 1) -and ($otherCrews.Count -eq 0))

  # 6. FOLLOWING A PERSON: one bit, idempotent, and the count moves
  $f1 = Rpc (Api $fan.token) "set_person_follow" @{ p_user_id = $teacher.id; p_on = $true }
  $f1b = Rpc (Api $fan.token) "set_person_follow" @{ p_user_id = $teacher.id; p_on = $true }
  $f2 = Rpc (Api $other.token) "set_person_follow" @{ p_user_id = $teacher.id; p_on = $true }
  $counts = (Rows (Api $fan.token) "person_follower_counts" @{ p_user_ids = @($teacher.id) })[0]
  Check 6 "The fan follows: $($f1.followers); again still $($f1b.followers); a second follower -> $($f2.followers); the counts function says $($counts.followers) followers / $($counts.following) following" (
    ([int]$f1.followers -eq 1) -and ([int]$f1b.followers -eq 1) -and ([int]$f2.followers -eq 2) -and ([int]$counts.followers -eq 2))

  # 7. WHAT CANNOT BE FOLLOWED: yourself, a stranger, and nothing at all
  $self = Fails { Rpc (Api $fan.token) "set_person_follow" @{ p_user_id = $fan.id; p_on = $true } }
  $ghost = Fails { Rpc (Api $fan.token) "set_person_follow" @{ p_user_id = "00000000-0000-0000-0000-000000000000"; p_on = $true } }
  $anonFollow = Fails { Rpc $anonH "set_person_follow" @{ p_user_id = $teacher.id; p_on = $true } }
  Check 7 "Following yourself refused ($self); somebody who is not on DanceOS refused ($ghost); the public cannot follow ($anonFollow)" (
    ($self -match "yourself") -and ($ghost -match "not on DanceOS") -and ($anonFollow -ne ""))

  # 8. A FOLLOW NAMES EXACTLY ONE OBJECT - the table cannot hold anything else
  $both = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/follows" -Headers $svcH -Body (@{
    follower_id = $fan.id; followee_id = $teacher.id; tenant_id = $ta.id; created_by = $fan.id; updated_by = $fan.id } | ConvertTo-Json) }
  $neither = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/follows" -Headers $svcH -Body (@{
    follower_id = $fan.id; created_by = $fan.id; updated_by = $fan.id } | ConvertTo-Json) }
  $direct = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/follows" -Headers (Api $other.token) -Body (@{
    follower_id = $other.id; followee_id = $teacher.id } | ConvertTo-Json) }
  Check 8 "A row naming both refused ($([bool]$both)); naming neither refused ($([bool]$neither)); a direct insert by a client refused ($([bool]$direct))" (
    ($both -match "follows_one_object") -and ($neither -match "follows_one_object") -and ($direct -ne ""))

  # 9. WHO FOLLOWS WHOM: the followed person and the follower see it, nobody else
  $teacherSees = Get-Rows (Api $teacher.token) "follows?followee_id=eq.$($teacher.id)&deleted_at=is.null&select=id,follower_id"
  $fanSees = Get-Rows (Api $fan.token) "follows?followee_id=eq.$($teacher.id)&deleted_at=is.null&select=id"
  $ownerSees = Get-Rows (Api $owner.token) "follows?followee_id=eq.$($teacher.id)&select=id"
  $anonSees = Get-Rows $anonH "follows?followee_id=eq.$($teacher.id)&select=id"
  Check 9 "The teacher reads their $($teacherSees.Count) followers; a follower reads their own $($fanSees.Count); a bystander $($ownerSees.Count); the public $($anonSees.Count)" (
    ($teacherSees.Count -eq 2) -and ($fanSees.Count -eq 1) -and ($ownerSees.Count -eq 0) -and ($anonSees.Count -eq 0))

  # 10. UNFOLLOW SOFT-DELETES AND RE-FOLLOWING STARTS A FRESH LIVE ROW
  $u1 = Rpc (Api $fan.token) "set_person_follow" @{ p_user_id = $teacher.id; p_on = $false }
  $r1 = Rpc (Api $fan.token) "set_person_follow" @{ p_user_id = $teacher.id; p_on = $true }
  $all = Get-Rows (Api $fan.token) "follows?follower_id=eq.$($fan.id)&followee_id=eq.$($teacher.id)&select=id,deleted_at"
  $live = @($all | Where-Object { -not $_.deleted_at }).Count
  Check 10 "Unfollow -> $($u1.followers); re-follow -> $($r1.followers), leaving $($all.Count) rows of which $live is live" (
    ([int]$u1.followers -eq 1) -and ([int]$r1.followers -eq 2) -and ($all.Count -eq 2) -and ($live -eq 1))

  # 11. FOLLOWING A BUSINESS STILL WORKS THE OLD WAY (the table learned a second object, it did not forget the first)
  $bizFollow = Rpc (Api $fan.token) "set_follow" @{ p_tenant_id = $ta.id; p_on = $true }
  $bizCount = @((Rpc $anonH "follower_counts" @{ p_tenant_ids = @($ta.id) }))
  $bizN = 0; foreach ($r in $bizCount) { if ($r.tenant_id -eq $ta.id) { $bizN = [int]$r.followers } }
  Check 11 "The fan follows the studio: $($bizFollow.followers); the public count still answers $bizN" (
    ([int]$bizFollow.followers -eq 1) -and ($bizN -eq 1))

  # 12. AND SEARCH CAN OFFER PEOPLE NOW - to a signed-in caller, never to a stranger
  $found = Rows (Api $fan.token) "search_dance_os" @{ p_q = "PP Teacher"; p_limit = 3 }
  $person = @($found | Where-Object { $_.kind -eq "person" })[0]
  $anonFound = Rows $anonH "search_dance_os" @{ p_q = "PP Teacher"; p_limit = 3 }
  $anonPeople = @($anonFound | Where-Object { $_.kind -eq "person" }).Count
  Check 12 "Signed in, the search finds the person ($($person.name) -> $($person.href), sub '$($person.sub)'); a stranger finds $anonPeople people" (
    ($null -ne $person) -and ($person.href -eq "/person/$($teacher.id)") -and ($person.sub -like "Artist*") -and ($anonPeople -eq 0))
}
finally {
  foreach ($t in @($ta, $tb)) { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($t.id)" -Headers $svcH | Out-Null }
  foreach ($u in @($owner, $teacher, $fan, $other)) {
    if ($u) { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null }
  }
  "   (cleanup: proof studios, crew and throwaway accounts deleted)"
}

if ($pass) { "`nALL PERSON PAGE CHECKS PASSED"; exit 0 } else { "`nPERSON PAGE CHECKS FAILED"; exit 1 }
