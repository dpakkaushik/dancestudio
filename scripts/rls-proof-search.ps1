# Proof for Step 23 - search + Discover filters.
#
# The claims under test: search_dance_os is SECURITY INVOKER, so what it finds
# is what the caller may read - a stranger finds a listed studio, a live crew
# and a published event (by its title AND by its organiser's name), and does
# NOT find an unlisted studio or a draft event, while the owner of each finds
# their own; a match is a name that starts with the term or has a word that
# does (never a substring in the middle of a word); results are capped per
# kind; people are never returned; an empty term returns nothing. The Discover
# predicates themselves are pure TypeScript (features/discovery/filters.ts) and
# are exercised by the e2e.
#
# Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/rls-proof-search.ps1
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
# the search, counted off the raw text (PowerShell 5.1 reads a JSON [] as one item)
function Search($headers, $q, $limit) {
  $body = @{ p_q = $q }
  if ($limit) { $body.p_limit = $limit }
  $res = Invoke-WebRequest -Method Post -Uri "$base/rest/v1/rpc/search_dance_os" -Headers $headers -Body ($body | ConvertTo-Json) -UseBasicParsing
  if ($res.Content.Trim() -eq "[]") { return ,@() }
  return ,@(($res.Content | ConvertFrom-Json) | Where-Object { $null -ne $_ })
}
function Names($rows) { return (@($rows | ForEach-Object { "$($_.kind):$($_.name)" }) -join ", ") }
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
$in10 = (Get-Date).AddDays(10).ToString("yyyy-MM-dd")

$pass = $true
$stamp = Get-Date -Format "HHmmss"
$tag = "Zq$stamp"   # a token no real row carries, so every match is ours
$ownerA = New-EmailUser "srch-a-$stamp@example.com" "Owner A $stamp" "studio"
$ownerB = New-EmailUser "srch-b-$stamp@example.com" "Owner B $stamp" "studio"
$dancer = New-EmailUser "srch-d-$stamp@example.com" "$tag Dancer" "dancer"
$ta = Rpc (Api $ownerA.token) "create_tenant_with_owner" @{ p_name = "$tag Studio Kothrud"; p_type = "studio"; p_area = "Kothrud"; p_city = "Pune" }
$tb = Rpc (Api $ownerB.token) "create_tenant_with_owner" @{ p_name = "$tag Private Hall"; p_type = "studio"; p_area = "Andheri"; p_city = "Mumbai" }
Invoke-RestMethod -Method Patch -Uri "$base/rest/v1/tenants?id=eq.$($tb.id)" -Headers $svcH -Body (@{ visibility = "unlisted" } | ConvertTo-Json) | Out-Null

