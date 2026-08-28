# Proof for Step 15 - follows + public profiles.
#
# The claims under test: a listed business is readable by anybody and an
# unlisted one by its members only (Step 3's line, now carrying a public page);
# a follow is one bit per person per business, idempotent, refused for an
# unlisted business and for a business you belong to; follow ROWS are private
# (your own, and the followed business's members) while the COUNT is public and
# names nobody; unfollowing soft-deletes and re-following starts a fresh live
# row; and a public schedule shows published, upcoming sessions and not drafts.
#
# Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-follows.ps1
$ErrorActionPreference = "Stop"
# Supabase refuses a secret (sb_secret_...) key from anything that looks like a
# browser, and PowerShell's default user agent starts with "Mozilla/5.0". Name
# ourselves honestly so the admin and service-role calls are accepted.
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
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/$fn" -Headers $headers -Body ($body | ConvertTo-Json)
}
function Get-Rows($headers, $path) {
  $res = Invoke-WebRequest -Method Get -Uri "$base/rest/v1/$path" -Headers $headers -UseBasicParsing
  return ,@(($res.Content | ConvertFrom-Json) | Where-Object { $null -ne $_ })
}
# the error message a refused call carries, or "" when it was allowed
function Fails($script) {
  try { & $script | Out-Null; return "" }
  catch {
    $msg = $_.Exception.Message
    try { $body = $_.ErrorDetails.Message; if ($body) { $j = $body | ConvertFrom-Json; if ($j.message) { $msg = $j.message } } } catch {}
    return $msg
  }
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
# the repository's count query, verbatim (repositories/follows.ts findFollowerCounts)
function Count-Of($headers, $tenantId) {
  $rows = @((Rpc $headers "follower_counts" @{ p_tenant_ids = @($tenantId) }) | Where-Object { $null -ne $_ })
  if ($rows.Count -eq 0) { return $null }
  return [int]$rows[0].followers
}

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$ownerA = New-EmailUser "follow-ownera-$stamp@example.com" "Owner A $stamp" "studio"
$ownerB = New-EmailUser "follow-ownerb-$stamp@example.com" "Owner B $stamp" "studio"
$l1 = New-EmailUser "follow-l1-$stamp@example.com" "Learner One $stamp" "dancer"
$l2 = New-EmailUser "follow-l2-$stamp@example.com" "Learner Two $stamp" "dancer"

$ta = Rpc (Api $ownerA.token) "create_tenant_with_owner" @{ p_name = "Follow Proof Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }
$tb = Rpc (Api $ownerB.token) "create_tenant_with_owner" @{ p_name = "Private Studio $stamp"; p_type = "studio"; p_area = "Andheri"; p_city = "Mumbai" }
# B goes private - the one state a listed/unlisted line can be tested against
Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenants?id=eq.$($tb.id)" -Headers $svcH -Body (@{ visibility = "unlisted" } | ConvertTo-Json) | Out-Null

try {
  # 1. the public page's first read: a stranger sees the listed business and not the private one
  $anonA = Get-Rows $anonH "tenants?id=eq.$($ta.id)&select=id,name,type,created_at"
  $anonB = Get-Rows $anonH "tenants?id=eq.$($tb.id)&select=id"
  Check 1 "A stranger reads the listed studio ($($anonA.Count) row) and not the private one ($($anonB.Count))" (($anonA.Count -eq 1) -and ($anonB.Count -eq 0))

  # 2. and the count, before anybody follows: zero, not missing
  $c0 = Count-Of $anonH $ta.id
  Check 2 "Public follower count starts at $c0" ($c0 -eq 0)

  # 3. ONE BIT PER PERSON: following twice is one follow
  $f1 = Rpc (Api $l1.token) "set_follow" @{ p_tenant_id = $ta.id; p_on = $true }
  $f1b = Rpc (Api $l1.token) "set_follow" @{ p_tenant_id = $ta.id; p_on = $true }
  Check 3 "L1 follows: following=$($f1.following), $($f1.followers) follower; following again still $($f1b.followers)" (
    ($f1.following -eq $true) -and ([int]$f1.followers -eq 1) -and ([int]$f1b.followers -eq 1))

  # 4. no direct writes - the RPC is the door
  $direct = Fails { Invoke-RestMethod -Method Post -Uri "$base/rest/v1/follows" -Headers (Api $l2.token) -Body (@{ follower_id = $l2.id; tenant_id = $ta.id } | ConvertTo-Json) }
  Check 4 "A direct insert into follows is refused ($direct)" ($direct -ne "")

  # 5. a second follower; the public count moves
  $f2 = Rpc (Api $l2.token) "set_follow" @{ p_tenant_id = $ta.id; p_on = $true }
  $c2 = Count-Of $anonH $ta.id
  Check 5 "L2 follows -> $($f2.followers); a stranger counts $c2" (([int]$f2.followers -eq 2) -and ($c2 -eq 2))

  # 6. ROWS ARE PRIVATE, THE COUNT IS PUBLIC: L1 reads only their own row, the
  #    owner reads who follows them (with names), a rival owner reads nothing
  $l1Rows = Get-Rows (Api $l1.token) "follows?tenant_id=eq.$($ta.id)&deleted_at=is.null&select=id,follower_id"
  $ownerRows = Get-Rows (Api $ownerA.token) "follows?tenant_id=eq.$($ta.id)&deleted_at=is.null&select=id,follower_id,profiles(full_name)"
  $rivalRows = Get-Rows (Api $ownerB.token) "follows?tenant_id=eq.$($ta.id)&select=id"
  $anonRows = Get-Rows $anonH "follows?tenant_id=eq.$($ta.id)&select=id"
  $named = @($ownerRows | Where-Object { $_.profiles -and $_.profiles.full_name }).Count
  Check 6 "L1 reads $($l1Rows.Count) row (own); the owner reads $($ownerRows.Count) with $named names; rival $($rivalRows.Count); public $($anonRows.Count)" (
    ($l1Rows.Count -eq 1) -and ($l1Rows[0].follower_id -eq $l1.id) -and ($ownerRows.Count -eq 2) -and ($named -eq 2) -and ($rivalRows.Count -eq 0) -and ($anonRows.Count -eq 0))

  # 7. unfollow soft-deletes (the follow that happened stays on the person's own
  #    record); re-following starts a fresh live row
  $u1 = Rpc (Api $l1.token) "set_follow" @{ p_tenant_id = $ta.id; p_on = $false }
  $ended = Get-Rows (Api $l1.token) "follows?follower_id=eq.$($l1.id)&tenant_id=eq.$($ta.id)&select=id,deleted_at"
  $r1 = Rpc (Api $l1.token) "set_follow" @{ p_tenant_id = $ta.id; p_on = $true }
  $all1 = Get-Rows (Api $l1.token) "follows?follower_id=eq.$($l1.id)&tenant_id=eq.$($ta.id)&select=id,deleted_at"
  $live1 = @($all1 | Where-Object { -not $_.deleted_at }).Count
  Check 7 "Unfollow -> $($u1.followers) (ended row kept: $($ended.Count), deleted_at set: $([bool]$ended[0].deleted_at)); re-follow -> $($r1.followers) with $($all1.Count) rows, $live1 live" (
    ([int]$u1.followers -eq 1) -and ($ended.Count -eq 1) -and ($null -ne $ended[0].deleted_at) -and ([int]$r1.followers -eq 2) -and ($all1.Count -eq 2) -and ($live1 -eq 1))

  # 8. what cannot be followed: a private business, and a business you belong to
  $priv = Fails { Rpc (Api $l1.token) "set_follow" @{ p_tenant_id = $tb.id; p_on = $true } }
  $self = Fails { Rpc (Api $ownerA.token) "set_follow" @{ p_tenant_id = $ta.id; p_on = $true } }
  Check 8 "Following a private business is refused ($priv); following your own is refused ($self)" (
    ($priv -match "not open") -and ($self -match "belong"))

  # 9. a stranger cannot follow at all
  $anonFollow = Fails { Rpc $anonH "set_follow" @{ p_tenant_id = $ta.id; p_on = $true } }
  Check 9 "The public cannot call set_follow ($anonFollow)" ($anonFollow -ne "")

  # 10. an unlisted business's count is its members' to see: absent for a
  #     stranger, present (0) for its owner
  $cbAnon = Count-Of $anonH $tb.id
  $cbOwner = Count-Of (Api $ownerB.token) $tb.id
  Check 10 "Private studio's count: stranger gets $(if ($null -eq $cbAnon) {'nothing'} else {$cbAnon}), its owner gets $cbOwner" (($null -eq $cbAnon) -and ($cbOwner -eq 0))

  # 11. THE PUBLIC SCHEDULE: a published class shows, a draft does not, for a
  #     stranger - the repository's query shape (findPublicTenantSchedule)
  $tmr = (Get-Date).AddDays(2)
  Rpc (Api $ownerA.token) "create_class_with_session" @{ p_tenant_id = $ta.id; p_title = "Open Class $stamp";
    p_style = "Hip-Hop"; p_level = "all"; p_room = $null; p_price_inr = 0; p_capacity = 10;
    p_status = "published"; p_starts_at = $tmr.ToString("yyyy-MM-ddT19:00:00zzz"); p_ends_at = $tmr.ToString("yyyy-MM-ddT20:00:00zzz") } | Out-Null
  Rpc (Api $ownerA.token) "create_class_with_session" @{ p_tenant_id = $ta.id; p_title = "Draft Class $stamp";
    p_style = "Salsa"; p_level = "all"; p_room = $null; p_price_inr = 0; p_capacity = 10;
    p_status = "draft"; p_starts_at = $tmr.ToString("yyyy-MM-ddT17:00:00zzz"); p_ends_at = $tmr.ToString("yyyy-MM-ddT18:00:00zzz") } | Out-Null
  $nowQ = [uri]::EscapeDataString((Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ"))
  $pubSched = Get-Rows $anonH "class_sessions?select=id,classes!inner(status,title)&tenant_id=eq.$($ta.id)&classes.status=eq.published&deleted_at=is.null&starts_at=gte.$nowQ"
  $pubAll = Get-Rows $anonH "class_sessions?select=id,classes!inner(status)&tenant_id=eq.$($ta.id)&deleted_at=is.null"
  $ownerAll = Get-Rows (Api $ownerA.token) "class_sessions?select=id,classes!inner(status)&tenant_id=eq.$($ta.id)&deleted_at=is.null"
  Check 11 "Public schedule: $($pubSched.Count) published upcoming; a stranger sees $($pubAll.Count) session in all (the draft's is hidden), the owner $($ownerAll.Count)" (
    ($pubSched.Count -eq 1) -and ($pubAll.Count -eq 1) -and ($ownerAll.Count -eq 2))

  # 12. the profile's styles and faculty come off public rows too: the published
  #     class's style shows to a stranger, the draft's does not
  $styles = Get-Rows $anonH "classes?select=style&tenant_id=eq.$($ta.id)&status=eq.published&deleted_at=is.null"
  $allStyles = Get-Rows $anonH "classes?select=style,status&tenant_id=eq.$($ta.id)&deleted_at=is.null"
  Check 12 "Public styles: $(($styles | ForEach-Object { $_.style }) -join ',') (a stranger reads $($allStyles.Count) class in all)" (
    ($styles.Count -eq 1) -and ($styles[0].style -eq "Hip-Hop") -and ($allStyles.Count -eq 1))
}
finally {
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers $svcH | Out-Null
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($tb.id)" -Headers $svcH | Out-Null
  foreach ($u in @($ownerA, $ownerB, $l1, $l2)) {
    Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null
  }
  "   (cleanup: proof studios and throwaway accounts deleted)"
}

if ($pass) { "`nALL FOLLOW CHECKS PASSED"; exit 0 } else { "`nFOLLOW CHECKS FAILED"; exit 1 }
