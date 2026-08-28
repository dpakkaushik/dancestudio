# Proof for Step 11 (rooms & people): a room caps its classes and cannot be
# double-booked, a draft holds no room, only the studio's owner/trainer puts
# people on a class and only the person asked can answer, an unconfirmed name
# never reaches the public, and an assistant handed attendance gets the register.
# Reads keys from .env.local - run from the repo root: powershell -File scripts/rls-proof-rooms-people.ps1
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

function Sign-In($phone) {
  $h = @{ apikey = $anon; "Content-Type" = "application/json" }
  Invoke-RestMethod -Method Post -Uri "$base/auth/v1/otp" -Headers $h -Body ("{`"phone`":`"$phone`"}") | Out-Null
  return Invoke-RestMethod -Method Post -Uri "$base/auth/v1/verify" -Headers $h -Body ("{`"type`":`"sms`",`"phone`":`"$phone`",`"token`":`"123456`"}")
}
function Api($token) { return @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" } }
$svcH = @{ apikey = $service; Authorization = "Bearer $service"; "Content-Type" = "application/json"; Prefer = "return=representation" }
$anonH = @{ apikey = $anon; "Content-Type" = "application/json" }

function Rpc($headers, $fn, $body) {
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body ($body | ConvertTo-Json)
}
# PS 5.1: count [] as 0, and stop a 1-row array unrolling to a scalar on return
function Get-Rows($headers, $path) {
  $res = Invoke-WebRequest -Method Get -Uri "$base/rest/v1/$path" -Headers $headers -UseBasicParsing
  return ,@(($res.Content | ConvertFrom-Json) | Where-Object { $null -ne $_ })
}
function Expect-Fail($script) { try { & $script | Out-Null; return $false } catch { return $true } }
function Check($n, $label, $ok) {
  "$n. $label $(if ($ok) {'-- OK'} else {'-- !!! FAILED !!!'})"
  if (-not $ok) { $script:pass = $false }
}
function New-Class($headers, $body) {
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_class_with_session" -Headers $headers -Body ($body | ConvertTo-Json)
}

$a = Sign-In "+919999999999"   # studio owner
$b = Sign-In "+918888888888"   # teammate / assistant
$pass = $true
$stamp = Get-Date -Format "HHmmss"
$soonStart = (Get-Date).AddMinutes(10).ToString("yyyy-MM-ddTHH:mm:sszzz")
$soonEnd = (Get-Date).AddMinutes(70).ToString("yyyy-MM-ddTHH:mm:sszzz")
$farStart = (Get-Date).AddDays(9).ToString("yyyy-MM-ddT19:00:00zzz")
$farEnd = (Get-Date).AddDays(9).ToString("yyyy-MM-ddT20:30:00zzz")
$farOverlap = (Get-Date).AddDays(9).ToString("yyyy-MM-ddT20:00:00zzz")
$farOverlapEnd = (Get-Date).AddDays(9).ToString("yyyy-MM-ddT21:00:00zzz")

$ta = Rpc (Api $a.access_token) "create_tenant_with_owner" @{ p_name = "Rooms Proof Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }
$tb = Rpc (Api $b.access_token) "create_tenant_with_owner" @{ p_name = "Other Studio $stamp"; p_type = "studio"; p_area = "Andheri"; p_city = "Mumbai" }

try {
  # 1. the owner adds a room; the public can read it (listed studio)
  $room = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rooms" -Headers (Api $a.access_token) -Body (@{
    tenant_id = $ta.id; name = "Studio A $stamp"; capacity = 10; amenities = @("Mirrors", "Sound") } | ConvertTo-Json)
  $roomRow = if ($room -is [array]) { $room[0] } else { $room }
  $anonRooms = Get-Rows $anonH "rooms?id=eq.$($roomRow.id)&select=id,name,capacity"
  Check 1 "Owner adds a room; anon reads it ($($anonRooms.Count))" ($anonRooms.Count -eq 1)

  # 2. nobody adds a room to somebody else's studio
  $crossBlocked = Expect-Fail {
    Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rooms" -Headers (Api $b.access_token) -Body (@{
      tenant_id = $ta.id; name = "Sneaky Room"; capacity = 5 } | ConvertTo-Json)
  }
  Check 2 "Adding a room to another studio is rejected" $crossBlocked

  # 3. a room caps the class it holds
  $capBlocked = Expect-Fail {
    New-Class (Api $a.access_token) @{ p_tenant_id = $ta.id; p_title = "Too Big $stamp"; p_style = "Hip-Hop";
      p_level = "beginner"; p_room = $null; p_price_inr = 0; p_capacity = 40; p_status = "published";
      p_starts_at = $farStart; p_ends_at = $farEnd; p_room_id = $roomRow.id }
  }
  Check 3 "Capacity above the room's is rejected" $capBlocked

  # 4. the room name resolves to the room itself (trigger), no id needed
  $byName = New-Class (Api $a.access_token) @{ p_tenant_id = $ta.id; p_title = "By Name $stamp"; p_style = "Hip-Hop";
    p_level = "beginner"; p_room = "Studio A $stamp"; p_price_inr = 0; p_capacity = 8; p_status = "published";
    p_starts_at = $farStart; p_ends_at = $farEnd }
  Check 4 "Room name resolved to room_id ($($byName.room_id -eq $roomRow.id))" ([string]$byName.room_id -eq [string]$roomRow.id)

  # 5. one room, one class at a time
  $clashBlocked = Expect-Fail {
    New-Class (Api $a.access_token) @{ p_tenant_id = $ta.id; p_title = "Clash $stamp"; p_style = "Salsa";
      p_level = "beginner"; p_room = $null; p_price_inr = 0; p_capacity = 8; p_status = "published";
      p_starts_at = $farOverlap; p_ends_at = $farOverlapEnd; p_room_id = $roomRow.id }
  }
  Check 5 "Overlapping published class in the same room is rejected" $clashBlocked

  # 6. a draft is not in any room yet
  $draft = New-Class (Api $a.access_token) @{ p_tenant_id = $ta.id; p_title = "Draft Same Slot $stamp"; p_style = "Salsa";
    p_level = "beginner"; p_room = $null; p_price_inr = 0; p_capacity = 8; p_status = "draft";
    p_starts_at = $farOverlap; p_ends_at = $farOverlapEnd; p_room_id = $roomRow.id }
  Check 6 "A draft may share the slot" ($null -ne $draft.id)

  # 7. only the studio's own team can be claimed
  $strangerBlocked = Expect-Fail {
    Rpc (Api $a.access_token) "claim_person" @{ p_class_id = $byName.id; p_user_id = $b.user.id; p_kind = "assistant" }
  }
  Check 7 "Claiming somebody outside the team is rejected" $strangerBlocked

  # B joins A's studio as STAFF (staff invites arrive with Step 12 - service role
  # stands in). Staff on purpose: a trainer could run the register anyway, so only
  # a staff member proves the attendance JOB is what opens it.
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/tenant_members" -Headers $svcH -Body (@{
    tenant_id = $ta.id; user_id = $b.user.id; member_role = "staff"; created_by = $a.user.id; updated_by = $a.user.id } | ConvertTo-Json) | Out-Null

  # 8. the ask goes out, and it is not public until answered
  $claim = Rpc (Api $a.access_token) "claim_person" @{ p_class_id = $byName.id; p_user_id = $b.user.id; p_kind = "assistant"; p_can_attendance = $true; p_can_refunds = $false }
  $anonClaims = Get-Rows $anonH "class_claims?class_id=eq.$($byName.id)&select=id"
  Check 8 "An unanswered ask is invisible to the public ($($anonClaims.Count) rows)" (($claim.status -eq "asked") -and ($anonClaims.Count -eq 0))

  # 9. only the person asked can answer it
  $ownerCannotAnswer = Expect-Fail { Rpc (Api $a.access_token) "respond_to_claim" @{ p_claim_id = $claim.id; p_accept = $true } }
  Check 9 "The studio cannot answer on their behalf" $ownerCannotAnswer

  # 10. they say yes, and the public can now see them
  Rpc (Api $b.access_token) "respond_to_claim" @{ p_claim_id = $claim.id; p_accept = $true } | Out-Null
  $anonClaims2 = Get-Rows $anonH "class_claims?class_id=eq.$($byName.id)&select=id,status"
  Check 10 "A confirmed name is public ($($anonClaims2.Count))" (($anonClaims2.Count -eq 1) -and ($anonClaims2[0].status -eq "confirmed"))

  # 11. an assistant holding attendance runs the register
  $soon = New-Class (Api $a.access_token) @{ p_tenant_id = $ta.id; p_title = "Register Soon $stamp"; p_style = "Hip-Hop";
    p_level = "beginner"; p_room = $null; p_price_inr = 0; p_capacity = 6; p_status = "published";
    p_starts_at = $soonStart; p_ends_at = $soonEnd }
  $soonSession = (Get-Rows $svcH "class_sessions?class_id=eq.$($soon.id)&select=id")[0].id
  $claim2 = Rpc (Api $a.access_token) "claim_person" @{ p_class_id = $soon.id; p_user_id = $b.user.id; p_kind = "assistant"; p_can_attendance = $true; p_can_refunds = $false }
  Rpc (Api $b.access_token) "respond_to_claim" @{ p_claim_id = $claim2.id; p_accept = $true } | Out-Null
  $enr = Rpc (Api $a.access_token) "enroll_in_session" @{ p_session_id = $soonSession }
  Rpc (Api $b.access_token) "check_in" @{ p_enrollment_id = $enr.id } | Out-Null
  $att = Get-Rows (Api $b.access_token) "attendance?enrollment_id=eq.$($enr.id)&deleted_at=is.null&select=id"
  Check 11 "Assistant holding attendance checks somebody in ($($att.Count))" ($att.Count -eq 1)

  # 12. take the job away and the register closes again
  Rpc (Api $a.access_token) "set_claim_powers" @{ p_claim_id = $claim2.id; p_can_attendance = $false; p_can_refunds = $false } | Out-Null
  $noPowerBlocked = Expect-Fail { Rpc (Api $b.access_token) "undo_check_in" @{ p_enrollment_id = $enr.id } }
  Check 12 "Attendance taken away closes the register" $noPowerBlocked

  # 13. nobody writes a claim directly (no self-appointing)
  $directBlocked = Expect-Fail {
    Invoke-RestMethod -Method Post -Uri "$base/rest/v1/class_claims" -Headers (Api $b.access_token) -Body (@{
      class_id = $soon.id; tenant_id = $ta.id; user_id = $b.user.id; kind = "artist"; status = "confirmed" } | ConvertTo-Json)
  }
  Check 13 "Direct insert into class_claims is rejected" $directBlocked
}
finally {
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers $svcH | Out-Null
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($tb.id)" -Headers $svcH | Out-Null
  "   (cleanup: proof studios deleted)"
}

if ($pass) { "`nALL ROOMS AND PEOPLE CHECKS PASSED"; exit 0 } else { "`nROOMS AND PEOPLE CHECKS FAILED"; exit 1 }
