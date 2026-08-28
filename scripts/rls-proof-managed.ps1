# Proof for the S_managed parity slice - "everything you manage".
#
# Nothing new is stored, so what is under test is the READ the page makes
# (repositories/managed.ts): every class and every event of every business the
# person BELONGS to, drafts included, in one query per kind scoped by the
# membership's tenant ids. The claims: an owner of two businesses gets both
# businesses' classes and events in one read, drafts included; a trainer on ONE
# of them gets that one's and not the other's; a stranger who can read the
# published class of a listed studio (RLS lets them - Discover needs it) gets
# NOTHING when the read is scoped to the businesses they belong to, because they
# belong to none - RLS is a ceiling, and this list is scoped by membership; a
# soft-deleted class drops out; and the seat counts the tile prints come from
# the aggregate-only RPC, so the list never reads another person's booking row.
#
# Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-managed.ps1
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
  try { return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body ($body | ConvertTo-Json -Depth 8) }
  catch {
    $detail = ""
    try { $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $detail = $sr.ReadToEnd() } catch {}
    throw "rpc $fn failed: $($_.Exception.Message) $detail"
  }
}
# a REST read counted off the raw text (PowerShell 5.1 reads a JSON [] as one item)
function Rows($headers, $path) {
  $res = Invoke-WebRequest -Method Get -Uri "$base/rest/v1/$path" -Headers $headers -UseBasicParsing
  if ($res.Content.Trim() -eq "[]") { return ,@() }
  return ,@(($res.Content | ConvertFrom-Json) | Where-Object { $null -ne $_ })
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
  $tok = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $anonH -Body (@{
    email = $email; password = "Proof-passw0rd!" } | ConvertTo-Json)
  return [pscustomobject]@{ id = $u.id; email = $email; token = $tok.access_token }
}
function Add-Member($tenantId, $userId, $memberRole, $byUser) {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/tenant_members" -Headers $svcH -Body (@{
    tenant_id = $tenantId; user_id = $userId; member_role = $memberRole
    created_by = $byUser; updated_by = $byUser } | ConvertTo-Json) | Out-Null
}
$in10 = (Get-Date).AddDays(10).ToString("yyyy-MM-dd")
function Ev($title) {
  return @{ cat = "showcase"; title = $title; style = "All styles"; start_date = $in10; end_date = $in10; start_time = "18:00"
    venue = "Proof Hall"; address = "Kothrud"; city = "Pune"; maps_url = "https://maps.google.com/?q=Proof+Hall"; about = "Proof event"
    entry_format = "none"; bracket = 0; rounds = 0; prizes = @(); tickets_on = $true
    entry_tiers = @(); ticket_tiers = @(@{ name = "General"; price_inr = 0; capacity = 50; sort = 0 }) }
}
function ClassBody($tenantId, $title, $status) {
  return @{ p_tenant_id = $tenantId; p_title = $title; p_style = "Hip-Hop"; p_level = "all"; p_room = "Studio A"; p_price_inr = 0; p_capacity = 10
    p_status = $status; p_starts_at = "$($in10)T19:00:00+05:30"; p_ends_at = "$($in10)T20:00:00+05:30" }
}
# the page's reads, exactly as repositories/managed.ts makes them: membership
# first (user_id = me, out loud), then classes and events IN those tenant ids
function ManagedTenantIds($user) {
  $m = Rows (Api $user.token) "tenant_members?select=tenant_id&user_id=eq.$($user.id)&deleted_at=is.null"
  return ,@($m | ForEach-Object { $_.tenant_id })
}
function ManagedClasses($user) {
  $ids = ManagedTenantIds $user
  if ($ids.Count -eq 0) { return ,@() }
  return Rows (Api $user.token) "classes?select=id,title,status,tenant_id&tenant_id=in.($($ids -join ','))&deleted_at=is.null"
}
function ManagedEvents($user) {
  $ids = ManagedTenantIds $user
  if ($ids.Count -eq 0) { return ,@() }
  return Rows (Api $user.token) "events?select=id,title,status,tenant_id&tenant_id=in.($($ids -join ','))&deleted_at=is.null"
}
function Titles($rows) { return (@($rows | ForEach-Object { $_.title }) | Sort-Object) -join ", " }

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$owner = New-EmailUser "mng-owner-$stamp@example.com" "Owner $stamp" "studio"
$trainer = New-EmailUser "mng-trainer-$stamp@example.com" "Trainer $stamp" "trainer"
$stranger = New-EmailUser "mng-stranger-$stamp@example.com" "Stranger $stamp" "dancer"
$ta = Rpc (Api $owner.token) "create_tenant_with_owner" @{ p_name = "Managed A $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }
$tb = Rpc (Api $owner.token) "create_tenant_with_owner" @{ p_name = "Managed B $stamp"; p_type = "trainer_business"; p_area = "Baner"; p_city = "Pune" }
Add-Member $ta.id $trainer.id "trainer" $owner.id
# (a new tenant is listed by default, so a stranger CAN read its published class - the point of check 3)

$cA1 = Rpc (Api $owner.token) "create_class_with_session" (ClassBody $ta.id "A Published $stamp" "published")
$cA2 = Rpc (Api $owner.token) "create_class_with_session" (ClassBody $ta.id "A Draft $stamp" "draft")
$cB1 = Rpc (Api $owner.token) "create_class_with_session" (ClassBody $tb.id "B Draft $stamp" "draft")
$eA = Rpc (Api $owner.token) "save_event" @{ p_tenant_id = $ta.id; p_event_id = $null; p_event = (Ev "A Event $stamp") }
$eB = Rpc (Api $owner.token) "save_event" @{ p_tenant_id = $tb.id; p_event_id = $null; p_event = (Ev "B Event $stamp") }

try {
  # 1. the owner of both businesses gets both businesses' classes in ONE read, drafts included
  $oc = ManagedClasses $owner
  Check 1 "owner reads both businesses' classes at once, drafts included (got: $(Titles $oc))" (
    $oc.Count -eq 3 -and (Titles $oc) -eq "A Draft $stamp, A Published $stamp, B Draft $stamp")

  # 2. ... and both businesses' events, drafts included
  $oe = ManagedEvents $owner
  Check 2 "owner reads both businesses' events at once (got: $(Titles $oe))" (
    $oe.Count -eq 2 -and (Titles $oe) -eq "A Event $stamp, B Event $stamp")

  # 3. a stranger CAN read the listed studio's published class (Discover needs that) ...
  $pub = Rows (Api $stranger.token) "classes?select=id,title&id=eq.$($cA1.id)"
  Check 3 "a stranger reads the listed studio's published class directly (RLS, as Discover needs)" ($pub.Count -eq 1)

  # 4. ... but the managed read, scoped by membership, gives them nothing at all
  Check 4 "the managed read gives a stranger nothing - it is scoped by membership, not by what RLS lets through" (
    (ManagedTenantIds $stranger).Count -eq 0 -and (ManagedClasses $stranger).Count -eq 0 -and (ManagedEvents $stranger).Count -eq 0)

  # 5. a trainer on A gets A's classes (the draft too) and none of B's
  $tc = ManagedClasses $trainer
  Check 5 "a trainer on A reads A's classes, draft included, and none of B's (got: $(Titles $tc))" (
    $tc.Count -eq 2 -and (Titles $tc) -eq "A Draft $stamp, A Published $stamp")

  # 6. ... and A's event only
  $te = ManagedEvents $trainer
  Check 6 "a trainer on A reads A's event and not B's (got: $(Titles $te))" ($te.Count -eq 1 -and $te[0].title -eq "A Event $stamp")

  # 7. a soft-deleted class drops out of the list
  # the way the repository does it: an UPDATE of deleted_at under the owner's own session, no RETURNING
  $plainH = @{ apikey = $anon; Authorization = "Bearer $($owner.token)"; "Content-Type" = "application/json" }
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/classes?id=eq.$($cA2.id)" -Headers $plainH -Body (@{ deleted_at = (Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json) | Out-Null
  $oc2 = ManagedClasses $owner
  Check 7 "a soft-deleted class drops out (got: $(Titles $oc2))" ($oc2.Count -eq 2 -and -not ((Titles $oc2) -like "*A Draft*"))

  # 8. the seat count the tile prints is the aggregate RPC - a member gets a number, never a booking row
  $sess = Rows $svcH "class_sessions?select=id&class_id=eq.$($cA1.id)"
  Rpc (Api $stranger.token) "enroll_in_session" @{ p_session_id = $sess[0].id } | Out-Null
  $counts = Rpc (Api $trainer.token) "session_seat_counts" @{ p_session_ids = @($sess[0].id) }
  $n = @($counts | ForEach-Object { [int]$_.enrolled }) | Select-Object -First 1
  Check 8 "the tile's seat count comes from the aggregate RPC (trainer sees 1 enrolled, no row)" ($n -eq 1)
}
finally {
  # cleanup: the tenants cascade their classes, sessions, events and members; the users take their profiles
  foreach ($t in @($ta, $tb)) { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($t.id)" -Headers $adminH | Out-Null }
  foreach ($u in @($owner, $trainer, $stranger)) { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null }
}

""
if ($pass) { "ALL CHECKS PASSED" } else { "SOME CHECKS FAILED"; exit 1 }
