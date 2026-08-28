# Proof for Step 25 - stats and charts.
#
# The claims under test: a figure is counted off the rows it opens, so my_dance_stats
# and my_session_history AGREE by construction (the prototype's own rule, 9950: "a
# number and the list behind it are THE SAME NUMBER"); only ENDED sessions count, and
# only a CONFIRMED claim or a real attendance row - a booking nobody marked is not a
# session danced, and an unanswered ask is not teaching; hours are the sessions' real
# lengths; the points formula is the one printed on the screen and carries NO wins
# (nothing holds a score); the charts are aggregate-only and reachable by no
# per-person question, they never expose a row RLS hides, they always carry the
# population they ranked, and the public cannot call them at all; and a person's own
# place is empty rather than "#0" when they are not on the board.
#
# Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-stats.ps1
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
  return ,@(($res.Content | ConvertFrom-Json) | Where-Object { $null -ne $_ })
}
function Rows($headers, $fn, $body) {
  $res = Invoke-WebRequest -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body ($body | ConvertTo-Json -Depth 8) -UseBasicParsing
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
function New-EmailUser($email, $name, $role, $city) {
  $u = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/admin/users" -Headers $adminH -Body (@{
    email = $email; password = "Proof-passw0rd!"; email_confirm = $true } | ConvertTo-Json)
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/profiles" -Headers $svcH -Body (@{
    id = $u.id; full_name = $name; role = $role; city = $city; created_by = $u.id; updated_by = $u.id } | ConvertTo-Json) | Out-Null
  $tok = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $anonH -Body (@{
    email = $email; password = "Proof-passw0rd!" } | ConvertTo-Json)
  return [pscustomobject]@{ id = $u.id; email = $email; name = $name; token = $tok.access_token }
}
function Stats($user) { return (Rows (Api $user.token) "my_dance_stats" @{})[0] }
function SessionList($user) { return Rows (Api $user.token) "my_session_history" @{ p_limit = 200 } }
# a class, its session placed where the test wants it (service role back-dates -
# no user may book a session that has already ended)
function New-Class($owner, $tenantId, $title, $style, $cap, $hoursAgo, $lenH) {
  $future = (Get-Date).AddDays(20)
  $c = Rpc (Api $owner.token) "create_class_with_session" @{ p_tenant_id = $tenantId; p_title = $title; p_style = $style;
    p_level = "all"; p_room = $null; p_price_inr = 0; p_capacity = $cap; p_status = "published";
    p_starts_at = $future.ToString("yyyy-MM-ddTHH:00:00zzz"); p_ends_at = $future.AddHours($lenH).ToString("yyyy-MM-ddTHH:00:00zzz") }
  $s = (Get-Rows (Api $owner.token) "class_sessions?class_id=eq.$($c.id)&select=id")[0]
  return [pscustomobject]@{ id = $c.id; sessionId = $s.id; hoursAgo = $hoursAgo; lenH = $lenH }
}
function Move-Session($sessionId, $hoursAgo, $lenH) {
  $start = (Get-Date).ToUniversalTime().AddHours(-1 * $hoursAgo)
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/class_sessions?id=eq.$sessionId" -Headers $svcH -Body (@{
    starts_at = $start.ToString("yyyy-MM-ddTHH:mm:ssZ"); ends_at = $start.AddHours($lenH).ToString("yyyy-MM-ddTHH:mm:ssZ") } | ConvertTo-Json) | Out-Null
}

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$city = "Chandigarh"   # a city the demo world does not use, so the boards are ours
$owner = New-EmailUser "st-owner-$stamp@example.com" "Stat Owner $stamp" "studio" $city
$teacher = New-EmailUser "st-teach-$stamp@example.com" "Stat Teacher $stamp" "trainer" $city
$dancer = New-EmailUser "st-dancer-$stamp@example.com" "Stat Dancer $stamp" "dancer" $city
$other = New-EmailUser "st-other-$stamp@example.com" "Stat Other $stamp" "dancer" $city
$ta = Rpc (Api $owner.token) "create_tenant_with_owner" @{ p_name = "Stat Proof Studio $stamp"; p_type = "studio"; p_area = "Sector 17"; p_city = $city }

