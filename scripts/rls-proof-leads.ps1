# Proof for Step 12 (Studio CRM): a lead is a PRIVATE business record. The whole
# team works the desk, another studio sees nothing, the public sees nothing, and
# a lead moves along its stages without ever faking an enrollment.
# Reads keys from .env.local - run from the repo root: powershell -File scripts/rls-proof-leads.ps1
$ErrorActionPreference = "Stop"

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

$a = Sign-In "+919999999999"   # studio owner
$b = Sign-In "+918888888888"   # front desk staff / other studio's owner
$pass = $true
$stamp = Get-Date -Format "HHmmss"

$ta = Rpc (Api $a.access_token) "create_tenant_with_owner" @{ p_name = "Leads Proof Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }
$tb = Rpc (Api $b.access_token) "create_tenant_with_owner" @{ p_name = "Rival Studio $stamp"; p_type = "studio"; p_area = "Andheri"; p_city = "Mumbai" }

try {
  # 1. the owner opens a lead
  $lead = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/leads" -Headers (Api $a.access_token) -Body (@{
    tenant_id = $ta.id; name = "Priya Iyer $stamp"; mobile = "+91 98110 44219"; interest = "Hip-Hop, evenings"; source = "walk_in" } | ConvertTo-Json)
  $leadRow = if ($lead -is [array]) { $lead[0] } else { $lead }
  Check 1 "Owner opens a lead (stage $($leadRow.status))" ($leadRow.status -eq "new")

  # 2. another studio's owner cannot see it
  $rivalSees = Get-Rows (Api $b.access_token) "leads?id=eq.$($leadRow.id)&select=id"
  Check 2 "A rival studio sees nothing ($($rivalSees.Count))" ($rivalSees.Count -eq 0)

  # 3. the public sees nothing at all - there is no public policy on leads
  $anonSees = Get-Rows $anonH "leads?select=id"
  Check 3 "The public sees no leads ($($anonSees.Count))" ($anonSees.Count -eq 0)

  # 4. nor can a rival write into somebody else's desk
  $rivalWriteBlocked = Expect-Fail {
    Invoke-RestMethod -Method Post -Uri "$base/rest/v1/leads" -Headers (Api $b.access_token) -Body (@{
      tenant_id = $ta.id; name = "Planted"; source = "walk_in" } | ConvertTo-Json)
  }
  Check 4 "A rival cannot add a lead to your desk" $rivalWriteBlocked

  # 5. the whole team works the desk - STAFF, who are the people who answer the phone
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/tenant_members" -Headers $svcH -Body (@{
    tenant_id = $ta.id; user_id = $b.user.id; member_role = "staff"; created_by = $a.user.id; updated_by = $a.user.id } | ConvertTo-Json) | Out-Null
  $staffSees = Get-Rows (Api $b.access_token) "leads?id=eq.$($leadRow.id)&select=id,name"
  Check 5 "Front-desk staff read the desk ($($staffSees.Count))" ($staffSees.Count -eq 1)

  # 6. and staff can move a lead along
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/leads?id=eq.$($leadRow.id)" -Headers (Api $b.access_token) -Body (@{ status = "quoted" } | ConvertTo-Json) | Out-Null
  $quoted = Get-Rows (Api $a.access_token) "leads?id=eq.$($leadRow.id)&select=status"
  Check 6 "Staff moved it to Quoted (now $($quoted[0].status))" ($quoted[0].status -eq "quoted")

  # 7. a trial is agreed against a REAL class of this studio
  $starts = (Get-Date).AddDays(5).ToString("yyyy-MM-ddT19:00:00zzz")
  $ends = (Get-Date).AddDays(5).ToString("yyyy-MM-ddT20:00:00zzz")
  $cls = Rpc (Api $a.access_token) "create_class_with_session" @{ p_tenant_id = $ta.id; p_title = "Trial Class $stamp";
    p_style = "Hip-Hop"; p_level = "beginner"; p_room = $null; p_price_inr = 0; p_capacity = 10;
    p_status = "published"; p_starts_at = $starts; p_ends_at = $ends }
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/leads?id=eq.$($leadRow.id)" -Headers (Api $a.access_token) -Body (@{
    status = "trial_booked"; trial_class_id = $cls.id } | ConvertTo-Json) | Out-Null
  $trial = Get-Rows (Api $a.access_token) "leads?id=eq.$($leadRow.id)&select=status,trial_class_id"
  Check 7 "Trial booked against a real class" (($trial[0].status -eq "trial_booked") -and ([string]$trial[0].trial_class_id -eq [string]$cls.id))

  # 8. a booked trial is NOT an enrollment - the studio never takes a seat for somebody
  $seats = Rpc $anonH "session_seat_counts" @{ p_session_ids = @((Get-Rows $svcH "class_sessions?class_id=eq.$($cls.id)&select=id")[0].id) }
  $noSeat = (@($seats | Where-Object { $null -ne $_ }).Count -eq 0)
  Check 8 "The trial took no seat - the learner still books their own" $noSeat

  # 9. an invalid stage is refused by the database, not just the form
  $badStageBlocked = Expect-Fail {
    Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/leads?id=eq.$($leadRow.id)" -Headers (Api $a.access_token) -Body (@{ status = "maybe" } | ConvertTo-Json)
  }
  Check 9 "An invented stage is rejected" $badStageBlocked

  # 10. converting, then soft-deleting, keeps the row (the funnel stays honest)
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/leads?id=eq.$($leadRow.id)" -Headers (Api $a.access_token) -Body (@{ status = "converted" } | ConvertTo-Json) | Out-Null
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/leads?id=eq.$($leadRow.id)" -Headers (Api $a.access_token) -Body (@{ deleted_at = (Get-Date).ToString("o") } | ConvertTo-Json) | Out-Null
  $live = Get-Rows (Api $a.access_token) "leads?id=eq.$($leadRow.id)&deleted_at=is.null&select=id"
  $all = Get-Rows $svcH "leads?id=eq.$($leadRow.id)&select=id,status"
  Check 10 "Soft delete hides it (live $($live.Count)) but keeps the record (history $($all.Count), $($all[0].status))" (($live.Count -eq 0) -and ($all.Count -eq 1) -and ($all[0].status -eq "converted"))
}
finally {
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers $svcH | Out-Null
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($tb.id)" -Headers $svcH | Out-Null
  "   (cleanup: proof studios deleted)"
}

if ($pass) { "`nALL LEAD CHECKS PASSED"; exit 0 } else { "`nLEAD CHECKS FAILED"; exit 1 }
