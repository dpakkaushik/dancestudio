# Proof for Step 12b (Staff invites): joining a business is CONSENT-BASED. The
# owner alone asks, only the person asked can answer, holding the link is never
# enough, 'owner' is not a grantable role, and taking somebody off the team takes
# their powers with them.
#
# Invites are keyed on EMAIL (what DanceOS authenticates on today), so this proof
# mints real email users through the admin API rather than using the test phone
# numbers - a phone-only account has no address for an invite to find.
# Reads keys from .env.local - run from the repo root: powershell -File scripts/rls-proof-staff.ps1
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

$svcH = @{ apikey = $service; Authorization = "Bearer $service"; "Content-Type" = "application/json"; Prefer = "return=representation" }
$adminH = @{ apikey = $service; Authorization = "Bearer $service"; "Content-Type" = "application/json" }
$anonH = @{ apikey = $anon; "Content-Type" = "application/json" }

function Api($token) { return @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" } }
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

# a real email account, confirmed, plus the profile every joiner needs
function New-EmailUser($email, $name, $role) {
  $u = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/admin/users" -Headers $adminH -Body (@{
    email = $email; password = "Proof-passw0rd!"; email_confirm = $true } | ConvertTo-Json)
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/profiles" -Headers $svcH -Body (@{
    id = $u.id; full_name = $name; role = $role; city = "Pune"; created_by = $u.id; updated_by = $u.id } | ConvertTo-Json) | Out-Null
  $tok = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $anonH -Body (@{
    email = $email; password = "Proof-passw0rd!" } | ConvertTo-Json)
  return [pscustomobject]@{ id = $u.id; email = $email; token = $tok.access_token }
}

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$owner = New-EmailUser "staffproof-owner-$stamp@example.com" "Owner $stamp" "studio"
$joiner = New-EmailUser "staffproof-join-$stamp@example.com" "Vikram $stamp" "trainer"
$rival = New-EmailUser "staffproof-rival-$stamp@example.com" "Rival $stamp" "studio"

