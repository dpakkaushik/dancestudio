# Shared helpers for the rls-proof-*.ps1 scripts. Dot-source AFTER $base, $anon and
# $svcH exist (New-Studio signs as a real owner, so it needs the anon key):
#
#   . (Join-Path $PSScriptRoot "proof-lib.ps1")
#
# ASCII ONLY. Windows PowerShell 5.1 decodes a BOM-less .ps1 as ANSI, and a UTF-8
# dash becomes a smart quote it accepts as a string delimiter (the 11 Sep 2026
# lesson that had rls-proof.ps1 dead for weeks).

# ---------------------------------------------------------------------------
# A STUDIO, MADE THE WAY THE APP MAKES ONE - and made in ONE PLACE.
#
# 19 Sep 2026 cost this harness two whole days of its own making, and both bills
# were the same shape: A RULE THE DATABASE STARTS KEEPING IS A RULE EVERY SCRIPT
# HAS TO KEEP.
#   * `businesses.styles` became mandatory, so all 31 proofs, two e2e specs and
#     five browser scripts had to learn `p_styles` before a single check could run.
#   * The edit was a regex, and `p_type = "studio"` also matched a
#     `nearby_businesses` call that has no such argument - PostgREST answered 404
#     (PGRST202) on a function it could no longer resolve. Found by the discovery
#     proof, fixed by hand, and the reason the whole suite was re-run.
#
# So studio creation lives HERE now. The next argument the RPC grows is one edit
# in one file, and nobody has to point a regex at 31 scripts to find the callers.
#
# Self-contained on purpose: it calls Invoke-RestMethod directly rather than the
# proof's own Rpc/Api helpers, because not every proof defines them (rls-proof-tenants
# has no Rpc at all). All it needs is $base and $anon, which every proof has before
# it dot-sources this file.
function New-Studio($token, $name, $area, $city, $styles = @("Hip-Hop")) {
  Assert-City $city
  Sweep-Own-Leftovers $token $name
  $h = @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" }
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_business_with_owner" -Headers $h -Body (@{
    p_name = $name; p_type = "studio"; p_area = $area; p_city = $city; p_styles = $styles } | ConvertTo-Json)
}

# ---------------------------------------------------------------------------
# A PROOF THAT IS KILLED LEAVES A STUDIO, AND THE PILE IS NOT COSMETIC.
#
# Every proof's `finally` deletes what it made; a run stopped with Ctrl-C, or one
# that dies before its `try`, never reaches it. One row per interrupted run does
# not sound like much, and by 19 Sep 2026 it was 147 businesses - which broke
# THREE REAL THINGS rather than merely looking untidy:
#   * `why_no_studio()` caps an organization at 15 studios, so the test-phone
#     owner sat at 15 and NINE PHONE-BASED PROOFS could not create their world
#     at all - red for a day, for a reason none of them named;
#   * `nearby_businesses` answers 50 rows, and Pune's shelf became 88 junk
#     studios with the demo world's real one outside the cap;
#   * `findMyTenants` reads the oldest 50, so the app bounced that account off
#     every studio page it owned.
#
# So the sweep goes where the studio is made. It is deliberately the NARROWEST
# thing that works, because it runs unattended against production:
#   * only businesses THIS TOKEN'S OWN ACCOUNT owns. The LIST is read as the
#     owner, so RLS is what scopes it and a bug in the filter cannot reach
#     somebody else's row; the DELETE itself is service-role, because
#     `businesses` carries no delete policy for anybody (the proofs' own
#     `finally` blocks have always deleted that way);
#   * only ones whose name shares this very call's prefix, so it sweeps earlier
#     runs OF THE SAME PROOF and cannot reach a differently-named neighbour;
#   * only ones older than two hours, so a parallel run in flight is untouchable;
#   * failures are swallowed - a proof must never die in its own housekeeping.
#
# Proof studio names are "<Something> Studio <HHmmss>", so the prefix is the name
# with its trailing digits taken off. A name with no stamp sweeps nothing, which
# is the safe way round.
function Sweep-Own-Leftovers($token, $name) {
  try {
    $prefix = ([regex]::Replace([string]$name, '\s*\d+\s*$', '')).Trim()
    if ($prefix.Length -lt 6 -or $prefix -eq [string]$name) { return }   # no stamp - nothing to match on
    $h = @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json" }
    $me = Invoke-RestMethod -Method Get -Uri "$base/auth/v1/user" -Headers $h
    $cutoff = [DateTime]::UtcNow.AddHours(-2).ToString("o")
    $seats = Invoke-RestMethod -Method Get -Headers $h -Uri (
      "$base/rest/v1/business_members?user_id=eq.$($me.id)&member_role=eq.owner&deleted_at=is.null" +
      "&select=business_id,businesses!inner(id,name,created_at)" +
      "&businesses.name=like." + [uri]::EscapeDataString("$prefix%") +
      "&businesses.created_at=lt." + [uri]::EscapeDataString($cutoff))
    foreach ($s in @($seats)) {
      $id = [string]$s.business_id
      if ($id) {
        try {
          Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/businesses?id=eq.$id" -Headers $svcH | Out-Null
          Write-Host "   (swept a leftover '$($s.businesses.name)' from an earlier run)"
        } catch {}
      }
    }
  } catch {}
}

