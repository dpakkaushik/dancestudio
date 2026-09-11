# Proof for the settings-screens slice (migrations 20260830150000 + 20260830180000):
# the Artist plan, the business's own words, and the tick nobody can give themselves.
#
# The claims under test (the plan half re-cut 10 Sep 2026, when the Artist plan
# became a PAID subscription - Rs 700 a month through a Cashfree mandate): a fresh
# dancer has no plan; the FREE path refuses while the price list says the plan
# costs money, naming the price; an admin's grant reads active at Rs 0 and the
# role stays user (Pro is the plan, not a role); a plan is its holder's to read
# and nobody else's, and there is no direct write; the database itself refuses
# a second live plan for one person; ENDING means stop renewing - the tools stay
# on to the end of the period paid for; the business's About / Since / phone /
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
  if ($role -eq "org") {
    # 8 Sep 2026: a studio is public only under a VERIFIED organization - the service role stands in for the admin here
    Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/profiles?id=eq.$($u.id)" -Headers $svcH -Body (@{ verified_at = [DateTime]::UtcNow.ToString("o") } | ConvertTo-Json) | Out-Null
  }
  $tok = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $anonH -Body (@{
    email = $email; password = "Proof-passw0rd!" } | ConvertTo-Json)
  return [pscustomobject]@{ id = $u.id; email = $email; token = $tok.access_token }
}
function TenantBody($id, $about, $year, $phone, $socials, $enq, $upi, $cards, $cash, $bank) {
  return @{ p_tenant_id = $id; p_about = $about; p_founded_year = $year; p_phone = $phone; p_socials = $socials; p_enquiry_types = $enq;
            p_accepts_upi = $upi; p_accepts_cards = $cards; p_accepts_cash = $cash; p_accepts_bank = $bank }
}
function Plain($token) { return @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json" } }

# 10 Sep 2026: the Artist plan is a PAID subscription (Rs 700 a month through Cashfree), so the free
# RPC refuses it. The service role stands in for an admin's grant - the row admin_grant_subscription
# writes: granted, active, Rs 0, twelve months, no mandate.
function Grant-ArtistPlan($userId) {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/subscriptions" -Headers $svcH -Body (@{
    kind = "artist"; user_id = $userId; plan_key = "artist_monthly"; price_inr = 0; period = "monthly"; status = "active"
    current_period_start = (Get-Date).ToString("yyyy-MM-dd"); current_period_end = (Get-Date).AddMonths(12).ToString("yyyy-MM-dd"); granted = $true
    note = "Granted by a proof script - nothing charged"; created_by = $userId; updated_by = $userId } | ConvertTo-Json) | Out-Null
}

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$dancer = New-EmailUser "set-a-$stamp@example.com" "Plan Proof $stamp" "user"
$owner = New-EmailUser "set-b-$stamp@example.com" "Owner Proof $stamp" "org"
$stranger = New-EmailUser "set-c-$stamp@example.com" "Stranger Proof $stamp" "user"
$tenantId = $null
$TSEL = "select=id,about,founded_year,phone,socials,enquiry_types,accepts_upi,accepts_cards,accepts_cash,accepts_bank,verified_at"