try {
  # ── the world: the teacher takes two past sessions and assists one; the dancer
  #    is checked in to two of them and merely BOOKED into a third
  Rpc (Api $owner.token) "invite_to_tenant" @{ p_tenant_id = $ta.id; p_name = $teacher.name; p_email = $teacher.email; p_role = "trainer" } | Out-Null
  $inv = (Get-Rows (Api $owner.token) "tenant_invites?tenant_id=eq.$($ta.id)&select=code")[0]
  Rpc (Api $teacher.token) "accept_tenant_invite" @{ p_code = $inv.code } | Out-Null

  $c1 = New-Class $owner $ta.id "Hip-Hop Past $stamp" "Hip-Hop" 10 30 1      # taught, 1 h
  $c2 = New-Class $owner $ta.id "Breaking Past $stamp" "Breaking" 10 26 2    # taught, 2 h
  $c3 = New-Class $owner $ta.id "Salsa Past $stamp" "Salsa" 10 22 1          # assisted, 1 h
  $c4 = New-Class $owner $ta.id "Kathak Future $stamp" "Kathak" 10 -240 1    # still to come
  # the teacher is asked and CONFIRMS on c1, c2 (artist) and c3 (assistant);
  # a fourth ask stays UNANSWERED, and must count for nothing
  foreach ($pair in @(@($c1, "artist"), @($c2, "artist"), @($c3, "assistant"))) {
    $k = Rpc (Api $owner.token) "claim_person" @{ p_class_id = $pair[0].id; p_user_id = $teacher.id; p_kind = $pair[1]; p_pay_per_session_inr = 0 }
    Rpc (Api $teacher.token) "respond_to_claim" @{ p_claim_id = $k.id; p_accept = $true } | Out-Null
  }
  $unanswered = Rpc (Api $owner.token) "claim_person" @{ p_class_id = $c4.id; p_user_id = $teacher.id; p_kind = "artist"; p_pay_per_session_inr = 0 }

  # the dancer books three, is checked in to two (bookings happen while the
  # sessions are still in the future - the app's own rule)
  $e1 = Rpc (Api $dancer.token) "enroll_in_session" @{ p_session_id = $c1.sessionId }
  $e2 = Rpc (Api $dancer.token) "enroll_in_session" @{ p_session_id = $c2.sessionId }
  $e3 = Rpc (Api $dancer.token) "enroll_in_session" @{ p_session_id = $c3.sessionId }
  # now the sessions move into the past
  Move-Session $c1.sessionId 30 1
  Move-Session $c2.sessionId 26 2
  Move-Session $c3.sessionId 22 1
  # checked in to c1 and c2 only - c3 is a booking nobody marked
  foreach ($pair in @(@($e1, $c1), @($e2, $c2))) {
    Invoke-RestMethod -Method Post -Uri "$base/rest/v1/attendance" -Headers $svcH -Body (@{
      enrollment_id = $pair[0].id; session_id = $pair[1].sessionId; class_id = $pair[1].id; tenant_id = $ta.id;
      user_id = $dancer.id; created_by = $owner.id; updated_by = $owner.id } | ConvertTo-Json) | Out-Null
  }

  # 1. THE TEACHER'S RECORD: two conducted (3 h), one assisted (1 h), nothing attended
  $st = Stats $teacher
  Check 1 "Teacher: conducted $($st.sessions_conducted)/$($st.hours_conducted)h, assisted $($st.sessions_assisted)/$($st.hours_assisted)h, attended $($st.sessions_attended)" (
    ([int]$st.sessions_conducted -eq 2) -and ([decimal]$st.hours_conducted -eq 3) -and
    ([int]$st.sessions_assisted -eq 1) -and ([decimal]$st.hours_assisted -eq 1) -and ([int]$st.sessions_attended -eq 0))

  # 2. THE FIGURE AND THE LIST ARE THE SAME NUMBER (9950)
  $hist = SessionList $teacher
  $hc = @($hist | Where-Object { $_.side -eq "conducted" }).Count
  $ha = @($hist | Where-Object { $_.side -eq "assisted" }).Count
  Check 2 "The teacher's history holds $($hist.Count) rows: $hc conducted, $ha assisted - the same numbers the record printed" (
    ($hist.Count -eq 3) -and ($hc -eq [int]$st.sessions_conducted) -and ($ha -eq [int]$st.sessions_assisted))

  # 3. AN UNANSWERED ASK IS NOT TEACHING, AND A SESSION STILL TO COME IS NOT A RECORD
  $futureTitles = @($hist | Where-Object { $_.title -like "*Future*" }).Count
  Rpc (Api $teacher.token) "respond_to_claim" @{ p_claim_id = $unanswered.id; p_accept = $true } | Out-Null
  $st2 = Stats $teacher
  Check 3 "Nothing from the future is on the record ($futureTitles rows); confirming the future class leaves conducted at $($st2.sessions_conducted)" (
    ($futureTitles -eq 0) -and ([int]$st2.sessions_conducted -eq 2))

  # 4. THE DANCER'S RECORD: checked in twice (3 h), and the third BOOKING counts for nothing
  $sd = Stats $dancer
  $hd = SessionList $dancer
  Check 4 "Dancer: attended $($sd.sessions_attended) for $($sd.hours_attended)h across $($hd.Count) history rows, though they booked three" (
    ([int]$sd.sessions_attended -eq 2) -and ([decimal]$sd.hours_attended -eq 3) -and ($hd.Count -eq 2) -and ([int]$sd.sessions_conducted -eq 0))

  # 5. THE POINTS ARE THE FORMULA ON THE SCREEN, AND CARRY NO WINS
  #    teacher: 2*2 + 1.5*1 + 0 + 0.5*4h = 7.5 ; dancer: 1*2 + 0.5*3h = 3.5
  Check 5 "Teacher points $($st.points) (2 conducted, 1 assisted, 4 h); dancer points $($sd.points) (2 attended, 3 h)" (
    ([decimal]$st.points -eq 7.5) -and ([decimal]$sd.points -eq 3.5))

  # 6. THE STYLES / STUDIOS / ARTISTS COUNTS COME OFF THOSE SAME ROWS
  $styleN = @($hist | ForEach-Object { $_.style } | Sort-Object -Unique).Count
  $whoTaught = @($hd | ForEach-Object { $_.artist_name } | Sort-Object -Unique).Count
  Check 6 "Teacher styles $($st.styles) = $styleN distinct in the list; the dancer learns from $($sd.artists) artist ($whoTaught named in their list); studios $($sd.studios)" (
    ([int]$st.styles -eq $styleN) -and ([int]$sd.artists -eq 1) -and ($whoTaught -eq 1) -and ([int]$sd.studios -eq 1))

  # 7. ONE RECORD IS ONE PERSON'S: the other dancer has nothing, and there is no way to ask about somebody else
  $so = Stats $other
  $noArg = Fails { Rpc (Api $other.token) "my_dance_stats" @{ p_user_id = $dancer.id } }
  Check 7 "A dancer who has done nothing: attended $($so.sessions_attended), points $($so.points); asking about somebody else is not a call this function takes ($noArg)" (
    ([int]$so.sessions_attended -eq 0) -and ([decimal]$so.points -eq 0) -and ($noArg -ne ""))

  # 8. THE ARTIST BOARD ranks the teacher, carries the population, and no row exposes anything private
  $artists = Rows (Api $other.token) "dance_chart" @{ p_segment = "artist"; p_city = $city; p_style = $null; p_limit = 20 }
  $mine = @($artists | Where-Object { $_.id -eq $teacher.id })[0]
  $fields = @(($artists[0] | Get-Member -MemberType NoteProperty).Name | Sort-Object) -join ","
  Check 8 "Artist board in $city has $($artists.Count) of $($artists[0].population); the teacher is #$($mine.place) on $($mine.points) points; the row carries only [$fields]" (
    ($artists.Count -ge 1) -and ($mine.place -eq 1) -and ([decimal]$mine.points -eq 7.5) -and ([int]$artists[0].population -ge 1) -and
    ($fields -eq "assisted,attended,city,conducted,extra,hours,id,kind,name,place,points,population,style"))

  # 9. THE DANCER BOARD ranks the dancer, and somebody with nothing is not on it at all
  $dancers = Rows (Api $owner.token) "dance_chart" @{ p_segment = "dancer"; p_city = $city; p_style = $null; p_limit = 20 }
  $onIt = @($dancers | Where-Object { $_.id -eq $dancer.id }).Count
  $notOnIt = @($dancers | Where-Object { $_.id -eq $other.id }).Count
  Check 9 "Dancer board: the checked-in dancer is on it ($onIt), the one who danced nothing is not ($notOnIt)" (
    ($onIt -eq 1) -and ($notOnIt -eq 0))

  # 10. THE STUDIO BOARD counts sessions actually HELD, and the future one is not among them
  $studios = Rows (Api $teacher.token) "dance_chart" @{ p_segment = "studio"; p_city = $city; p_style = $null; p_limit = 20 }
  $ours = @($studios | Where-Object { $_.id -eq $ta.id })[0]
  Check 10 "Studio board: $($ours.name) held $($ours.conducted) sessions for $($ours.hours)h with $($ours.extra) on the floor (4 classes exist, one still to come)" (
    ([int]$ours.conducted -eq 3) -and ([decimal]$ours.hours -eq 4) -and ([int]$ours.extra -eq 1))

  # 11. A CREW BOARD RANKS WHAT A CREW DID, not wins nobody records
  $crew = Rpc (Api $dancer.token) "create_crew" @{ p_name = "Stat Crew $stamp"; p_city = $city; p_style = "Hip-Hop"; p_member_ids = @($other.id) }
  $ask = (Get-Rows (Api $dancer.token) "crew_members?crew_id=eq.$($crew.id)&status=eq.asked&select=id")[0]
  Rpc (Api $other.token) "respond_to_crew_ask" @{ p_member_id = $ask.id; p_accept = $true } | Out-Null
  $crews = Rows (Api $owner.token) "dance_chart" @{ p_segment = "crew"; p_city = $city; p_style = $null; p_limit = 20 }
  $ourCrew = @($crews | Where-Object { $_.id -eq $crew.id })[0]
  Check 11 "Crew board: $($ourCrew.name) has $($ourCrew.conducted) events entered and $($ourCrew.extra) members for $($ourCrew.points) points" (
    ([int]$ourCrew.conducted -eq 0) -and ([int]$ourCrew.extra -eq 2) -and ([decimal]$ourCrew.points -eq 2))

  # 12. THE BOARDS ARE NOT PUBLIC, AND NEITHER IS A RECORD
  $anonChart = Fails { Rpc $anonH "dance_chart" @{ p_segment = "dancer"; p_city = $null; p_style = $null; p_limit = 5 } }
  $anonStats = Fails { Rpc $anonH "my_dance_stats" @{} }
  $anonHist = Fails { Rpc $anonH "my_session_history" @{ p_limit = 5 } }
  $bogusSeg = Fails { Rpc (Api $owner.token) "dance_chart" @{ p_segment = "everybody"; p_city = $null; p_style = $null; p_limit = 5 } }
  Check 12 "The public cannot read a board ($anonChart), a record ($anonStats) or a history ($anonHist); an invented segment is refused ($bogusSeg)" (
    ($anonChart -ne "") -and ($anonStats -ne "") -and ($anonHist -ne "") -and ($bogusSeg -match "unknown chart"))

  # 13. MY PLACE COMES WITH ITS DENOMINATOR, and is EMPTY rather than #0 when off the board
  $place = Rows (Api $dancer.token) "my_chart_place" @{ p_segment = "dancer"; p_city = $city }
  $nowhere = Rows (Api $other.token) "my_chart_place" @{ p_segment = "dancer"; p_city = $city }
  $notAPerson = Fails { Rpc (Api $dancer.token) "my_chart_place" @{ p_segment = "studio"; p_city = $city } }
  Check 13 "The dancer is #$($place[0].place) of $($place[0].population); somebody off the board gets $($nowhere.Count) rows, not #0; a studio is not a person's place ($notAPerson)" (
    ($place.Count -eq 1) -and ([int]$place[0].place -ge 1) -and ([int]$place[0].population -ge 1) -and ($nowhere.Count -eq 0) -and ($notAPerson -match "belongs to a person"))

  # 14. A STYLE FILTER NARROWS A BOARD, and a city with nobody in it is honestly empty
  $breaking = Rows (Api $owner.token) "dance_chart" @{ p_segment = "artist"; p_city = $city; p_style = "Breaking"; p_limit = 20 }
  $bRow = @($breaking | Where-Object { $_.id -eq $teacher.id })[0]
  $elsewhere = Rows (Api $owner.token) "dance_chart" @{ p_segment = "artist"; p_city = "Kolkata"; p_style = $null; p_limit = 20 }
  Check 14 "Filtered to Breaking the teacher shows $($bRow.conducted) conducted for $($bRow.hours)h (of 2 and 3h in all); an empty city returns $($elsewhere.Count) rows" (
    ([int]$bRow.conducted -eq 1) -and ([decimal]$bRow.hours -eq 2) -and ($elsewhere.Count -eq 0))
}
finally {
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers $svcH | Out-Null
  foreach ($u in @($owner, $teacher, $dancer, $other)) {
    if ($u) { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null }
  }
  "   (cleanup: proof studio, crew and throwaway accounts deleted)"
}

if ($pass) { "`nALL STATS CHECKS PASSED"; exit 0 } else { "`nSTATS CHECKS FAILED"; exit 1 }
