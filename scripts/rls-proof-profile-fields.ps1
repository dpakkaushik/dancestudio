# Proof for the Profile tab parity slice - update_my_profile and the new fields.
#
# The claims under test: the one door writes only the CALLER's row (there is no
# p_user_id to pass, and the row named by auth.uid() is the only one that moves);
# a signed-in stranger reads the fields back (profiles is signed-in readable,
# Step 1) and the public reads nothing; the door refuses what a form cannot be
# trusted to catch - an impossible age, an over-long bio, a link that is not an
# http(s) address, two links for one platform, an empty style; styles are
# de-duplicated and keep their order; a member number is assigned to every
# profile at creation and no two are the same; a direct PATCH of another
# person's row changes nothing.
#
# Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-profile-fields.ps1
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
    # PowerShell 5.1 does not always surface the body the same way: try the parsed
    # ErrorDetails first, then the raw stream rewound to its start
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
# a call expected to be refused: returns the refusal's words, or $null if it went through
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
# the body the Edit / links / styles sheets send, with one field changed at a time
function ProfileBody($name, $city, $age, $socials, $styles) {
  # the About argument left on 20 Sep 2026 with profiles.about and p_about
  return @{ p_full_name = $name; p_city = $city; p_age = $age; p_socials = $socials; p_styles = $styles }
}
$SEL = "select=id,full_name,city,age,socials,styles,member_no"

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$rhea = New-EmailUser "prof-a-$stamp@example.com" "Rhea Proof $stamp" "user"
$other = New-EmailUser "prof-b-$stamp@example.com" "Other Proof $stamp" "user"

