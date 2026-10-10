# Run proof scripts one after another and print one line per script.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-proofs.ps1                 # every rls-proof-*.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-proofs.ps1 tenants events  # by name fragment
#
# Sequential on purpose: several proofs sign the two test PHONE numbers in, and
# Supabase rate-limits a second OTP for the same number within seconds - running
# them side by side reads as a broken proof (429) when nothing is broken.
# `powershell -File` hands every argument over as a plain string - a comma is
# not an array there, and only the first bare word binds positionally - so the
# fragments are gathered from everything left on the line and split on commas.
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Only)

$ErrorActionPreference = "Continue"
$root = Split-Path $PSScriptRoot -Parent
$scripts = Get-ChildItem (Join-Path $root "scripts") -Filter "rls-proof-*.ps1" | Sort-Object Name
if ($Only) {
  $frags = @($Only | ForEach-Object { $_ -split "," } | Where-Object { $_.Trim() -ne "" })
  $scripts = @($scripts | Where-Object { $n = $_.Name; @($frags | Where-Object { $n -like "*$_*" }).Count -gt 0 })
}

$results = @()
foreach ($s in $scripts) {
  $t0 = Get-Date
  $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $s.FullName 2>&1 | Out-String
  $code = $LASTEXITCODE
  $secs = [int]((Get-Date) - $t0).TotalSeconds
  $tail = ($out -split "`r?`n" | Where-Object { $_.Trim() -ne "" } | Select-Object -Last 1)
  # a check line ends "-- OK" or "-- FAIL"; matched case-sensitively, because a
  # check that SAYS "a failed refund" is not a failed check
  $ok = ($code -eq 0) -and ($out -cnotmatch "-- FAIL")
  $word = if ($ok) { "PASS" } else { "FAIL" }
  Write-Output ("{0,-4} {1,4}s  {2,-42} {3}" -f $word, $secs, $s.Name, $tail)
  if (-not $ok) {
    $fails = ($out -split "`r?`n" | Where-Object { $_ -cmatch "-- FAIL|rror|xception" } | Select-Object -First 6)
    $fails | ForEach-Object { Write-Output ("        {0}" -f $_.Trim()) }
  }
  $results += [pscustomobject]@{ script = $s.Name; ok = $ok }
}
$passed = @($results | Where-Object ok).Count
Write-Output ("{0}/{1} proofs green" -f $passed, $results.Count)

# THE LEFTOVER GUARD, LAST (10 Oct 2026). Every proof now cleans up in a finally
# that checks its own result and prints "CLEANUP -- FAIL" for anything it left;
# this is the second net, read-only: it fails if ANY throwaway admin, test-named
# LISTED studio or throwaway profile is live on the database the proofs just used,
# whichever script (or earlier run) left it. It deletes nothing.
Write-Output ""
Write-Output "leftover guard (scripts/leftover-guard.js, read-only):"
$guardOut = & node (Join-Path $root "scripts\leftover-guard.js") 2>&1 | Out-String
$guardCode = $LASTEXITCODE
($guardOut -split "`r?`n" | Where-Object { $_.Trim() -ne "" }) | ForEach-Object { Write-Output ("  {0}" -f $_) }
$guardOk = ($guardCode -eq 0)
Write-Output ("{0} leftover guard" -f $(if ($guardOk) { "PASS" } else { "FAIL" }))

if (($passed -ne $results.Count) -or (-not $guardOk)) { exit 1 }
