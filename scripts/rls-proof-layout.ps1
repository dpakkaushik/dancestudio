# Proof for 20260922090000_a_grid_is_arranged (22 Sep 2026), as real roles
# against the live database. Runs ONLY on the migrated schema.
#
# TWO GROUPS, because this feature has two halves and only one of them is SQL:
#
#   A. THE RULE - scripts/tool-order-proof.mjs, run against the REAL module
#      (features/home/toolOrder.ts). What it proves is the thing the backlog row
#      said nothing enforced: a stored order that names a tile which no longer
#      exists must not break the grid, and a tile the stored order does NOT name
#      must never be dropped. That is the half that would cost somebody a door
#      months after they arranged their grid, and no SQL can see it.
#
#   B. THE GUARD - and the point of this group is that the DOOR IS NOT IT.
#      Step 1's "users update own profile" policy names no columns, so the owner
#      of a row can PATCH `layout` straight through PostgREST whatever
#      set_my_layout does. So check 3 has the OWNER try a bad write and be
#      refused BY THE CHECK, by name, and check 4 shows a good one going through
#      - which is exactly why the shape had to be constrained by the database.
#      (The same shape as the 11 Sep revenue bypass, one column further on.)
#
# ASCII ONLY (the 11 Sep 2026 lesson). Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-layout.ps1
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
function New-EmailUser($email, $name) {
  $u = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/admin/users" -Headers $adminH -Body (@{
    email = $email; password = "Proof-passw0rd!"; email_confirm = $true } | ConvertTo-Json)
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/profiles" -Headers $svcH -Body (@{
    id = $u.id; full_name = $name; role = "user"; city = "Pune"; styles = @("Hip-Hop"); created_by = $u.id; updated_by = $u.id } | ConvertTo-Json) | Out-Null
  $tok = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $anonH -Body (@{
    email = $email; password = "Proof-passw0rd!" } | ConvertTo-Json)
  return [pscustomobject]@{ id = $u.id; email = $email; name = $name; token = $tok.access_token }
}
# what one account's layout holds right now, read as the SERVICE role so the
# assertion is about what is STORED rather than about what a policy let through
function Layout($userId) {
  $rows = Get-Rows $svcH "profiles?id=eq.$userId&select=layout"
  if ($rows.Count -eq 0) { return $null }
  return $rows[0].layout
}
function Patch-As($token, $userId, $body) {
  return Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/profiles?id=eq.$userId" -Headers (Api $token) -Body ($body | ConvertTo-Json -Depth 12)
}

$pass = $true
$stamp = Get-Date -Format "HHmmss"

# == GROUP A - THE RULE, against the real module ===============================
"--- A. the arrangement rule (scripts/tool-order-proof.mjs) ---"
# !! NO `2>&1` HERE, and `--no-warnings` on purpose (the 17 Sep 2026 lesson):
# PowerShell 5.1 turns a native exe writing to stderr into a TERMINATING
# NativeCommandError under $ErrorActionPreference = "Stop", so redirecting node's
# stderr would kill this script before check 0 - and node warns about importing a
# .ts from a package.json with no "type" field, which is not a failure at all.
& node --no-warnings (Join-Path $PSScriptRoot "tool-order-proof.mjs")
Check 0 "The pure arrangement rule holds (a missing tile is kept, a ghost key ignored, the answer always a permutation)" ($LASTEXITCODE -eq 0)
"--- B. the guard, against the live database ---"