try {
  $crew = Rpc (Api $dancer.token) "create_crew" @{ p_name = "$tag Crew"; p_city = "Pune"; p_style = "Hip-Hop"; p_member_ids = @() }
  $ev = @{ cat = "battle"; title = "Monsoon $tag Battle"; style = "All styles"; start_date = $in10; end_date = $in10; start_time = "18:00"
    venue = "Proof Hall"; address = "Kothrud"; city = "Pune"; maps_url = "https://maps.google.com/?q=Proof+Hall"; about = "Proof"
    entry_format = "solo"; bracket = 16; rounds = 0; prizes = @(); tickets_on = $false; ticket_tiers = @()
    entry_tiers = @(@{ format = "solo"; fee_inr = 0; capacity = 8 }) }
  $pubId = Rpc (Api $ownerA.token) "save_event" @{ p_tenant_id = $ta.id; p_event_id = $null; p_event = $ev }
  Rpc (Api $ownerA.token) "publish_event" @{ p_event_id = $pubId } | Out-Null
  $ev.title = "Draft $tag Battle"
  Rpc (Api $ownerA.token) "save_event" @{ p_tenant_id = $ta.id; p_event_id = $null; p_event = $ev } | Out-Null

  # 1. A STRANGER FINDS THE PUBLIC THINGS - the listed studio, the crew, the published event - and only those
  $anonHits = Search $anonH $tag
  $kinds = @($anonHits | ForEach-Object { $_.kind } | Sort-Object)
  Check 1 "Stranger searching '$tag' finds: $(Names $anonHits)" (
    ($anonHits.Count -eq 3) -and (($kinds -join ",") -eq "crew,event,studio") -and
    -not ($anonHits | Where-Object { $_.name -like "*Private*" }) -and -not ($anonHits | Where-Object { $_.name -like "Draft*" }))

  # 2. THE UNLISTED STUDIO IS ITS OWNER'S TO FIND; the draft event too - SECURITY INVOKER means RLS decides
  $bHits = Search (Api $ownerB.token) $tag
  $aHits = Search (Api $ownerA.token) $tag
  Check 2 "Owner B also finds the private studio ($(($bHits | Where-Object { $_.name -like '*Private*' }).Count)); Owner A also finds the draft ($(($aHits | Where-Object { $_.name -like 'Draft*' }).Count)); A does not find B's private studio ($(($aHits | Where-Object { $_.name -like '*Private*' }).Count))" (
    ((@($bHits | Where-Object { $_.name -like "*Private*" })).Count -eq 1) -and ((@($aHits | Where-Object { $_.name -like "Draft*" })).Count -eq 1) -and ((@($aHits | Where-Object { $_.name -like "*Private*" })).Count -eq 0))

  # 3. A WORD THAT STARTS WITH THE TERM MATCHES (the studio, and its event through the organiser's
  #    name); a substring inside a word does not (the prototype's `m`, 4546)
  $word = Search $anonH "kothrud"
  $mid = Search $anonH "othrud"
  $wordKinds = @($word | ForEach-Object { $_.kind } | Sort-Object) -join ","
  Check 3 "'kothrud' (second word) finds $($word.Count) ($(Names $word)); 'othrud' (mid-word) finds $($mid.Count)" (
    ($word.Count -eq 2) -and ($wordKinds -eq "event,studio") -and ($mid.Count -eq 0))

  # 4. AN EVENT IS FOUND BY ITS ORGANISER'S NAME TOO
  $byOrg = @((Search $anonH "$tag Studio") | Where-Object { $_.kind -eq "event" })
  Check 4 "Searching the organiser's name finds its event ($(Names $byOrg))" (($byOrg.Count -eq 1) -and ($byOrg[0].name -eq "Monsoon $tag Battle"))

  # 5. PEOPLE ARE NEVER RETURNED - there is no person page for a row to open
  $person = Search (Api $ownerA.token) "$tag Dancer"
  $personHit = @($person | Where-Object { $_.name -like "*Dancer*" })
  Check 5 "Searching a dancer's name returns no person row ($($personHit.Count))" ($personHit.Count -eq 0)

  # 6. THE CAP PER KIND, AND THE HREF EACH ROW OPENS
  $t2 = Rpc (Api $ownerA.token) "create_tenant_with_owner" @{ p_name = "$tag Studio Two"; p_type = "studio"; p_area = "Baner"; p_city = "Pune" }
  $t3 = Rpc (Api $ownerA.token) "create_tenant_with_owner" @{ p_name = "$tag Studio Three"; p_type = "studio"; p_area = "Aundh"; p_city = "Pune" }
  $capped = @((Search $anonH $tag 2) | Where-Object { $_.kind -eq "studio" })
  $all = @((Search $anonH $tag 10) | Where-Object { $_.kind -eq "studio" })
  $crewRow = @((Search $anonH $tag) | Where-Object { $_.kind -eq "crew" })[0]
  $evRow = @((Search $anonH $tag) | Where-Object { $_.kind -eq "event" })[0]
  Check 6 "With p_limit 2: $($capped.Count) studios of $($all.Count); the crew opens $($crewRow.href), the event $($evRow.href), sub '$($evRow.sub)'" (
    ($capped.Count -eq 2) -and ($all.Count -eq 3) -and ($crewRow.href -eq "/crew/$($crew.id)") -and ($evRow.href -like "/e/*") -and ($evRow.sub -like "Battle*Proof Hall"))

  # 7. AN EMPTY OR BLANK TERM FINDS NOTHING
  $empty = Search $anonH ""
  $blank = Search $anonH "   "
  Check 7 "Empty term -> $($empty.Count); blank -> $($blank.Count)" (($empty.Count -eq 0) -and ($blank.Count -eq 0))

  # 8. DISCOVER'S STYLE FILTER READS PUBLISHED CLASSES ONLY (findPublishedStylesByTenant): a draft's style never narrows a business in
  $tmr = (Get-Date).AddDays(2)
  Rpc (Api $ownerA.token) "create_class_with_session" @{ p_tenant_id = $ta.id; p_title = "Pub $stamp"; p_style = "Hip-Hop"; p_level = "all"; p_room = $null; p_price_inr = 0; p_capacity = 10;
    p_status = "published"; p_starts_at = $tmr.ToString("yyyy-MM-ddT19:00:00zzz"); p_ends_at = $tmr.ToString("yyyy-MM-ddT20:00:00zzz") } | Out-Null
  Rpc (Api $ownerA.token) "create_class_with_session" @{ p_tenant_id = $ta.id; p_title = "Dr $stamp"; p_style = "Salsa"; p_level = "all"; p_room = $null; p_price_inr = 0; p_capacity = 10;
    p_status = "draft"; p_starts_at = $tmr.ToString("yyyy-MM-ddT17:00:00zzz"); p_ends_at = $tmr.ToString("yyyy-MM-ddT18:00:00zzz") } | Out-Null
  $res = Invoke-WebRequest -Method Get -Uri "$base/rest/v1/classes?select=tenant_id,style&tenant_id=eq.$($ta.id)&status=eq.published&deleted_at=is.null" -Headers $anonH -UseBasicParsing
  $styles = @(($res.Content | ConvertFrom-Json) | ForEach-Object { $_.style })
  $resAll = Invoke-WebRequest -Method Get -Uri "$base/rest/v1/classes?select=style&tenant_id=eq.$($ta.id)&deleted_at=is.null" -Headers $anonH -UseBasicParsing
  $allStyles = @(($resAll.Content | ConvertFrom-Json) | ForEach-Object { $_.style })
  Check 8 "Public styles of the studio: $($styles -join ','); a stranger reads $($allStyles.Count) class in all (the Salsa draft is dark)" (
    ($styles.Count -eq 1) -and ($styles[0] -eq "Hip-Hop") -and ($allStyles.Count -eq 1))
}
finally {
  foreach ($t in @($ta, $tb)) { Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?id=eq.$($t.id)" -Headers $svcH | Out-Null }
  Invoke-RestMethod -Method Delete -Uri "$base/rest/v1/tenants?name=like.$tag*" -Headers $svcH | Out-Null
  foreach ($u in @($ownerA, $ownerB, $dancer)) {
    Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($u.id)" -Headers $adminH | Out-Null
  }
  "   (cleanup: proof studios, crew, events and throwaway accounts deleted)"
}

if ($pass) { "`nALL SEARCH CHECKS PASSED"; exit 0 } else { "`nSEARCH CHECKS FAILED"; exit 1 }