$ta = Rpc (Api $owner.token) "create_tenant_with_owner" @{ p_name = "Staff Proof Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }
$tb = Rpc (Api $rival.token) "create_tenant_with_owner" @{ p_name = "Rival Studio $stamp"; p_type = "studio"; p_area = "Andheri"; p_city = "Mumbai" }

try {
  # 1. the owner asks somebody to join, as a trainer
  $inv = Rpc (Api $owner.token) "invite_to_tenant" @{ p_tenant_id = $ta.id; p_name = "Vikram Bhatt";
    p_email = "  StaffProof-Join-$stamp@Example.com  "; p_role = "trainer" }
  Check 1 "Owner invites (status $($inv.status), code $($inv.code), email normalised '$($inv.email)')" (
    ($inv.status -eq "pending") -and ($inv.code.Length -ge 8) -and ($inv.email -eq $joiner.email))

  # 2. 'owner' is not a role an invite can hand over (the prototype's SS10.9 footnote)
  $ownerGrantBlocked = Expect-Fail {
    Rpc (Api $owner.token) "invite_to_tenant" @{ p_tenant_id = $ta.id; p_name = "Sneaky"; p_email = "sneak-$stamp@example.com"; p_role = "owner" }
  }
  Check 2 "An invite cannot grant 'owner'" $ownerGrantBlocked

  # 3. a rival studio's owner cannot ask people into YOUR business
  $rivalAskBlocked = Expect-Fail {
    Rpc (Api $rival.token) "invite_to_tenant" @{ p_tenant_id = $ta.id; p_name = "Planted"; p_email = "planted-$stamp@example.com"; p_role = "staff" }
  }
  Check 3 "A rival cannot invite into your business" $rivalAskBlocked

  # 4. the invite desk is business-private: the public sees nothing at all
  $anonSees = Get-Rows $anonH "tenant_invites?select=id"
  Check 4 "The public sees no invites ($($anonSees.Count))" ($anonSees.Count -eq 0)

  # 5. nor does a rival, nor does the invited person before they join - an email
  #    address is not something the whole app gets to read
  $rivalSees = Get-Rows (Api $rival.token) "tenant_invites?id=eq.$($inv.id)&select=id"
  $joinerSees = Get-Rows (Api $joiner.token) "tenant_invites?id=eq.$($inv.id)&select=id"
  Check 5 "Rival ($($rivalSees.Count)) and invitee ($($joinerSees.Count)) read no rows off the table" (
    ($rivalSees.Count -eq 0) -and ($joinerSees.Count -eq 0))

  # 6. but the invited person FINDS it - matched on the address they sign in with
  $mine = Rpc (Api $joiner.token) "my_pending_invites" @{}
  $mineRows = ,@($mine | Where-Object { $null -ne $_ })
  Check 6 "The invitee finds their own invite ($($mineRows.Count) waiting, from '$($mineRows[0].tenant_name)')" (
    ($mineRows.Count -eq 1) -and ($mineRows[0].tenant_name -eq "Staff Proof Studio $stamp"))

  # 7. holding the link is NOT consent: the wrong person cannot accept it
  $wrongPersonBlocked = Expect-Fail { Rpc (Api $rival.token) "accept_tenant_invite" @{ p_code = $inv.code } }
  Check 7 "Somebody else holding the link cannot accept it" $wrongPersonBlocked

  # 8. ...and the preview tells them so without printing the address in full
  $prev = Rpc (Api $rival.token) "preview_tenant_invite" @{ p_code = $inv.code }
  $prevRow = ,@($prev | Where-Object { $null -ne $_ })
  Check 8 "Preview masks the address ('$($prevRow[0].email_hint)', is_for_me=$($prevRow[0].is_for_me))" (
    ($prevRow[0].is_for_me -eq $false) -and ($prevRow[0].email_hint -notlike "*staffproof-join*") -and ($prevRow[0].email_hint -like "s***@*"))

  # 9. the person themselves accepts, and only then are they on the team
  $member = Rpc (Api $joiner.token) "accept_tenant_invite" @{ p_code = $inv.code }
  $invAfter = Get-Rows $svcH "tenant_invites?id=eq.$($inv.id)&select=status,accepted_by"
  Check 9 "They accept -> member as $($member.member_role), invite now $($invAfter[0].status)" (
    ($member.member_role -eq "trainer") -and ($invAfter[0].status -eq "accepted") -and ([string]$invAfter[0].accepted_by -eq [string]$joiner.id))

  # 10. asking somebody who is already on the team is pointless, and refused
  $reAskBlocked = Expect-Fail {
    Rpc (Api $owner.token) "invite_to_tenant" @{ p_tenant_id = $ta.id; p_name = "Vikram again"; p_email = $joiner.email; p_role = "staff" }
  }
  Check 10 "Re-inviting somebody already on the team is refused" $reAskBlocked

  # 11. a trainer is not an owner: inviting and removing stay owner-only
  $nonOwnerAskBlocked = Expect-Fail {
    Rpc (Api $joiner.token) "invite_to_tenant" @{ p_tenant_id = $ta.id; p_name = "Friend"; p_email = "friend-$stamp@example.com"; p_role = "staff" }
  }
  $nonOwnerRemoveBlocked = Expect-Fail {
    Rpc (Api $joiner.token) "remove_tenant_member" @{ p_tenant_id = $ta.id; p_user_id = $owner.id }
  }
  Check 11 "A trainer can neither invite nor remove" ($nonOwnerAskBlocked -and $nonOwnerRemoveBlocked)

  # 12. the owner changes what somebody may do - but 'owner' is still not settable
  Rpc (Api $owner.token) "set_member_role" @{ p_tenant_id = $ta.id; p_user_id = $joiner.id; p_role = "staff" } | Out-Null
  $roleNow = Get-Rows $svcH "tenant_members?tenant_id=eq.$($ta.id)&user_id=eq.$($joiner.id)&select=member_role"
  $promoteBlocked = Expect-Fail {
    Rpc (Api $owner.token) "set_member_role" @{ p_tenant_id = $ta.id; p_user_id = $joiner.id; p_role = "owner" }
  }
  Check 12 "Owner sets them to $($roleNow[0].member_role); promoting to owner is refused" (
    ($roleNow[0].member_role -eq "staff") -and $promoteBlocked)

  # 13. an owner cannot be removed from their own business (so the last owner survives)
  $ownerRemoveBlocked = Expect-Fail {
    Rpc (Api $owner.token) "remove_tenant_member" @{ p_tenant_id = $ta.id; p_user_id = $owner.id }
  }
  Check 13 "An owner cannot be removed from their own business" $ownerRemoveBlocked

  # 14. THE ONE THAT MATTERS: removing somebody takes their POWERS with them.
  #     can_run_register_for_class reads a confirmed attendance claim without
  #     re-checking membership, so a removed assistant would keep the register.
  $starts = (Get-Date).AddDays(3).ToString("yyyy-MM-ddT19:00:00zzz")
  $ends = (Get-Date).AddDays(3).ToString("yyyy-MM-ddT20:00:00zzz")
  $cls = Rpc (Api $owner.token) "create_class_with_session" @{ p_tenant_id = $ta.id; p_title = "Register Class $stamp";
    p_style = "Hip-Hop"; p_level = "beginner"; p_room = $null; p_price_inr = 0; p_capacity = 12;
    p_status = "published"; p_starts_at = $starts; p_ends_at = $ends }
  $claim = Rpc (Api $owner.token) "claim_person" @{ p_class_id = $cls.id; p_user_id = $joiner.id;
    p_kind = "assistant"; p_can_attendance = $true; p_can_refunds = $false }
  Rpc (Api $joiner.token) "respond_to_claim" @{ p_claim_id = $claim.id; p_accept = $true } | Out-Null
  $couldRun = Rpc (Api $joiner.token) "can_run_register_for_class" @{ p_class_id = $cls.id }
  Rpc (Api $owner.token) "remove_tenant_member" @{ p_tenant_id = $ta.id; p_user_id = $joiner.id } | Out-Null
  $canRunAfter = Rpc (Api $joiner.token) "can_run_register_for_class" @{ p_class_id = $cls.id }
  $seatGone = Get-Rows $svcH "tenant_members?tenant_id=eq.$($ta.id)&user_id=eq.$($joiner.id)&deleted_at=is.null&select=id"
  Check 14 "Assistant ran the register ($couldRun); removed -> register lost ($canRunAfter), seat gone ($($seatGone.Count))" (
    ($couldRun -eq $true) -and ($canRunAfter -eq $false) -and ($seatGone.Count -eq 0))

  # 15. a bogus link is simply not an invite, and a withdrawn one cannot be used
  $bogusBlocked = Expect-Fail { Rpc (Api $joiner.token) "accept_tenant_invite" @{ p_code = "not-a-real-code" } }
  $inv2 = Rpc (Api $owner.token) "invite_to_tenant" @{ p_tenant_id = $ta.id; p_name = "Meera";
    p_email = "staffproof-join-$stamp@example.com"; p_role = "staff" }
  Rpc (Api $owner.token) "revoke_tenant_invite" @{ p_invite_id = $inv2.id } | Out-Null
  $revokedBlocked = Expect-Fail { Rpc (Api $joiner.token) "accept_tenant_invite" @{ p_code = $inv2.code } }
  Check 15 "A bogus code and a withdrawn invite are both dead" ($bogusBlocked -and $revokedBlocked)
}
finally {
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers $svcH | Out-Null
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($tb.id)" -Headers $svcH | Out-Null
  foreach ($u in @($owner, $joiner, $rival)) {
    Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null
  }
  "   (cleanup: proof studios and throwaway accounts deleted)"
}

if ($pass) { "`nALL STAFF INVITE CHECKS PASSED"; exit 0 } else { "`nSTAFF INVITE CHECKS FAILED"; exit 1 }
