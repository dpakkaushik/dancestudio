# RLS proof for Step 4 (class_bookings): capacity + isolation (no waitlist since 4 Oct 2026).
# Reads keys from .env.local — run from the repo root: powershell -File scripts/rls-proof-class_bookings.ps1
$ErrorActionPreference = "Stop"
# Supabase refuses a secret (sb_secret_...) key from anything that looks like a
# browser, and PowerShell's default user agent starts with "Mozilla/5.0". Name
# ourselves honestly so the admin and service-role calls are accepted.
$PSDefaultParameterValues = @{ "Invoke-RestMethod:UserAgent" = "danceos-proof"; "Invoke-WebRequest:UserAgent" = "danceos-proof" }

$envFile = Join-Path $PSScriptRoot "..\.env.local"
$vars = @{}
Get-Content $envFile | Where-Object { $_ -match "^\s*[A-Z_]+=" } | ForEach-Object {
  $name, $value = $_ -split "=", 2
  $vars[$name.Trim()] = $value.Trim()
}
$base = $vars["NEXT_PUBLIC_SUPABASE_URL"]
$anon = $vars["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
if (-not $base -or -not $anon) { throw "NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY missing from .env.local" }
$service = $vars["SUPABASE_SERVICE_ROLE_KEY"]
if (-not $service) { throw "SUPABASE_SERVICE_ROLE_KEY missing from .env.local" }
$svcH = @{ apikey = $service; Authorization = "Bearer $service"; "Content-Type" = "application/json"; Prefer = "return=representation" }
. (Join-Path $PSScriptRoot "proof-lib.ps1")   # New-Studio / Subscribe-Studio / Assert-City / Publish-Class (see that file)

function Sign-In($phone) {
  $h = @{ apikey = $anon; "Content-Type" = "application/json" }
  Invoke-RestMethod -Method Post -Uri "$base/auth/v1/otp" -Headers $h -Body ("{`"phone`":`"$phone`"}") | Out-Null
  return Invoke-RestMethod -Method Post -Uri "$base/auth/v1/verify" -Headers $h -Body ("{`"type`":`"sms`",`"phone`":`"$phone`",`"token`":`"123456`"}")
}
function Api($token) { return @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" } }

# A = studio owner; B = learner
$a = Sign-In "+919999999999"
$b = Sign-In "+918888888888"
$pass = $true
$stamp = Get-Date -Format "HHmmss"
# 9 Sep 2026 (R11): the test-number owner is an ORGANIZATION, and an organization is not a person -
# it cannot take a seat (guard_person_only). The waitlisted dancer is a third PERSON, made for this
# run through the admin API and deleted after.
$cEmail = "enroll-c-$stamp@example.com"
$cUser = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/admin/users" -Headers $svcH -Body (@{ email = $cEmail; password = "Proof-passw0rd!"; email_confirm = $true } | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$base/rest/v1/profiles" -Headers $svcH -Body (@{ id = $cUser.id; full_name = "Waitlisted $stamp"; role = "user"; city = "Pune"; created_by = $cUser.id; updated_by = $cUser.id } | ConvertTo-Json) | Out-Null
$c = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers @{ apikey = $anon; "Content-Type" = "application/json" } -Body (@{ email = $cEmail; password = "Proof-passw0rd!" } | ConvertTo-Json)

# A: studio + published class with capacity 1 (so the SECOND booking is refused)
$ta = New-Studio $a.access_token "Enroll Studio $stamp" "Kothrud" "Pune"
Subscribe-Studio ([string]$ta.id)
# FREE, and that is the point: Step 9 made book_class_session refuse a priced
# class with open seats ("book it from its class page"), so the capacity and
# waitlist claims this script exists to prove belong to a free one. The paid
# refusal is check 10 below - this proof was red from Step 9 to Step 24 because
# it still built a Rs 300 class here and nobody re-ran it.
$cls = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_class_with_session" -Headers (Api $a.access_token) -Body (@{ p_business_id = $ta.id; p_title = "Tiny class $stamp"; p_style = "Hip-Hop"; p_level = "all"; p_room = "Studio A"; p_price_inr = 0; p_capacity = 1; p_status = "draft"; p_starts_at = "2027-03-01T19:00:00+05:30"; p_ends_at = "2027-03-01T20:00:00+05:30" } | ConvertTo-Json)
# 18 Sep 2026: a class publishes once its teacher has accepted - the third person takes it
Publish-Class ([string]$cls.id) ([string]$cUser.id) (Api $a.access_token)
$sess = Invoke-RestMethod -Uri "$base/rest/v1/class_sessions?class_id=eq.$($cls.id)&select=id" -Headers (Api $a.access_token)
$sid = $sess[0].id
"0. Studio + published class (cap 1) + session ready"

# 1. B enrolls -> enrolled
$e1 = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/book_class_session" -Headers (Api $b.access_token) -Body (@{ p_session_id = $sid } | ConvertTo-Json)
"1. B books the last spot: status=$($e1.status) $(if ($e1.status -eq 'enrolled') {'-- OK'} else {'-- !!! FAILED !!!'})"
if ($e1.status -ne "enrolled") { $pass = $false }

# 2. B enrolls again -> rejected (already has a spot)
try {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/book_class_session" -Headers (Api $b.access_token) -Body (@{ p_session_id = $sid } | ConvertTo-Json) | Out-Null
  "2. B books twice: SUCCEEDED -- !!! FAILED !!!"; $pass = $false
} catch { "2. B books twice: REJECTED -- OK" }

# 3. C, a third person, books the FULL class -> REFUSED in words. There is no
#    waitlist since 4 Oct 2026 (20261004160000): a full class takes no more bookings.
$fullMsg = ""
try {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/book_class_session" -Headers (Api $c.access_token) -Body (@{ p_session_id = $sid } | ConvertTo-Json) | Out-Null
} catch {
  $body = $_.ErrorDetails.Message
  if (-not $body) { try { $st = $_.Exception.Response.GetResponseStream(); $st.Position = 0; $body = (New-Object System.IO.StreamReader($st)).ReadToEnd() } catch {} }
  try { if ($body) { $fullMsg = ($body | ConvertFrom-Json).message } } catch { $fullMsg = $body }
}
$cRows = (Invoke-WebRequest -UseBasicParsing -Uri "$base/rest/v1/class_bookings?session_id=eq.$sid&user_id=eq.$($cUser.id)&select=id" -Headers $svcH).Content
"3. C books the FULL class: $fullMsg $(if ($fullMsg -match 'this class is full' -and $cRows -eq '[]') {'-- REFUSED, NO ROW, OK'} else {'-- !!! FAILED !!!'})"
if ($fullMsg -notmatch "this class is full" -or $cRows -ne "[]") { $pass = $false }

# 4. anonymous cannot enroll (no execute grant)
try {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/book_class_session" -Headers @{ apikey = $anon; "Content-Type" = "application/json" } -Body (@{ p_session_id = $sid } | ConvertTo-Json) | Out-Null
  "4. Anonymous enrolls: SUCCEEDED -- !!! FAILED !!!"; $pass = $false
} catch { "4. Anonymous enrolls: REJECTED -- OK" }

# 5. direct insert is blocked (RPC-only writes)
try {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/class_bookings" -Headers (Api $b.access_token) -Body (@{ session_id = $sid; class_id = $cls.id; business_id = $ta.id; user_id = $b.user.id; status = "enrolled" } | ConvertTo-Json) | Out-Null
  "5. B inserts an enrollment directly: SUCCEEDED -- !!! FAILED !!!"; $pass = $false
} catch { "5. B inserts an enrollment directly: REJECTED -- RLS OK" }

# 6. B cancels -> the seat goes back on sale, nobody is promoted, and C books it
Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/cancel_class_booking" -Headers (Api $b.access_token) -Body (@{ p_class_booking_id = $e1.id } | ConvertTo-Json) | Out-Null
$liveAfter = (Invoke-WebRequest -UseBasicParsing -Uri "$base/rest/v1/class_bookings?session_id=eq.$sid&status=eq.enrolled&deleted_at=is.null&select=id" -Headers $svcH).Content
$e2 = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/book_class_session" -Headers (Api $c.access_token) -Body (@{ p_session_id = $sid } | ConvertTo-Json)
$freed = ($liveAfter -eq "[]") -and ($e2.status -eq "enrolled")
"6. B cancels; nobody promoted ($liveAfter), then C books the freed seat: $($e2.status) $(if ($freed) {'-- OK'} else {'-- !!! FAILED !!!'})"
if (-not $freed) { $pass = $false }

# 7. B cannot cancel C's booking
try {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/cancel_class_booking" -Headers (Api $b.access_token) -Body (@{ p_class_booking_id = $e2.id } | ConvertTo-Json) | Out-Null
  "7. B cancels C's booking: SUCCEEDED -- !!! FAILED !!!"; $pass = $false
} catch { "7. B cancels C's booking: REJECTED -- OK" }

# 8. roster: A (studio) sees B's cancelled row + own; a stranger sees nothing
$roster = Invoke-RestMethod -Uri "$base/rest/v1/class_bookings?class_id=eq.$($cls.id)&select=id" -Headers (Api $a.access_token)
$anonRoster = Invoke-RestMethod -Uri "$base/rest/v1/class_bookings?class_id=eq.$($cls.id)&select=id" -Headers @{ apikey = $anon }
$rosterOk = (@($roster).Count -ge 2) -and (@($anonRoster).Count -eq 0)
"8. Studio sees roster ($(@($roster).Count) rows); anonymous sees $(@($anonRoster).Count): $(if ($rosterOk) {'-- RLS OK'} else {'-- !!! FAILED !!!'})"
if (-not $rosterOk) { $pass = $false }

# 9. public seat counts work without auth
$counts = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/session_seat_counts" -Headers @{ apikey = $anon; "Content-Type" = "application/json" } -Body (@{ p_session_ids = @($sid) } | ConvertTo-Json)
$countOk = (@($counts).Count -eq 1) -and ([int]$counts[0].enrolled -eq 1)
"9. Anonymous seat count: $($counts[0].enrolled)/1 $(if ($countOk) {'-- OK'} else {'-- !!! FAILED !!!'})"
if (-not $countOk) { $pass = $false }

# 10. AND THE RULE THAT MADE THIS CLASS FREE: a priced class with open seats
#     refuses this door and sends you to its page (Step 9's line, kept)
$paid = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_class_with_session" -Headers (Api $a.access_token) -Body (@{ p_business_id = $ta.id; p_title = "Paid class $stamp"; p_style = "Salsa"; p_level = "all"; p_room = "Studio A"; p_price_inr = 300; p_capacity = 5; p_status = "draft"; p_starts_at = "2027-03-02T19:00:00+05:30"; p_ends_at = "2027-03-02T20:00:00+05:30" } | ConvertTo-Json)
Publish-Class ([string]$paid.id) ([string]$cUser.id) (Api $a.access_token)
$paidSess = Invoke-RestMethod -Uri "$base/rest/v1/class_sessions?class_id=eq.$($paid.id)&select=id" -Headers (Api $a.access_token)
$paidMsg = ""
try {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/book_class_session" -Headers (Api $b.access_token) -Body (@{ p_session_id = $paidSess[0].id } | ConvertTo-Json) | Out-Null
} catch {
  $body = $_.ErrorDetails.Message
  if (-not $body) { try { $st = $_.Exception.Response.GetResponseStream(); $st.Position = 0; $body = (New-Object System.IO.StreamReader($st)).ReadToEnd() } catch {} }
  try { if ($body) { $paidMsg = ($body | ConvertFrom-Json).message } } catch { $paidMsg = $body }
}
"10. A priced class refuses this door: $paidMsg $(if ($paidMsg -match 'takes payment') {'-- OK'} else {'-- !!! FAILED !!!'})"
if ($paidMsg -notmatch "takes payment") { $pass = $false }

# cleanup: the studio cascades its class, session and class_bookings; the third person takes their profile
try { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/businesses?id=eq.$($ta.id)" -Headers $svcH | Out-Null } catch {}
try { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($cUser.id)" -Headers $svcH | Out-Null } catch {}
"   (cleanup: proof studio and the throwaway person deleted)"

if ($pass) { "`nALL ENROLLMENT CHECKS PASSED"; exit 0 } else { "`nENROLLMENT CHECKS FAILED"; exit 1 }
