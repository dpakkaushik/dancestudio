# Shared helpers for the rls-proof-*.ps1 scripts. Dot-source AFTER $base and $svcH exist:
#
#   . (Join-Path $PSScriptRoot "proof-lib.ps1")
#
# ASCII ONLY. Windows PowerShell 5.1 decodes a BOM-less .ps1 as ANSI, and a UTF-8
# dash becomes a smart quote it accepts as a string delimiter (the 11 Sep 2026
# lesson that had rls-proof.ps1 dead for weeks).

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
