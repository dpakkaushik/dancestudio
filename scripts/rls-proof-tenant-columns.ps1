# RLS proof: THE COLUMNS AN OWNER MAY NOT WRITE BY HAND (11 Sep 2026).
#
# Every write to `businesses` in this app goes through a SECURITY DEFINER door -
# create_business_with_owner, update_business_profile, set_business_profile_photo,
# admin_set_business_visibility - and each of those validates what a form cannot
# be trusted with. But PostgREST is a door too, and the policy
# "owners update own businesses" named NO COLUMNS, so an owner could PATCH the row
# straight past every one of those checks:
#
#   * `type` - a studio (which costs a verified organization and Rs 1,200 a
#     month) flipped to an artist page (which costs the Rs 700 Artist plan), or
#     back, with neither ever bought. The CHECK constraint allows both values,
#     so nothing below the policy says no.
#   * `name` / `phone` / `socials` - update_business_profile caps the name,
#     demands a phone that looks like a phone and a link that looks like a link,
#     and stops at twelve of them. A PATCH obeys none of it.
#     (About was the example here until 20 Sep 2026, when the column was dropped.)
#
# The two columns somebody already thought about - `verified_at` and
# `visibility` - have guard triggers, and they are the CONTROLS here: if those
# two stop being blocked, this script is lying about the others.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/rls-proof-tenant-columns.ps1
$ErrorActionPreference = "Stop"
$PSDefaultParameterValues = @{ "Invoke-RestMethod:UserAgent" = "danceos-proof"; "Invoke-WebRequest:UserAgent" = "danceos-proof" }

