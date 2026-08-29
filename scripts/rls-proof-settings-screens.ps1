# Proof for the settings-screens slice (migrations 20260830150000 + 20260830180000):
# the Artist plan, the business's own words, and the tick nobody can give themselves.
#
# The claims under test: a fresh dancer has no plan; activating one grants a
# period from today at Rs 0 (the pilot) and makes the same profile an artist;
# activating again EXTENDS from the current end, never from today; a plan is its
# holder's to read and nobody else's, and there is no direct write; ending it
# puts the toolset away and the role back; the business's About / Since / phone /
# links / enquiry types / accepted methods go through one owner-only door, which
# refuses a stranger and a trainer, an over-long About, a bad phone and a bare
# handle, and the PUBLIC reads the words back on a listed business; verified_at
# cannot be set by the owner or the person through a direct PATCH (the guard
# trigger) while the service role can set it.
#
# Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-settings-screens.ps1
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
    try { $detail = [string]$_.ErrorDetails.Message } catch {}
    if (-not $detail) {
      try { $st = $_.Exception.Response.GetResponseStream(); if ($st.CanSeek) { $st.Position = 0 }; $sr = New-Object IO.StreamReader($st); $detail = $sr.ReadToEnd() } catch {}
    }
    if (-not $detail) { $detail = [string]$_.Exception.Message }
    throw "rpc $fn failed: $detail"
  }
}
function Rows($headers, $path) {
  $res = Invoke-WebRequest -Method Get -Uri "$base/rest/v1/$path" -Headers $headers -UseBasicParsing
  if ($res.Content.Trim() -eq "[]") { return ,@() }
  return ,@(($res.Content | ConvertFrom-Json) | Where-Object { $null -ne $_ })
}
function Fails($block) {
  try { & $block | Out-Null; return $null }
  catch { return "$_" }
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
function TenantBody($id, $about, $year, $phone, $socials, $enq, $upi, $cards, $cash, $bank) {
  return @{ p_tenant_id = $id; p_about = $about; p_founded_year = $year; p_phone = $phone; p_socials = $socials; p_enquiry_types = $enq;
            p_accepts_upi = $upi; p_accepts_cards = $cards; p_accepts_cash = $cash; p_accepts_bank = $bank }
}
function Plain($token) { return @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json" } }

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$dancer = New-EmailUser "set-a-$stamp@example.com" "Plan Proof $stamp" "dancer"
$owner = New-EmailUser "set-b-$stamp@example.com" "Owner Proof $stamp" "studio"
$stranger = New-EmailUser "set-c-$stamp@example.com" "Stranger Proof $stamp" "dancer"
$tenantId = $null
$TSEL = "select=id,about,founded_year,phone,socials,enquiry_types,accepts_upi,accepts_cards,accepts_cash,accepts_bank,verified_at"

try {
  # -- the Artist plan ---------------------------------------------
  # 1. a fresh dancer has no plan
  $p0 = Rpc (Api $dancer.token) "my_artist_plan" @{}
  Check 1 "a fresh dancer has no plan (my_artist_plan returns $(@($p0).Count) rows)" (@($p0).Count -eq 0)

  # 2. activating grants a month from today at Rs 0 and makes the same profile an artist
  $a1 = Rpc (Api $dancer.token) "activate_artist_plan" @{ p_plan = "monthly" }
  $p1 = @(Rpc (Api $dancer.token) "my_artist_plan" @{})
  $prof = Rows (Api $dancer.token) "profiles?select=role&id=eq.$($dancer.id)"
  $today = (Get-Date).ToString("yyyy-MM-dd")
  $untilOk = [datetime]$p1[0].until -gt [datetime]$today
  Check 2 "activating grants a monthly period to $($p1[0].until) at Rs $($p1[0].amount_inr), active, and the role is now $($prof[0].role)" (
    $p1.Count -eq 1 -and $p1[0].plan -eq "monthly" -and $p1[0].amount_inr -eq 0 -and $p1[0].active -eq $true -and $untilOk -and $prof[0].role -eq "trainer")

  # 3. activating again extends from the current end, not from today
  $a2 = Rpc (Api $dancer.token) "activate_artist_plan" @{ p_plan = "yearly" }
  $p2 = @(Rpc (Api $dancer.token) "my_artist_plan" @{})
  $gap = ([datetime]$p2[0].until - [datetime]$p1[0].until).TotalDays
  Check 3 "a second period extends from the first's end ($($p1[0].until) -> $($p2[0].until), +$gap days)" ($gap -ge 365 -and $gap -le 366)

  # 4. a plan is its holder's: the stranger reads 0 rows, direct insert is refused, the public cannot activate
  $seen = Rows (Api $stranger.token) "artist_plans?select=id&user_id=eq.$($dancer.id)"
  $ins = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/artist_plans" -Headers (Api $stranger.token) -Body (@{ user_id = $stranger.id; plan = "monthly"; until = "2099-01-01" } | ConvertTo-Json) }
  $pub = Fails { Rpc $anonH "activate_artist_plan" @{ p_plan = "monthly" } }
  Check 4 "a plan is private (stranger reads $($seen.Count)); no direct insert; the public cannot activate" ($seen.Count -eq 0 -and $ins -and $pub)

  # 5. an invented plan is refused with a sentence
  $r5 = Fails { Rpc (Api $dancer.token) "activate_artist_plan" @{ p_plan = "forever" } }
  Check 5 "an invented plan is refused ('monthly or yearly')" ($r5 -and $r5 -like "*monthly or yearly*")

  # 6. ending puts the toolset away and the role back
  Rpc (Api $dancer.token) "end_artist_plan" @{} | Out-Null
  $p3 = @(Rpc (Api $dancer.token) "my_artist_plan" @{})
  $prof = Rows (Api $dancer.token) "profiles?select=role&id=eq.$($dancer.id)"
  Check 6 "ending the plan: no active plan (active=$($p3[0].active)), role back to $($prof[0].role)" (
    ($p3.Count -eq 0 -or $p3[0].active -eq $false) -and $prof[0].role -eq "dancer")

  # 6b. taking it again the same day (the new month ends on the ended row's date) still reads ACTIVE
  Rpc (Api $dancer.token) "activate_artist_plan" @{ p_plan = "monthly" } | Out-Null
  $p4 = @(Rpc (Api $dancer.token) "my_artist_plan" @{})
  Check "6b" "re-taking the plan after ending it reads active (a live period outranks an ended one on the same date)" ($p4.Count -eq 1 -and $p4[0].active -eq $true)
  Rpc (Api $dancer.token) "end_artist_plan" @{} | Out-Null

  # -- the business's own words ------------------------------------
  $t = Rpc (Api $owner.token) "create_tenant_with_owner" @{ p_name = "Settings Proof Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }
  $tenantId = [string]$t.id
  if (-not $tenantId) { $tenantId = [string]$t }

  # 7. the owner's door saves everything and the PUBLIC reads it on a listed business
  $links = @(@{ platform = "Instagram"; url = "https://instagram.com/proofstudio" }, @{ platform = "WhatsApp"; url = "https://wa.me/919876543210" })
  Rpc (Api $owner.token) "update_tenant_profile" (TenantBody $tenantId "Where the city comes to move." 2016 "+91 98765 43210" $links @("celebration", "private") $true $true $false $true) | Out-Null
  $pubRow = Rows $anonH "tenants?$TSEL&id=eq.$tenantId"
  Check 7 "the owner's words are saved and the public reads them (about, Since $($pubRow[0].founded_year), phone, $(@($pubRow[0].socials).Count) links, $(@($pubRow[0].enquiry_types).Count) enquiry types, cash off / bank on)" (
    $pubRow.Count -eq 1 -and $pubRow[0].about -eq "Where the city comes to move." -and $pubRow[0].founded_year -eq 2016 -and $pubRow[0].phone -eq "+91 98765 43210" -and
    @($pubRow[0].socials).Count -eq 2 -and (@($pubRow[0].enquiry_types) -join ",") -eq "celebration,private" -and
    $pubRow[0].accepts_cash -eq $false -and $pubRow[0].accepts_bank -eq $true -and $pubRow[0].accepts_upi -eq $true)

  # 8. a stranger is refused with the door's sentence, and their PATCH changes nothing
  $r8 = Fails { Rpc (Api $stranger.token) "update_tenant_profile" (TenantBody $tenantId "hijacked" $null $null @() $null $true $true $true $true) }
  try { Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenants?id=eq.$tenantId" -Headers (Plain $stranger.token) -Body (@{ about = "hijacked" } | ConvertTo-Json) | Out-Null } catch {}
  $row8 = Rows $anonH "tenants?$TSEL&id=eq.$tenantId"
  Check 8 "a stranger is refused ('only an owner') and a direct PATCH changes nothing (still '$($row8[0].about)')" (
    $r8 -and $r8 -like "*only an owner*" -and $row8[0].about -eq "Where the city comes to move.")

  # 9. the door validates: a 221-character About, a bad phone, a bare handle
  $r9a = Fails { Rpc (Api $owner.token) "update_tenant_profile" (TenantBody $tenantId ("x" * 221) $null $null @() $null $true $true $true $true) }
  $r9b = Fails { Rpc (Api $owner.token) "update_tenant_profile" (TenantBody $tenantId $null $null "call me" @() $null $true $true $true $true) }
  $r9c = Fails { Rpc (Api $owner.token) "update_tenant_profile" (TenantBody $tenantId $null $null $null @(@{ platform = "Instagram"; url = "proofstudio" }) $null $true $true $true $true) }
  Check 9 "a 221-char About, a bad phone and a bare handle are each refused" (
    $r9a -and $r9a -like "*220*" -and $r9b -and $r9b -like "*8 to 18 digits*" -and $r9c -and $r9c -like "*web address*")

  # 10. null enquiry types means every type (the default); clearing lands as null, not blanks (the app sends null for an emptied phone - the door refuses a blank string as not-a-number)
  Rpc (Api $owner.token) "update_tenant_profile" (TenantBody $tenantId "  " $null $null @() $null $true $true $true $false) | Out-Null
  $row10 = Rows (Api $owner.token) "tenants?$TSEL&id=eq.$tenantId"
  Check 10 "clearing leaves null (about, phone, enquiry types all null; 0 links)" (
    $null -eq $row10[0].about -and $null -eq $row10[0].phone -and $null -eq $row10[0].enquiry_types -and @($row10[0].socials).Count -eq 0)

  # -- the tick nobody can give themselves -------------------------
  # 11. the owner's direct PATCH of verified_at is refused by the guard; so is a person's on their own profile
  $r11a = Fails { Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenants?id=eq.$tenantId" -Headers (Plain $owner.token) -Body (@{ verified_at = "2026-08-29T00:00:00Z" } | ConvertTo-Json) }
  $r11b = Fails { Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/profiles?id=eq.$($owner.id)" -Headers (Plain $owner.token) -Body (@{ verified_at = "2026-08-29T00:00:00Z" } | ConvertTo-Json) }
  $row11 = Rows $anonH "tenants?$TSEL&id=eq.$tenantId"
  $prof11 = Rows (Api $owner.token) "profiles?select=verified_at&id=eq.$($owner.id)"
  Check 11 "an owner cannot tick their business and a person cannot tick themselves (both refused; both still null)" (
    $r11a -and $r11b -and $null -eq $row11[0].verified_at -and $null -eq $prof11[0].verified_at)

  # 12. ... while the owner can still change everything else about the row, and the service role sets the tick
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenants?id=eq.$tenantId" -Headers (Plain $owner.token) -Body (@{ area = "Baner" } | ConvertTo-Json) | Out-Null
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenants?id=eq.$tenantId" -Headers $svcH -Body (@{ verified_at = "2026-08-29T00:00:00Z" } | ConvertTo-Json) | Out-Null
  $row12 = Rows $anonH "tenants?select=area,verified_at&id=eq.$tenantId"
  Check 12 "the owner still edits the row (area -> $($row12[0].area)) and the service role sets the tick ($($row12[0].verified_at))" (
    $row12[0].area -eq "Baner" -and $null -ne $row12[0].verified_at)
}
finally {
  if ($tenantId) { try { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$tenantId" -Headers $svcH | Out-Null } catch {} }
  foreach ($u in @($dancer, $owner, $stranger)) { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null }
}

""
if ($pass) { "ALL CHECKS PASSED" } else { "SOME CHECKS FAILED"; exit 1 }