# An artist page - the other thing create_business_with_owner makes. It takes NO
# styles: update_business_profile refuses to empty a STUDIO's styles and
# create_business_with_owner refuses a studio without them, but an artist page
# carries the person's own.
function New-Artist-Page($token, $name, $area, $city) {
  Assert-City $city
  $h = @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "application/json"; Prefer = "return=representation" }
  return Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_business_with_owner" -Headers $h -Body (@{
    p_name = $name; p_type = "artist_page"; p_area = $area; p_city = $city } | ConvertTo-Json)
}

# THE CITY VOCABULARY IS THE DATABASE'S, AND A PROOF MAY NOT INVENT ONE.
#
# 19 Sep 2026: migration 20260919150000 made `cities` exactly eight and hung a
# BEFORE trigger on profiles, businesses, crews and events that REFUSES anything
# else. rls-proof-person-pages built its world in Ahmedabad and rls-proof-stats in
# Chandigarh - "a city the demo world does not use", which was a good reason right
# up until it was an invalid one. Both died on the PROFILE INSERT with a bare 400,
# before check 1, and stayed red for a day because the failure named nothing.
#
# This turns that into a sentence that says what is wrong and what is allowed. The
# registry is read once per run and cached, so it costs one request, not one per
# studio.
$script:DosCities = $null
function Proof-Cities {
  if ($null -eq $script:DosCities) {
    # the column is `city`, not `name` - the table was `city_centroids` before the
    # 16 Sep rename and kept its column names
    $res = Invoke-WebRequest -Method Get -Uri "$base/rest/v1/cities?deleted_at=is.null&select=city" -Headers @{ apikey = $anon } -UseBasicParsing
    $script:DosCities = @(($res.Content | ConvertFrom-Json) | ForEach-Object { [string]$_.city })
  }
  return ,$script:DosCities
}
function Assert-City($city) {
  $all = Proof-Cities
  if ($all.Count -and ($all -notcontains [string]$city)) {
    throw "PROOF SET-UP: '$city' is not one of the cities this database allows. The registry is: $($all -join ', '). (A BEFORE trigger refuses anything else - see migration 20260919150000.)"
  }
}

# 10 Sep 2026: a studio is born UNLISTED and goes public when ITS OWN subscription is live (one
# per studio, Rs 1,200 a month, renewing on its own through Cashfree). The service role stands in
# for an admin's grant here - a granted, active row at Rs 0 - and lists the studio as the grant would.
#
# Lifted into this file 20 Sep 2026 from the 26 proofs that each carried a
# byte-identical copy of it, for the reason above: the next change to how a studio
# goes public should be one edit, not twenty-six. (rls-proof-push2 keeps its own,
# which also stamps the studio's badge - it proves a wider slice.)
function Subscribe-Studio($tenantId) {
  $ownerRows = @(Invoke-RestMethod -Method Get -Uri "$base/rest/v1/business_members?business_id=eq.$tenantId&member_role=eq.owner&deleted_at=is.null&select=user_id" -Headers $svcH)
  $ownerId = [string]$ownerRows[0].user_id
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/subscriptions" -Headers $svcH -Body (@{
    kind = "studio"; user_id = $ownerId; business_id = $tenantId; plan_key = "studio_monthly"; price_inr = 0; period = "monthly"; status = "active"
    current_period_start = (Get-Date).ToString("yyyy-MM-dd"); current_period_end = (Get-Date).AddYears(1).ToString("yyyy-MM-dd"); granted = $true
    note = "Granted by a proof script - nothing charged"; created_by = $ownerId; updated_by = $ownerId } | ConvertTo-Json) | Out-Null
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/businesses?id=eq.$tenantId" -Headers $svcH -Body (@{ visibility = "listed" } | ConvertTo-Json) | Out-Null
}