try {
  # -- the Artist plan (10 Sep 2026: a PAID subscription, Rs 700 a month through Cashfree) --
  # 1. a fresh dancer has no plan
  $p0 = Rpc (Api $dancer.token) "my_artist_plan" @{}
  Check 1 "a fresh dancer has no plan (my_artist_plan returns $(@($p0).Count) rows)" (@($p0).Count -eq 0)

  # 2. the FREE path refuses while the price list says the plan costs money, and names the price
  $cat = Rows (Api $dancer.token) "plan_catalog?select=key,price_inr,active&key=eq.artist_monthly"
  $r2 = Fails { Rpc (Api $dancer.token) "activate_artist_plan" @{ p_plan = "monthly" } }
  Check 2 "the price list says Rs $($cat[0].price_inr) a month and the free path is refused naming it ('costs')" (
    $cat.Count -eq 1 -and $cat[0].price_inr -gt 0 -and $r2 -and $r2 -like "*costs*")

  # 3. an admin's grant (the service role stands in) reads active at Rs 0 for twelve months, and the role STAYS user
  Grant-ArtistPlan $dancer.id
  $p1 = @(Rpc (Api $dancer.token) "my_artist_plan" @{})
  $prof = Rows (Api $dancer.token) "profiles?select=role&id=eq.$($dancer.id)"
  $today = (Get-Date).ToString("yyyy-MM-dd")
  $untilOk = [datetime]$p1[0].until -gt [datetime]$today
  Check 3 "a granted plan reads active until $($p1[0].until) at Rs $($p1[0].amount_inr), and the role STAYS $($prof[0].role) (Pro is the plan, not a role)" (
    $p1.Count -eq 1 -and $p1[0].amount_inr -eq 0 -and $p1[0].active -eq $true -and $untilOk -and $prof[0].role -eq "user")

  # 4. a plan is its holder's: the stranger reads 0 rows, a direct insert is refused, the public cannot activate
  $seen = Rows (Api $stranger.token) "subscriptions?select=id&user_id=eq.$($dancer.id)"
  $ins = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/subscriptions" -Headers (Api $stranger.token) -Body (@{ kind = "artist"; user_id = $stranger.id; plan_key = "artist_monthly"; price_inr = 0; period = "monthly"; status = "active"; current_period_end = "2099-01-01" } | ConvertTo-Json) }
  $pub = Fails { Rpc $anonH "activate_artist_plan" @{ p_plan = "monthly" } }
  Check 4 "a plan is private (stranger reads $($seen.Count)); no direct insert; the public cannot activate" ($seen.Count -eq 0 -and $ins -and $pub)

  # 5. an invented plan is refused with a sentence
  $r5 = Fails { Rpc (Api $dancer.token) "activate_artist_plan" @{ p_plan = "forever" } }
  Check 5 "an invented plan is refused ('monthly or yearly')" ($r5 -and $r5 -like "*monthly or yearly*")

  # 6. ONE live plan per person: a second live row is refused by the database itself (a partial unique index)
  $r6 = Fails { Grant-ArtistPlan $dancer.id }
  Check 6 "a second live Artist plan for the same person is refused by the database" ($null -ne $r6)

  # 6b. ENDING means stop renewing: the row says so and the tools stay on until the period paid for is over (the standard); the role still user
  Rpc (Api $dancer.token) "end_artist_plan" @{} | Out-Null
  $p3 = @(Rpc (Api $dancer.token) "my_artist_plan" @{})
  $sub3 = Rows (Api $dancer.token) "subscriptions?select=status,cancel_at_period_end&user_id=eq.$($dancer.id)&kind=eq.artist"
  $prof = Rows (Api $dancer.token) "profiles?select=role&id=eq.$($dancer.id)"
  Check "6b" "ending stops the renewal (status $($sub3[0].status), cancel_at_period_end $($sub3[0].cancel_at_period_end)) while the plan stays active until $($p3[0].until); role still $($prof[0].role)" (
    $p3.Count -eq 1 -and $p3[0].active -eq $true -and $sub3.Count -eq 1 -and $sub3[0].cancel_at_period_end -eq $true -and $sub3[0].status -eq "canceled" -and $prof[0].role -eq "user")

  # -- the business's own words ------------------------------------
# 10 Sep 2026: a studio is born UNLISTED and goes public when ITS OWN subscription is live (one
# per studio, Rs 1,200 a month, renewing on its own through Cashfree). The service role stands in
# for an admin's grant here - a granted, active row at Rs 0 - and lists the studio as the grant would.
function Subscribe-Studio($tenantId) {
  $ownerRows = @(Invoke-RestMethod -Method Get -Uri "$base/rest/v1/tenant_members?tenant_id=eq.$tenantId&member_role=eq.owner&deleted_at=is.null&select=user_id" -Headers $svcH)
  $ownerId = [string]$ownerRows[0].user_id
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/subscriptions" -Headers $svcH -Body (@{
    kind = "studio"; user_id = $ownerId; tenant_id = $tenantId; plan_key = "studio_monthly"; price_inr = 0; period = "monthly"; status = "active"
    current_period_start = (Get-Date).ToString("yyyy-MM-dd"); current_period_end = (Get-Date).AddYears(1).ToString("yyyy-MM-dd"); granted = $true
    note = "Granted by a proof script - nothing charged"; created_by = $ownerId; updated_by = $ownerId } | ConvertTo-Json) | Out-Null
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenants?id=eq.$tenantId" -Headers $svcH -Body (@{ visibility = "listed" } | ConvertTo-Json) | Out-Null
}
  $t = Rpc (Api $owner.token) "create_tenant_with_owner" @{ p_name = "Settings Proof Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }
  Subscribe-Studio ([string]$t.id)
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
  #     (the owner is a VERIFIED organization since 8 Sep 2026 - stamped by the service role above - so its
  #      tick is not null; the claim is that the PATCH does not MOVE it)
  $before11 = (Rows (Api $owner.token) "profiles?select=verified_at&id=eq.$($owner.id)")[0].verified_at
  $r11a = Fails { Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenants?id=eq.$tenantId" -Headers (Plain $owner.token) -Body (@{ verified_at = "2026-08-29T00:00:00Z" } | ConvertTo-Json) }
  $r11b = Fails { Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/profiles?id=eq.$($owner.id)" -Headers (Plain $owner.token) -Body (@{ verified_at = "2026-08-29T00:00:00Z" } | ConvertTo-Json) }
  $row11 = Rows $anonH "tenants?$TSEL&id=eq.$tenantId"
  $prof11 = Rows (Api $owner.token) "profiles?select=verified_at&id=eq.$($owner.id)"
  # ⚠ HOW THE REFUSAL ARRIVES CHANGED, AND THE CLAIM DID NOT (11 Sep 2026).
  # `profiles` still REFUSES with an exception — guard_verified_at raises — but
  # `tenants` now matches NO ROWS, because
  # `20260913100000_doors_that_were_not_doors` dropped the column-less update
  # policy an owner used to PATCH through. Both are refusals; only one throws.
  # So the test is what it always claimed to be about: THE TICK DID NOT MOVE.
  Check 11 "an owner cannot tick their business and an account cannot tick itself (both refused; the business tick still null, the organization's tick unmoved)" (
    $r11b -and $null -eq $row11[0].verified_at -and $prof11[0].verified_at -eq $before11)

  # 12. ... while the owner still changes the row THROUGH ITS OWN DOOR, and the
  #     service role sets the tick.
  #
  # ⚠ This used to PATCH `tenants` directly as the owner, and that is exactly
  # what migration 20260913100000 closed: the policy naming no columns was the
  # same one that let an owner flip `type` and put a business on Discover having
  # bought no plan. `set_tenant_location` is the door for `area` now — it checks
  # ownership, bounds the point, and will only write a city on the closed list.
  $r12 = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/set_tenant_location" -Headers (Plain $owner.token) -Body (@{
    p_tenant_id = $tenantId; p_lat = 18.5204; p_lng = 73.8567; p_area = "Baner"; p_city = "Pune" } | ConvertTo-Json)
  $r12direct = Fails { Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenants?id=eq.$tenantId" -Headers (Plain $owner.token) -Body (@{ type = "trainer_business" } | ConvertTo-Json) }
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenants?id=eq.$tenantId" -Headers $svcH -Body (@{ verified_at = "2026-08-29T00:00:00Z" } | ConvertTo-Json) | Out-Null
  $row12 = Rows $anonH "tenants?select=area,type,verified_at&id=eq.$tenantId"
  Check 12 "the owner edits through the door (area -> $($row12[0].area)) but not around it (type still $($row12[0].type)), and the service role sets the tick ($($row12[0].verified_at))" (
    $row12[0].area -eq "Baner" -and $row12[0].type -eq "studio" -and $null -ne $row12[0].verified_at)
}
finally {
  if ($tenantId) { try { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$tenantId" -Headers $svcH | Out-Null } catch {} }
  foreach ($u in @($dancer, $owner, $stranger)) { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null }
}

""
if ($pass) { "ALL CHECKS PASSED" } else { "SOME CHECKS FAILED"; exit 1 }