$envFile = Join-Path $PSScriptRoot "..\.env.local"
$vars = @{}
Get-Content $envFile | Where-Object { $_ -match "^\s*[A-Z_]+=" } | ForEach-Object {
  $name, $value = $_ -split "=", 2
  $vars[$name.Trim()] = $value.Trim()
}
$base = $vars["NEXT_PUBLIC_SUPABASE_URL"]
$anon = $vars["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
$service = $vars["SUPABASE_SERVICE_ROLE_KEY"]
if (-not $base -or -not $anon -or -not $service) { throw "Supabase keys missing from .env.local" }

function Api($token) { return @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" } }
$svcH = @{ apikey = $service; Authorization = "Bearer $service"; "Content-Type" = "application/json"; Prefer = "return=representation" }
. (Join-Path $PSScriptRoot "proof-lib.ps1")   # New-Studio / Subscribe-Studio / Assert-City / Publish-Class (see that file)

$pass = $true
$stamp = Get-Date -Format "HHmmss"

# a verified organization of this run's own, so nothing pre-existing is touched
$email = "tc-owner-$stamp@example.com"
$u = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/admin/users" -Headers $svcH -Body (@{ email = $email; password = "Proof-passw0rd!"; email_confirm = $true } | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$base/rest/v1/profiles" -Headers $svcH -Body (@{ id = $u.id; full_name = "Col Owner $stamp"; role = "org"; city = "Pune"; created_by = $u.id; updated_by = $u.id } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/profiles?id=eq.$($u.id)" -Headers $svcH -Body (@{ verified_at = [DateTime]::UtcNow.ToString("o") } | ConvertTo-Json) | Out-Null
$owner = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers @{ apikey = $anon; "Content-Type" = "application/json" } -Body (@{ email = $email; password = "Proof-passw0rd!" } | ConvertTo-Json)
$H = Api $owner.access_token

$t = New-Studio $owner.access_token "Col Studio $stamp" "Kothrud" "Pune"
"0. Owner created '$($t.name)' (type=$($t.type)) - it is theirs, and they are its only owner"

# A PATCH that changes nothing about who may see the row, only what it IS.
#
# ⚠ THE ANSWER IS READ FROM THE DATABASE, NOT FROM THE RESPONSE (11 Sep 2026).
# The first version of this decided by counting the rows PostgREST echoed back,
# and that was wrong in the one direction that matters: once the policy was
# dropped the PATCH matched NO rows, PostgREST answered `[]`, PowerShell
# collapsed the empty array to $null — and `@($null).Count` is 1, NOT 0. So a
# write that was correctly refused was reported as "WROTE" with an empty value,
# and a green fix read as seven failures. A proof that can misread a pass as a
# fail is not a proof.
#
# So: read the column with the SERVICE ROLE before and after, and let the
# DATABASE say whether anything moved. An exception still counts as blocked (a
# guard trigger raising is a refusal), but it is no longer the only way to be
# sure — and nothing is believed on the strength of a response body.
function Get-Col($column) {
  $row = Invoke-RestMethod -Uri "$base/rest/v1/businesses?id=eq.$($t.id)&select=$column" -Headers $svcH
  return ($row | Select-Object -First 1).$column
}
function Try-Patch($label, $body, $column) {
  $before = Get-Col $column
  $threw = $false
  try {
    Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$($t.id)" -Headers $H -Body $body | Out-Null
  } catch {
    $threw = $true
  }
  $after = Get-Col $column
  $moved = ("$before" -ne "$after")
  if (-not $moved) { return @{ ok = $true; how = $(if ($threw) { "rejected" } else { "0 rows" }) } }
  return @{ ok = $false; how = "WROTE $after" }
}

# ORDER MATTERS. The `type` flip is LAST, because it is itself a way around the
# visibility gate: guard_business_visibility only gates `new.type = 'studio'`, so a
# studio flipped to an artist page can then be listed for free. Testing the
# controls first keeps each claim about one thing.

# 1. VALIDATION. The name: update_business_profile caps it at 80 characters and
#    businesses_name_check caps it at 140, so a direct PATCH is refused too.
#    ⚠ This check used to write a 5,000-character About, because About was the
#    longest free-text column a business had and carried its own CHECK. The
#    column was dropped on 20 Sep 2026, so the same claim - the DATABASE holds a
#    rule that a direct PATCH would otherwise walk past - is made on the name.
$long = "x" * 5000
$r = Try-Patch "name" (@{ name = $long } | ConvertTo-Json) "name"
"1. Owner writes a 5,000-character name (the CHECK caps it at 140): $(if ($r.ok) {"$($r.how) -- BLOCKED"} else {"WROTE 5,000 chars -- !!! VALIDATION BYPASSED !!!"})"
if (-not $r.ok) { $pass = $false }

# 2. VALIDATION. The RPC demands a phone that looks like a phone.
$r = Try-Patch "phone" '{"phone":"not a phone number at all"}' "phone"
"2. Owner writes a phone the RPC would refuse: $(if ($r.ok) {"$($r.how) -- BLOCKED"} else {"$($r.how) -- !!! VALIDATION BYPASSED !!!"})"
if (-not $r.ok) { $pass = $false }

# 3. VALIDATION, AND A SCRIPT URL ON A PUBLIC PAGE. The RPC demands every link be
#    an http(s) address. The app renders links as href={l.url} on the public
#    studio page, the public person page and the ADMIN's verification queue.
$r = Try-Patch "socials" '{"socials":[{"platform":"Instagram","url":"javascript:alert(1)"}]}' "socials"
"3. Owner stores a javascript: link: $(if ($r.ok) {"$($r.how) -- BLOCKED"} else {"$($r.how) -- !!! A SCRIPT URL IS NOW ON A PUBLIC PAGE !!!"})"
if (-not $r.ok) { $pass = $false }

# 4. CONTROL - guarded since 30 Aug 2026. If this stops being blocked the harness is broken.
$r = Try-Patch "verified_at" (@{ verified_at = [DateTime]::UtcNow.ToString("o") } | ConvertTo-Json) "verified_at"
"4. CONTROL - owner stamps their own tick: $(if ($r.ok) {"$($r.how) -- BLOCKED, as it has been"} else {"$($r.how) -- !!! REGRESSION !!!"})"
if (-not $r.ok) { $pass = $false }

# 5. THE SUBSCRIPTION GATE, on a studio that is still a studio. Rs 1,200 a month
#    is what puts one on Discover; this asks whether a PATCH does it for nothing.
$r = Try-Patch "visibility" '{"visibility":"listed"}' "visibility"
"5. Owner lists an UNSUBSCRIBED studio by hand: $(if ($r.ok) {"$($r.how) -- BLOCKED, the subscription gate holds"} else {"$($r.how) -- !!! DISCOVER IS FREE !!!"})"
if (-not $r.ok) { $pass = $false }

# 6. THE PAID GATE. A studio needs a verified org and its own Rs 1,200 subscription;
#    an artist page needs the Rs 700 Artist plan. Flipping `type` buys neither -
#    and lands on the side of guard_business_visibility that is not gated at all.
$r = Try-Patch "type" '{"type":"artist_page"}' "type"
"6. Owner flips studio -> artist page by hand: $(if ($r.ok) {"$($r.how) -- BLOCKED, the paid gate holds"} else {"$($r.how) -- !!! THE PAID GATE IS BYPASSABLE !!!"})"
if (-not $r.ok) { $pass = $false }

# 6b. THE TWO TOGETHER. If the flip went through, the row is now an artist page -
#     and guard_business_visibility gates only `new.type = 'studio'`, so listing it
#     is no longer gated by anything. This is the whole bypass, end to end:
#     a public business on Discover having bought neither plan.
$r = Try-Patch "visibility" '{"visibility":"listed"}' "visibility"
"6b. ...and then lists it, having bought no plan at all: $(if ($r.ok) {"$($r.how) -- BLOCKED"} else {"$($r.how) -- !!! FREE PUBLIC BUSINESS !!!"})"
if (-not $r.ok) { $pass = $false }

# 7. The door itself must still open: the RPC an owner is MEANT to use still works.
try {
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/update_business_profile" -Headers $H -Body (@{
    p_business_id = $t.id; p_founded_year = 2016; p_phone = "+91 98765 43210"
    p_socials = @(@{ platform = "Instagram"; url = "https://instagram.com/example" }); p_enquiry_types = @("Workshop")
    p_accepts_upi = $true; p_accepts_cards = $false; p_accepts_cash = $true; p_accepts_bank = $false } | ConvertTo-Json) | Out-Null
  # ⚠ reads the PHONE back, not the About: the column went on 20 Sep 2026 and
  #   selecting it is a 400, which is what this check reported as a broken door
  $back = Invoke-RestMethod -Uri "$base/rest/v1/businesses?id=eq.$($t.id)&select=founded_year,phone" -Headers $H
  $wrote = ($back[0].phone -eq "+91 98765 43210" -and $back[0].founded_year -eq 2016)
  "7. The door an owner is MEANT to use still opens: $(if ($wrote) {'phone and Since saved -- OK'} else {'DID NOT SAVE -- !!! FAILED !!!'})"
  if (-not $wrote) { $pass = $false }
} catch {
  "7. The door an owner is MEANT to use still opens: THREW '$($_.Exception.Message)' -- !!! FAILED !!!"; $pass = $false
}

# clean up: the owner goes, and the studio it made is soft-deleted by the service role
Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$($t.id)" -Headers $svcH -Body (@{ deleted_at = [DateTime]::UtcNow.ToString("o") } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $svcH | Out-Null

if ($pass) { "`nALL TENANT COLUMN CHECKS PASSED"; exit 0 } else { "`nTENANT COLUMN CHECKS FAILED"; exit 1 }