# 18 Sep 2026: A STUDIO CLASS PUBLISHES ONLY ONCE ITS TEACHER HAS ACCEPTED, and an
# ARTIST'S CLASS ONLY ONCE IT HAS A PLACE (trigger classes_publish_needs_a_yes,
# migration 20260918120000). Until then every proof created a studio class already
# published with nobody on it, which is exactly what that rule now forbids.
#
# These helpers do what a real studio does - a teacher on the class, then Publish -
# with the service role standing in for the ask-and-accept, the way Subscribe-Studio
# already stands in for an admin's grant. The PUBLISH itself still goes through the
# trigger, so the rule is proven rather than bypassed: seat nobody and it refuses.
#
# The teacher must be a PERSON: an organization account is refused a seat on a class
# (guard_person_only), so a phone-based proof teaches with its learner.
function Seat-Teacher($classId, $teacherUserId) {
  $cls = Invoke-RestMethod -Method Get -Uri "$base/rest/v1/classes?id=eq.$classId&select=business_id" -Headers $svcH
  $bid = [string](@($cls)[0].business_id)
  # one live artist per class (a partial unique index), so an existing one is
  # closed first - and a proof that asks its OWN artist later closes this one the
  # same way, through ask_class_person. Neither can collide with the other.
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/class_people?class_id=eq.$classId&kind=eq.artist&deleted_at=is.null" -Headers $svcH -Body (@{ deleted_at = (Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json) | Out-Null
  # can_attendance FALSE on purpose: seating a teacher must not hand anybody the
  # register, or a proof about who may run it would be proving this helper instead
  Invoke-RestMethod -Method Post -Uri "$base/rest/v1/class_people" -Headers $svcH -Body (@{
    class_id = $classId; business_id = $bid; user_id = $teacherUserId; kind = "artist"; status = "confirmed"
    can_attendance = $false; can_refunds = $false; pay_per_session_inr = 0
    created_by = $teacherUserId; updated_by = $teacherUserId } | ConvertTo-Json) | Out-Null
}

# Seat a teacher and publish. $headers decides WHO presses publish - pass the
# owner's headers where the proof is about the owner's own right to do it, or
# $svcH where publishing is only setup.
#
# THE SEATED ROW IS THEN ERASED, and that matters. A soft delete would leave a
# row that still reads status = 'confirmed', and my_dance_stats / my_session_history
# count confirmed claims WITHOUT filtering deleted_at - so the setup's teacher
# would show up on somebody's record beside the proof's own ask, and two proofs
# read exactly that: rls-proof-stats saw 5 conducted where 2 happened, and
# person-pages saw a record and a page disagree. Publishing is what this helper is
# for; the class's people are the proof's own business, so it leaves none behind.
# (A published class with no teacher is a state the product can reach too - a
# withdrawn ask after publishing - so nothing impossible is created here.)
function Publish-Class($classId, $teacherUserId, $headers = $null) {
  Seat-Teacher $classId $teacherUserId
  $h = if ($headers) { $headers } else { $svcH }
  Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/classes?id=eq.$classId" -Headers $h -Body '{"status":"published"}' | Out-Null
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/class_people?class_id=eq.$classId&user_id=eq.$teacherUserId&kind=eq.artist" -Headers $svcH | Out-Null
}

# Create a class the way the app does now - as a DRAFT - then seat its teacher and
# publish it, handing back the row as it stands afterwards. A drop-in for the old
# "create it already published" call.
function New-Published-Class($headers, $body, $teacherUserId) {
  $b = @{}
  foreach ($k in $body.Keys) { $b[$k] = $body[$k] }
  $b["p_status"] = "draft"
  $cls = Invoke-RestMethod -Method Post -Uri "$base/rest/v1/rpc/create_class_with_session" -Headers $headers -Body ($b | ConvertTo-Json)
  Publish-Class ([string]$cls.id) $teacherUserId $headers
  $again = Invoke-RestMethod -Method Get -Uri "$base/rest/v1/classes?id=eq.$($cls.id)&select=*" -Headers $svcH
  return @($again)[0]
}