$me = $null
$them = $null
try {
  $me = New-EmailUser "layoutproof-me-$stamp@example.com" "Layout Me $stamp"
  $them = New-EmailUser "layoutproof-them-$stamp@example.com" "Layout Them $stamp"

  # -- 1. NOTHING IS BACKFILLED -------------------------------------------------
  # the migration's own claim: every account gets {} and every grid draws exactly
  # as it always has, so applying it changed what nobody sees
  $fresh = Layout $me.id
  Check 1 "A fresh account's layout is empty, not null and not seeded ('$($fresh | ConvertTo-Json -Compress)')" (
    ($null -ne $fresh) -and (($fresh | ConvertTo-Json -Compress) -eq "{}"))

  # -- 2. THE DOOR STORES ONE GRID ---------------------------------------------
  Rpc (Api $me.token) "set_my_layout" @{ p_key = "tools:user"; p_order = @("earn", "classesmod", "events") } | Out-Null
  $stored = Layout $me.id
  Check 2 "set_my_layout stores the order it was given ($($stored.'tools:user' -join ', '))" (
    ($stored.'tools:user' -join ",") -eq "earn,classesmod,events")

  # -- 3. !!! THE CHECK IS THE GUARD, AND THE OWNER IS WHO PROVES IT -----------
  # Step 1's policy names no columns, so this PATCH is the row's owner writing
  # their own row - the door is not in the way at all. What refuses it is the
  # CHECK, by name, which is the whole reason the shape lives in the database.
  $badShape = Fails { Patch-As $me.token $me.id @{ layout = @{ "tools:user" = "not an array" } } }
  $badKey = Fails { Patch-As $me.token $me.id @{ layout = @{ "Tools:User" = @("earn") } } }
  $badEntry = Fails { Patch-As $me.token $me.id @{ layout = @{ "tools:user" = @(12) } } }
  $longEntry = Fails { Patch-As $me.token $me.id @{ layout = @{ "tools:user" = @(("x" * 41)) } } }
  Check 3 "The OWNER's own direct PATCH of a bad layout is refused BY THE CHECK - a value that is not an array ($($badShape -match 'profiles_layout_shape')), an upper-case key ($($badKey -match 'profiles_layout_shape')), a number in the list ($($badEntry -match 'profiles_layout_shape')), a 41-character entry ($($longEntry -match 'profiles_layout_shape'))" (
    ($badShape -match "profiles_layout_shape") -and ($badKey -match "profiles_layout_shape") -and
    ($badEntry -match "profiles_layout_shape") -and ($longEntry -match "profiles_layout_shape"))

  # -- 4. AND A GOOD ONE GOES STRAIGHT THROUGH ---------------------------------
  # said out loud rather than left implied: there is no policy between this
  # account and this column, which is exactly why check 3 has to hold
  Patch-As $me.token $me.id @{ layout = @{ "tools:user" = @("events") } } | Out-Null
  $direct = Layout $me.id
  Check 4 "A VALID direct PATCH by the owner is allowed - the policy names no columns, so the CHECK is the only thing in the way ($($direct.'tools:user' -join ', '))" (
    ($direct.'tools:user' -join ",") -eq "events")

  # -- 5. THE CEILINGS ---------------------------------------------------------
  $many = @{}
  1..41 | ForEach-Object { $many["tools:grid$_"] = @("earn") }
  $tooManyGrids = Fails { Patch-As $me.token $me.id @{ layout = $many } }
  $tooManyTiles = Fails { Patch-As $me.token $me.id @{ layout = @{ "tools:user" = (1..41 | ForEach-Object { "t$_" }) } } }
  $tooBig = @{}
  1..39 | ForEach-Object { $many2 = 1..40 | ForEach-Object { "x" * 40 }; $tooBig["tools:grid$_"] = $many2 }
  $tooLong = Fails { Patch-As $me.token $me.id @{ layout = $tooBig } }
  Check 5 "The ceilings hold - 41 grids ($($tooManyGrids -match 'profiles_layout_shape')), 41 tiles in one grid ($($tooManyTiles -match 'profiles_layout_shape')), and 4 kB of JSON ($($tooLong -match 'profiles_layout_shape'))" (
    ($tooManyGrids -match "profiles_layout_shape") -and ($tooManyTiles -match "profiles_layout_shape") -and ($tooLong -match "profiles_layout_shape"))

  # -- 6. A KEY THE DOOR ITSELF REFUSES ----------------------------------------
  $badDoorKey = Fails { Rpc (Api $me.token) "set_my_layout" @{ p_key = "Tools:User"; p_order = @("earn") } }
  Check 6 "The door refuses a key the CHECK would refuse, in words, rather than raising a constraint at the end ('$badDoorKey')" (
    $badDoorKey -match "not a grid")

  # -- 7. TWO GRIDS COEXIST ----------------------------------------------------
  # jsonb_set merges one key rather than replacing the object, so arranging a
  # studio's grid cannot forget the arrangement of your own Home
  Rpc (Api $me.token) "set_my_layout" @{ p_key = "tools:user"; p_order = @("earn", "events") } | Out-Null
  Rpc (Api $me.token) "set_my_layout" @{ p_key = "tools:studio:3f1b9c8e-2a44-4d7e-9b10-0c5e6f7a8b90"; p_order = @("rooms", "team") } | Out-Null
  $both = Layout $me.id
  Check 7 "Arranging a second grid keeps the first ($(($both | Get-Member -MemberType NoteProperty).Count) grids stored)" (
    (($both.'tools:user' -join ",") -eq "earn,events") -and (($both.'tools:studio:3f1b9c8e-2a44-4d7e-9b10-0c5e6f7a8b90' -join ",") -eq "rooms,team"))

  # -- 8. AN EMPTY ORDER FORGETS THE KEY ---------------------------------------
  # "back to the default" and "never arranged" are the SAME stored state, rather
  # than an empty array pretending to be a choice somebody made
  Rpc (Api $me.token) "set_my_layout" @{ p_key = "tools:user"; p_order = @() } | Out-Null
  $forgotten = Layout $me.id
  Check 8 "An empty order FORGETS the key rather than storing an empty list (tools:user present: $($null -ne $forgotten.'tools:user'))" (
    ($null -eq $forgotten.'tools:user') -and (($forgotten.'tools:studio:3f1b9c8e-2a44-4d7e-9b10-0c5e6f7a8b90' -join ",") -eq "rooms,team"))

  # -- 9. THERE IS NO p_user_id TO AIM AT ANYBODY ------------------------------
  Rpc (Api $them.token) "set_my_layout" @{ p_key = "tools:user"; p_order = @("crews") } | Out-Null
  $mineAfter = Layout $me.id
  $theirsAfter = Layout $them.id
  Check 9 "Somebody else's call touches their row and not mine (mine still has the studio grid: $($null -ne $mineAfter.'tools:studio:3f1b9c8e-2a44-4d7e-9b10-0c5e6f7a8b90'); theirs is '$($theirsAfter.'tools:user' -join ', ')')" (
    ($null -ne $mineAfter.'tools:studio:3f1b9c8e-2a44-4d7e-9b10-0c5e6f7a8b90') -and ($null -eq $mineAfter.'tools:user') -and (($theirsAfter.'tools:user' -join ",") -eq "crews"))

  # -- 10. AND NOBODY WRITES SOMEBODY ELSE'S DIRECTLY --------------------------
  $crossPatch = Fails { Patch-As $them.token $me.id @{ layout = @{ "tools:user" = @("earn") } } }
  $mineStill = Layout $me.id
  Check 10 "A direct PATCH of MY row by somebody else changes nothing ($(if ($crossPatch) { 'refused' } else { 'silently 0 rows' }))" (
    $null -eq $mineStill.'tools:user')

  # -- 11. ANON ----------------------------------------------------------------
  $anonCall = Fails { Rpc $anonH "set_my_layout" @{ p_key = "tools:user"; p_order = @("earn") } }
  $anonRead = Get-Rows $anonH "profiles?id=eq.$($me.id)&select=layout"
  Check 11 "anon cannot call the door ($anonCall) and reads no profile row at all ($($anonRead.Count) rows)" (
    ($anonCall -ne "") -and ($anonRead.Count -eq 0))

  # -- 12. WHAT IS TRUE RATHER THAN WHAT WOULD BE TIDY -------------------------
  # Step 1 makes every live profile row readable by any SIGNED-IN account, so a
  # determined reader can read this column through the raw API. That is the
  # ceiling, and it is why `layout` is deliberately NOT in PROFILE_COLUMNS: no
  # screen in the app ever selects somebody else's. Asserted so nobody later
  # mistakes the omission for a wall.
  $theyReadMine = Get-Rows (Api $them.token) "profiles?id=eq.$($me.id)&select=layout"
  Check 12 "A signed-in reader CAN still read the column through the raw API ($($theyReadMine.Count) row) - the app never asks for anybody else's, and that is a choice rather than a policy" (
    $theyReadMine.Count -eq 1)

  if ($pass) { "ALL LAYOUT CHECKS PASSED" } else { "-- FAIL: see above" }
}
finally {
  foreach ($u in @($me, $them)) {
    if ($u) {
      try {
        Invoke-WebRequest -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH -UseBasicParsing | Out-Null
      } catch {
        # a cleanup that does not say what it left is not a cleanup (20 Sep 2026)
        "   .. could not delete $($u.email): $($_.Exception.Message)"
      }
    }
  }
}
