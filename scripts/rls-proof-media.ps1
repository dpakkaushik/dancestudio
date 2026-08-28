# Proof for the media slice - photos.
#
# The claims under test, and they are the ones that matter for a bucket anybody
# can read: a person may write ONLY inside their own avatars/{id} folder; a
# business's folder takes writes only from its owner or a trainer; a crew's only
# from its leader; nothing may be written outside those three folders at all; a
# stranger may write nothing anywhere; the row that POINTS at a file is set by an
# RPC that re-checks the same authority AND that the path is in the right folder,
# so a row can never be made to point at somebody else's file; reads are public,
# which is what the bucket is for; and a person can clear their own photo.
#
# Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-media.ps1
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
  $out = @(); foreach ($x in ($res.Content | ConvertFrom-Json)) { if ($null -ne $x) { $out += $x } }
  return ,$out
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
    try { if ($body) { $j = $body | ConvertFrom-Json; if ($j.message) { $msg = $j.message } elseif ($j.error) { $msg = $j.error } } } catch {}
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
  return [pscustomobject]@{ id = $u.id; email = $email; name = $name; token = $tok.access_token }
}
# a real (tiny) PNG, uploaded the way the browser does it
$pngBytes = [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==")
function Upload($token, $path) {
  $uri = "$base/storage/v1/object/media/$path"
  $headers = @{ apikey = $anon; Authorization = "Bearer $token"; "Content-Type" = "image/png"; "x-upsert" = "false" }
  return Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body $pngBytes
}
function UploadAnon($path) {
  $uri = "$base/storage/v1/object/media/$path"
  return Invoke-RestMethod -Method Post -Uri $uri -Headers @{ apikey = $anon; "Content-Type" = "image/png" } -Body $pngBytes
}
function Remove-Object($token, $path) {
  return Invoke-RestMethod -Method Delete -Uri "$base/storage/v1/object/media/$path" -Headers @{ apikey = $anon; Authorization = "Bearer $token" }
}

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$me = New-EmailUser "media-me-$stamp@example.com" "Media Me $stamp" "dancer"
$other = New-EmailUser "media-other-$stamp@example.com" "Media Other $stamp" "dancer"
$owner = New-EmailUser "media-owner-$stamp@example.com" "Media Owner $stamp" "studio"
$ta = Rpc (Api $owner.token) "create_tenant_with_owner" @{ p_name = "Media Studio $stamp"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }
$crew = Rpc (Api $me.token) "create_crew" @{ p_name = "Media Crew $stamp"; p_city = "Pune"; p_style = "Hip-Hop"; p_member_ids = @() }
$uploaded = @()

try {
  # 1. YOUR OWN FOLDER, AND ONLY YOURS
  $mine = "avatars/$($me.id)/proof-$stamp.png"
  Upload $me.token $mine | Out-Null
  $uploaded += @{ token = $me.token; path = $mine }
  $intoTheirs = Fails { Upload $other.token $mine }
  $theirFolder = Fails { Upload $me.token "avatars/$($other.id)/sneak-$stamp.png" }
  Check 1 "A person writes their own avatar folder; another person cannot write into it ($intoTheirs); nor into their folder from here ($theirFolder)" (
    ($intoTheirs -ne "") -and ($theirFolder -ne ""))

  # 2. NOTHING OUTSIDE THE THREE FOLDERS, AND NOTHING AT ALL FROM A STRANGER
  $loose = Fails { Upload $me.token "wherever/$stamp.png" }
  $rootish = Fails { Upload $me.token "$stamp.png" }
  $stranger = Fails { UploadAnon "avatars/$($me.id)/anon-$stamp.png" }
  Check 2 "A path outside the three folders is refused ($loose); so is the bucket root ($rootish); a stranger writes nothing ($stranger)" (
    ($loose -ne "") -and ($rootish -ne "") -and ($stranger -ne ""))

  # 3. THE ROW IS SET BY THE RPC, AND ONLY FOR A FILE IN YOUR OWN FOLDER
  $set = Rpc (Api $me.token) "set_my_avatar" @{ p_path = $mine }
  $wrongFolder = Fails { Rpc (Api $me.token) "set_my_avatar" @{ p_path = "avatars/$($other.id)/theirs.png" } }
  $row = (Get-Rows (Api $me.token) "profiles?id=eq.$($me.id)&select=avatar_path")[0]
  Check 3 "The RPC records '$set'; pointing at somebody else's folder is refused ($wrongFolder); the row now holds $($row.avatar_path)" (
    ($set -eq $mine) -and ($wrongFolder -match "your own folder") -and ($row.avatar_path -eq $mine))

  # 4. A STRANGER CAN READ IT - that is what a public bucket is for
  $read = Invoke-WebRequest -Method Get -Uri "$base/storage/v1/object/public/media/$mine" -UseBasicParsing
  Check 4 "The photo reads publicly ($($read.StatusCode), $($read.Headers['Content-Type']), $($read.RawContentLength) bytes)" (
    ($read.StatusCode -eq 200) -and ($read.RawContentLength -gt 0))

  # 5. A BUSINESS'S FOLDER: its owner writes, a bystander does not
  $bizPath = "tenants/$($ta.id)/proof-$stamp.png"
  Upload $owner.token $bizPath | Out-Null
  $uploaded += @{ token = $owner.token; path = $bizPath }
  $bizSneak = Fails { Upload $me.token "tenants/$($ta.id)/sneak-$stamp.png" }
  $bizSet = Rpc (Api $owner.token) "set_tenant_photo" @{ p_tenant_id = $ta.id; p_path = $bizPath }
  $bizSetByOther = Fails { Rpc (Api $me.token) "set_tenant_photo" @{ p_tenant_id = $ta.id; p_path = $bizPath } }
  Check 5 "The owner writes the business folder and records it ('$bizSet'); a bystander cannot write there ($bizSneak) or record one ($bizSetByOther)" (
    ($bizSet -eq $bizPath) -and ($bizSneak -ne "") -and ($bizSetByOther -match "owner"))

  # 6. A CREW'S FOLDER: its leader writes, nobody else
  $crewPath = "crews/$($crew.id)/proof-$stamp.png"
  Upload $me.token $crewPath | Out-Null
  $uploaded += @{ token = $me.token; path = $crewPath }
  $crewSneak = Fails { Upload $other.token "crews/$($crew.id)/sneak-$stamp.png" }
  $crewSet = Rpc (Api $me.token) "set_crew_photo" @{ p_crew_id = $crew.id; p_path = $crewPath }
  $crewSetByOther = Fails { Rpc (Api $other.token) "set_crew_photo" @{ p_crew_id = $crew.id; p_path = $crewPath } }
  $crewRow = (Get-Rows $anonH "crews?id=eq.$($crew.id)&select=photo")[0]
  Check 6 "The leader writes the crew folder and records it ('$crewSet', public row says $($crewRow.photo)); somebody else cannot write ($crewSneak) or record ($crewSetByOther)" (
    ($crewSet -eq $crewPath) -and ($crewRow.photo -eq $crewPath) -and ($crewSneak -ne "") -and ($crewSetByOther -match "leader"))

  # 7. A ROW CANNOT BE MADE TO POINT AT ANOTHER ENTITY'S FILE
  $crossCrew = Fails { Rpc (Api $me.token) "set_crew_photo" @{ p_crew_id = $crew.id; p_path = $bizPath } }
  $crossBiz = Fails { Rpc (Api $owner.token) "set_tenant_photo" @{ p_tenant_id = $ta.id; p_path = $crewPath } }
  $crossAvatar = Fails { Rpc (Api $me.token) "set_my_avatar" @{ p_path = $crewPath } }
  Check 7 "A crew cannot point at a business's file ($crossCrew); a business at a crew's ($crossBiz); an avatar at either ($crossAvatar)" (
    ($crossCrew -match "belong to this crew") -and ($crossBiz -match "belong to this business") -and ($crossAvatar -match "your own folder"))

  # 8. AND A PHOTO CAN BE TAKEN DOWN: the row cleared, the file deleted by its owner
  Rpc (Api $me.token) "set_my_avatar" @{ p_path = $null } | Out-Null
  $cleared = (Get-Rows (Api $me.token) "profiles?id=eq.$($me.id)&select=avatar_path")[0]
  $deleteByOther = Fails { Remove-Object $other.token $mine }
  Remove-Object $me.token $mine | Out-Null
  # the OBJECT is what a delete removes; the public URL may still be served from
  # the CDN for a while, which is exactly why a replacement takes a NEW random
  # path (lib/media/photo.ts) rather than overwriting one - a cached old photo can
  # never be what a person is shown after they change it
  $listed = Invoke-RestMethod -Method Post -Uri "$base/storage/v1/object/list/media" `
    -Headers @{ apikey = $anon; Authorization = "Bearer $($me.token)"; "Content-Type" = "application/json" } `
    -Body (@{ prefix = "avatars/$($me.id)"; limit = 100 } | ConvertTo-Json)
  $names = @(); foreach ($o in $listed) { if ($o.name) { $names += $o.name } }
  $stillThere = @($names | Where-Object { $_ -eq "proof-$stamp.png" }).Count
  $uploaded = @($uploaded | Where-Object { $_.path -ne $mine })
  Check 8 "Clearing the row leaves avatar_path=$($cleared.avatar_path); somebody else cannot delete the file ($deleteByOther); its owner can, and the folder now lists $stillThere copies of it" (
    ($null -eq $cleared.avatar_path) -and ($deleteByOther -ne "") -and ($stillThere -eq 0))

  # 9. THE BUCKET ITSELF REFUSES WHAT IT SAID IT WOULD: only image types
  $badType = ""
  try {
    Invoke-RestMethod -Method Post -Uri "$base/storage/v1/object/media/avatars/$($me.id)/notes-$stamp.txt" `
      -Headers @{ apikey = $anon; Authorization = "Bearer $($me.token)"; "Content-Type" = "text/plain" } -Body "not an image"
  } catch {
    $b = $_.ErrorDetails.Message
    if (-not $b) { try { $st = $_.Exception.Response.GetResponseStream(); $st.Position = 0; $b = (New-Object System.IO.StreamReader($st)).ReadToEnd() } catch {} }
    try { $badType = ($b | ConvertFrom-Json).message } catch { $badType = $b }
  }
  Check 9 "A text file is refused by the bucket's own mime list ($badType)" ($badType -ne "")
}
finally {
  foreach ($f in $uploaded) { try { Remove-Object $f.token $f.path | Out-Null } catch {} }
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($ta.id)" -Headers $svcH | Out-Null
  foreach ($u in @($me, $other, $owner)) {
    if ($u) { Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null }
  }
  "   (cleanup: proof files, studio, crew and throwaway accounts deleted)"
}

if ($pass) { "`nALL MEDIA CHECKS PASSED"; exit 0 } else { "`nMEDIA CHECKS FAILED"; exit 1 }