try {
  # 1. every profile gets a member number at creation, and no two are the same
  $mine = Rows (Api $rhea.token) "profiles?$SEL&id=eq.$($rhea.id)"
  $theirs = Rows (Api $other.token) "profiles?$SEL&id=eq.$($other.id)"
  Check 1 "a member number is assigned at creation and is unique ($($mine[0].member_no) vs $($theirs[0].member_no))" (
    $mine[0].member_no -gt 0 -and $theirs[0].member_no -gt 0 -and $mine[0].member_no -ne $theirs[0].member_no)

  # 2. the door writes the caller's own row: name, city, age, bio, two links, three styles
  $links = @(@{ platform = "Instagram"; url = "https://instagram.com/rheamoves" }, @{ platform = "YouTube"; url = "https://youtube.com/@rheamoves" })
  Rpc (Api $rhea.token) "update_my_profile" (ProfileBody "Rhea Kapoor $stamp" "New Delhi" 24 $links @("Hip-Hop", "Kathak", "Contemporary")) | Out-Null
  $mine = Rows (Api $rhea.token) "profiles?$SEL&id=eq.$($rhea.id)"
  Check 2 "the caller's row takes the sheet's fields (age $($mine[0].age), $(@($mine[0].socials).Count) links, $(@($mine[0].styles).Count) styles)" (
    $mine[0].full_name -eq "Rhea Kapoor $stamp" -and $mine[0].city -eq "New Delhi" -and $mine[0].age -eq 24 -and
    $mine[0].about -eq "Movement is a language." -and @($mine[0].socials).Count -eq 2 -and (@($mine[0].styles) -join ",") -eq "Hip-Hop,Kathak,Contemporary")

  # 3. ... and nobody else's row moved
  $theirs2 = Rows (Api $other.token) "profiles?$SEL&id=eq.$($other.id)"
  Check 3 "the other person's row is untouched (no p_user_id exists to aim the door at)" (
    $theirs2[0].full_name -eq "Other Proof $stamp" -and $null -eq $theirs2[0].age -and @($theirs2[0].socials).Count -eq 0)

  # 4. a signed-in person reads the fields back; the public reads nothing at all
  $seen = Rows (Api $other.token) "profiles?$SEL&id=eq.$($rhea.id)"
  $anonSeen = Rows $anonH "profiles?$SEL&id=eq.$($rhea.id)"
  Check 4 "a signed-in person reads the name and the links (Step 1's policy); the public reads $($anonSeen.Count) rows" (
    $seen.Count -eq 1 -and $seen[0].full_name -eq "Rhea Kapoor $stamp" -and @($seen[0].socials).Count -eq 2 -and $anonSeen.Count -eq 0)

  # 5. an impossible age is refused with a sentence
  $r5 = Fails { Rpc (Api $rhea.token) "update_my_profile" (ProfileBody "Rhea Kapoor $stamp" "New Delhi" 7 $links @("Hip-Hop")) }
  Check 5 "an age of 7 is refused ('$(if ($r5) { ($r5 -split 'message')[1] } else { 'went through' })')" ($r5 -and $r5 -like "*between 13 and 99*")

  # 6. THE BIO IS GONE (20 Sep 2026). This check used to prove the 220-character
  #    cap; the user dropped the column, so the rule it tested no longer exists
  #    and asserting it would be asserting the old world. What is worth proving
  #    instead is that the column really went: asking for it is an error, and the
  #    door refuses the argument that used to carry it.
  $r6 = Fails { Rows (Api $rhea.token) "profiles?select=id,about&id=eq.$($rhea.id)" }
  $r6b = Fails { Rpc (Api $rhea.token) "update_my_profile" @{ p_full_name = "Rhea Kapoor $stamp"; p_city = "New Delhi"; p_age = 24; p_about = "a bio"; p_socials = $links; p_styles = @("Hip-Hop") } }
  Check 6 "profiles.about is gone: reading it fails, and p_about is refused" ($r6 -and $r6b)

  # 7. a link that is not a web address, and two links for one platform, are refused
  $r7a = Fails { Rpc (Api $rhea.token) "update_my_profile" (ProfileBody "Rhea Kapoor $stamp" "New Delhi" 24 @(@{ platform = "Instagram"; url = "rheamoves" }) @("Hip-Hop")) }
  $r7b = Fails { Rpc (Api $rhea.token) "update_my_profile" (ProfileBody "Rhea Kapoor $stamp" "New Delhi" 24 @(@{ platform = "Instagram"; url = "https://a.example" }, @{ platform = "Instagram"; url = "https://b.example" }) @("Hip-Hop")) }
  Check 7 "a bare handle is refused ('web address'), and one link per platform" (
    $r7a -and $r7a -like "*web address*" -and $r7b -and $r7b -like "*one link per platform*")

  # 8. an empty style is refused; a repeated style is kept once, in order
  $r8 = Fails { Rpc (Api $rhea.token) "update_my_profile" (ProfileBody "Rhea Kapoor $stamp" "New Delhi" 24 @() @("Hip-Hop", "")) }
  Rpc (Api $rhea.token) "update_my_profile" (ProfileBody "Rhea Kapoor $stamp" "New Delhi" 24 @() @("Kathak", "Hip-Hop", "Kathak")) | Out-Null
  $mine = Rows (Api $rhea.token) "profiles?$SEL&id=eq.$($rhea.id)"
  Check 8 "an empty style is refused; a repeat is kept once in order (got: $(@($mine[0].styles) -join ','))" (
    $r8 -and (@($mine[0].styles) -join ",") -eq "Kathak,Hip-Hop")

  # 9. a direct PATCH of somebody else's row changes nothing (Step 1's own-row policy)
  $plainH = @{ apikey = $anon; Authorization = "Bearer $($other.token)"; "Content-Type" = "application/json" }
  # ⚠ the column it used to hijack (about) is gone, so it aims at the CITY - the
  #   claim is about the own-row policy, not about which column is written
  try { Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/profiles?id=eq.$($rhea.id)" -Headers $plainH -Body (@{ city = "Hijacked" } | ConvertTo-Json) | Out-Null } catch {}
  $mine = Rows (Api $rhea.token) "profiles?$SEL&id=eq.$($rhea.id)"
  Check 9 "a direct PATCH of another person's row changes nothing (city is still '$($mine[0].city)')" ($mine[0].city -ne "Hijacked")

  # 10. the public cannot call the door at all
  $r10 = Fails { Rpc $anonH "update_my_profile" (ProfileBody "X" $null $null @() @()) }
  Check 10 "the public cannot call update_my_profile" ($null -ne $r10)

  # 11. clearing: a null age comes back as null, not as an empty string - but a
  #     CITY is required and a USER keeps at least one style (9 Sep 2026, requirements 2 and 3)
  $r11a = Fails { Rpc (Api $rhea.token) "update_my_profile" (ProfileBody "Rhea Kapoor $stamp" "" $null @() @("Kathak")) }
  $r11b = Fails { Rpc (Api $rhea.token) "update_my_profile" (ProfileBody "Rhea Kapoor $stamp" "New Delhi" $null @() @()) }
  Rpc (Api $rhea.token) "update_my_profile" (ProfileBody "Rhea Kapoor $stamp" "New Delhi" $null @() @("Kathak")) | Out-Null
  $mine = Rows (Api $rhea.token) "profiles?$SEL&id=eq.$($rhea.id)"
  Check 11 "an empty city is refused ($r11a); a user with no style is refused ($r11b); age clears to null, links to 0, the one style stays" (
    ($r11a -like "*city is required*") -and ($r11b -like "*at least one dance style*") -and
    $mine[0].city -eq "New Delhi" -and $null -eq $mine[0].age -and @($mine[0].socials).Count -eq 0 -and @($mine[0].styles).Count -eq 1)

  # 12. an ORGANIZATION carries no styles and - since 20260914110000 (14 Sep 2026,
  #     "an organization keeps no link") - needs no link of its own: what DanceOS
  #     checks is each STUDIO's links and photos, and the organization's own
  #     paperwork is its GST number. This check asserted the OLD rule ("at least
  #     one link") and had been red since that migration; re-cut 16 Sep 2026.
  $org = New-EmailUser "prof-o-$stamp@example.com" "Org Proof $stamp" "org"
  Rpc (Api $org.token) "update_my_profile" (ProfileBody "Org Proof $stamp" "Pune" $null @() @("Hip-Hop")) | Out-Null
  $noLink = Rows (Api $org.token) "profiles?$SEL&id=eq.$($org.id)"
  Rpc (Api $org.token) "update_my_profile" (ProfileBody "Org Proof $stamp" "Pune" $null @(@{ platform = "Instagram"; url = "https://instagram.com/orgproof" }) @("Hip-Hop")) | Out-Null
  $orgRow = Rows (Api $org.token) "profiles?$SEL&id=eq.$($org.id)"
  Check 12 "an organization with no link SAVES (links: $(@($noLink[0].socials).Count)); with one it saves that ($(@($orgRow[0].socials).Count)); and its styles are empty either way ($(@($noLink[0].styles).Count), $(@($orgRow[0].styles).Count))" (
    @($noLink[0].socials).Count -eq 0 -and @($orgRow[0].socials).Count -eq 1 -and @($noLink[0].styles).Count -eq 0 -and @($orgRow[0].styles).Count -eq 0)
}
finally {
  foreach ($u in @($rhea, $other, $org)) { if ($u) { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null } }
}

""
if ($pass) { "ALL CHECKS PASSED" } else { "SOME CHECKS FAILED"; exit 1 }
