# RLS proof for Step 4 (enrollments): capacity + waitlist + isolation.
# Reads keys from .env.local — run from the repo root: powershell -File scripts/rls-proof-enrollments.ps1
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

# A: studio + published class with capacity 1 (so the SECOND booking waitlists)
$ta = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_tenant_with_owner" -Headers (Api $a.access_token) -Body (@{ p_name = "Enroll Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" } | ConvertTo-Json)
# FREE, and that is the point: Step 9 made enroll_in_session refuse a priced
# class with open seats ("book it from its class page"), so the capacity and
# waitlist claims this script exists to prove belong to a free one. The paid
# refusal is check 10 below - this proof was red from Step 9 to Step 24 because
# it still built a Rs 300 class here and nobody re-ran it.
$cls = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_class_with_session" -Headers (Api $a.access_token) -Body (@{ p_tenant_id = $ta.id; p_title = "Tiny class $stamp"; p_style = "Hip-Hop"; p_level = "all"; p_room = "Studio A"; p_price_inr = 0; p_capacity = 1; p_status = "published"; p_starts_at = "2027-03-01T19:00:00+05:30"; p_ends_at = "2027-03-01T20:00:00+05:30" } | ConvertTo-Json)
$sess = Invoke-RestMethod -Uri "$base/rest/v1/class_sessions?class_id=eq.$($cls.id)&select=id" -Headers (Api $a.access_token)
$sid = $sess[0].id
"0. Studio + published class (cap 1) + session ready"

# 1. B enrolls -> enrolled
$e1 = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/enroll_in_session" -Headers (Api $b.access_token) -Body (@{ p_session_id = $sid } | ConvertTo-Json)
"1. B books the last spot: status=$($e1.status) $(if ($e1.status -eq 'enrolled') {'-- OK'} else {'-- !!! FAILED !!!'})"
if ($e1.status -ne "enrolled") { $pass = $false }

# 2. B enrolls again -> rejected (already has a spot)
try {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/enroll_in_session" -Headers (Api $b.access_token) -Body (@{ p_session_id = $sid } | ConvertTo-Json) | Out-Null
  "2. B books twice: SUCCEEDED -- !!! FAILED !!!"; $pass = $false
} catch { "2. B books twice: REJECTED -- OK" }

# 3. A (full class) enrolls -> waitlisted
$e2 = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/enroll_in_session" -Headers (Api $a.access_token) -Body (@{ p_session_id = $sid } | ConvertTo-Json)
"3. A books the FULL class: status=$($e2.status) $(if ($e2.status -eq 'waitlisted') {'-- WAITLISTED, OK'} else {'-- !!! FAILED !!!'})"
if ($e2.status -ne "waitlisted") { $pass = $false }

# 4. anonymous cannot enroll (no execute grant)
try {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/enroll_in_session" -Headers @{ apikey = $anon; "Content-Type" = "application/json" } -Body (@{ p_session_id = $sid } | ConvertTo-Json) | Out-Null
  "4. Anonymous enrolls: SUCCEEDED -- !!! FAILED !!!"; $pass = $false
} catch { "4. Anonymous enrolls: REJECTED -- OK" }

# 5. direct insert is blocked (RPC-only writes)
try {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/enrollments" -Headers (Api $b.access_token) -Body (@{ session_id = $sid; class_id = $cls.id; tenant_id = $ta.id; user_id = $b.user.id; status = "enrolled" } | ConvertTo-Json) | Out-Null
  "5. B inserts an enrollment directly: SUCCEEDED -- !!! FAILED !!!"; $pass = $false
} catch { "5. B inserts an enrollment directly: REJECTED -- RLS OK" }

# 6. B cancels -> A is promoted off the waitlist
Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/cancel_enrollment" -Headers (Api $b.access_token) -Body (@{ p_enrollment_id = $e1.id } | ConvertTo-Json) | Out-Null
$aRow = Invoke-RestMethod -Uri "$base/rest/v1/enrollments?id=eq.$($e2.id)&select=status" -Headers (Api $a.access_token)
$promoted = ($aRow[0].status -eq "enrolled")
"6. B cancels; A's waitlist row is now: $($aRow[0].status) $(if ($promoted) {'-- PROMOTED, OK'} else {'-- !!! FAILED !!!'})"
if (-not $promoted) { $pass = $false }

# 7. B cannot cancel A's booking
try {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/cancel_enrollment" -Headers (Api $b.access_token) -Body (@{ p_enrollment_id = $e2.id } | ConvertTo-Json) | Out-Null
  "7. B cancels A's booking: SUCCEEDED -- !!! FAILED !!!"; $pass = $false
} catch { "7. B cancels A's booking: REJECTED -- OK" }

# 8. roster: A (studio) sees B's cancelled row + own; a stranger sees nothing
$roster = Invoke-RestMethod -Uri "$base/rest/v1/enrollments?class_id=eq.$($cls.id)&select=id" -Headers (Api $a.access_token)
$anonRoster = Invoke-RestMethod -Uri "$base/rest/v1/enrollments?class_id=eq.$($cls.id)&select=id" -Headers @{ apikey = $anon }
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
$paid = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_class_with_session" -Headers (Api $a.access_token) -Body (@{ p_tenant_id = $ta.id; p_title = "Paid class $stamp"; p_style = "Salsa"; p_level = "all"; p_room = "Studio A"; p_price_inr = 300; p_capacity = 5; p_status = "published"; p_starts_at = "2027-03-02T19:00:00+05:30"; p_ends_at = "2027-03-02T20:00:00+05:30" } | ConvertTo-Json)
$paidSess = Invoke-RestMethod -Uri "$base/rest/v1/class_sessions?class_id=eq.$($paid.id)&select=id" -Headers (Api $a.access_token)
$paidMsg = ""
try {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/enroll_in_session" -Headers (Api $b.access_token) -Body (@{ p_session_id = $paidSess[0].id } | ConvertTo-Json) | Out-Null
} catch {
  $body = $_.ErrorDetails.Message
  if (-not $body) { try { $st = $_.Exception.Response.GetResponseStream(); $st.Position = 0; $body = (New-Object System.IO.StreamReader($st)).ReadToEnd() } catch {} }
  try { if ($body) { $paidMsg = ($body | ConvertFrom-Json).message } } catch { $paidMsg = $body }
}
"10. A priced class refuses this door: $paidMsg $(if ($paidMsg -match 'takes payment') {'-- OK'} else {'-- !!! FAILED !!!'})"
if ($paidMsg -notmatch "takes payment") { $pass = $false }

if ($pass) { "`nALL ENROLLMENT CHECKS PASSED"; exit 0 } else { "`nENROLLMENT CHECKS FAILED"; exit 1 }
