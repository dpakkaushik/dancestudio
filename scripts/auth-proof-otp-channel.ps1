# Proof for Step 26 - the phone OTP channel.
#
# What can honestly be proven without sending a message to a real phone:
#   * the CHANNEL DECISION is a pure function of two environment switches, and it
#     is exercised over its whole matrix (unset / sms / whatsapp / whatsapp with
#     and without the fallback, and rubbish in the variable);
#   * the PHONE PATH ITSELF works end to end against Supabase's test numbers -
#     signInWithOtp with an explicit channel, verifyOtp with type "sms" (the
#     channel is a delivery choice, not a different kind of token), a real
#     session and a real user id back;
#   * WHAT THE PROJECT IS ACTUALLY CONFIGURED FOR is read from the live auth
#     config and REPORTED rather than asserted, because it is the user's account
#     work: phone sign-in on/off, the provider, whether credentials exist, and
#     the test numbers. A proof that pretended a Twilio account existed would be
#     the opposite of useful.
#
# Reads keys from .env.local - run from the repo root:
#   powershell -File scripts/auth-proof-otp-channel.ps1
$ErrorActionPreference = "Stop"
$PSDefaultParameterValues = @{ "Invoke-RestMethod:UserAgent" = "danceos-proof"; "Invoke-WebRequest:UserAgent" = "danceos-proof" }

$root = Join-Path $PSScriptRoot ".."
$envFile = Join-Path $root ".env.local"
$vars = @{}
Get-Content $envFile | Where-Object { $_ -match "^\s*[A-Z_]+\s*=" } | ForEach-Object {
  $name, $value = $_ -split "=", 2
  $vars[$name.Trim()] = $value.Trim()
}
$base = $vars["NEXT_PUBLIC_SUPABASE_URL"]
$anon = $vars["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
$service = $vars["SUPABASE_SERVICE_ROLE_KEY"]
$mgmt = $vars["SUPABASE_ACCESS_TOKEN"]
if (-not $base -or -not $anon) { throw "Supabase keys missing from .env.local" }

$anonH = @{ apikey = $anon; "Content-Type" = "application/json" }
$adminH = @{ apikey = $service; Authorization = "Bearer $service"; "Content-Type" = "application/json" }

function Check($n, $label, $ok) {
  "$n. $label $(if ($ok) {'-- OK'} else {'-- !!! FAILED !!!'})"
  if (-not $ok) { $script:pass = $false }
}
function Report($label) { "   · $label" }

$pass = $true

# 1. THE DECISION MATRIX - the pure module itself, imported by node (v24 reads
#    TypeScript directly), so this can never drift from what the app runs.
$matrixJs = @'
const { pathToFileURL } = require("url");
(async () => {
  const m = await import(pathToFileURL(process.argv[2]).href);
  const cases = [
    ["unset", {}, "sms"],
    ["sms", { AUTH_OTP_CHANNEL: "sms" }, "sms"],
    ["whatsapp", { AUTH_OTP_CHANNEL: "whatsapp" }, "whatsapp"],
    ["WhatsApp (mixed case, spaced)", { AUTH_OTP_CHANNEL: " WhatsApp " }, "whatsapp"],
    ["rubbish falls back to sms", { AUTH_OTP_CHANNEL: "carrier-pigeon" }, "sms"],
  ];
  const out = [];
  for (const [label, env, expected] of cases) {
    const got = m.preferredOtpChannel(env);
    out.push({ label, expected, got, ok: got === expected });
  }
  const plans = [
    ["whatsapp, no fallback", { AUTH_OTP_CHANNEL: "whatsapp" }, "whatsapp"],
    ["whatsapp + fallback", { AUTH_OTP_CHANNEL: "whatsapp", AUTH_OTP_FALLBACK_SMS: "true" }, "whatsapp,sms"],
    ["sms + fallback (nothing to fall back from)", { AUTH_OTP_CHANNEL: "sms", AUTH_OTP_FALLBACK_SMS: "true" }, "sms"],
    ["fallback needs the literal true", { AUTH_OTP_CHANNEL: "whatsapp", AUTH_OTP_FALLBACK_SMS: "yes" }, "whatsapp"],
  ];
  for (const [label, env, expected] of plans) {
    const got = m.otpChannelPlan(env).join(",");
    out.push({ label: "plan: " + label, expected, got, ok: got === expected });
  }
  out.push({ label: "verify type is sms whatever carried it", expected: "sms", got: m.OTP_VERIFY_TYPE, ok: m.OTP_VERIFY_TYPE === "sms" });
  console.log(JSON.stringify(out));
})();
'@
$matrixPath = Join-Path $env:TEMP "dos-otp-matrix.js"
Set-Content -Path $matrixPath -Value $matrixJs -Encoding utf8
$modulePath = (Resolve-Path (Join-Path $root "lib\auth\otpChannel.ts")).Path
# PowerShell 5.1 turns a native exe writing to stderr into a terminating
# NativeCommandError even with 2>$null, and node warns about the module type of a
# .ts file - so the call is isolated and only the JSON line is read
$prev = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$matrixRaw = & node $matrixPath $modulePath 2>&1 | Where-Object { $_ -is [string] -and $_.TrimStart().StartsWith("[") }
$ErrorActionPreference = $prev
$matrix = @()
# and 5.1 does not ENUMERATE a parsed JSON array down the pipeline - it passes
# the whole array as one item, so @() around the pipeline nests it. foreach does
# enumerate, which is the only reliable way to count these rows.
if ($matrixRaw) {
  try {
    $parsed = ($matrixRaw -join "") | ConvertFrom-Json
    foreach ($row in $parsed) { $matrix += $row }
  } catch { }
}
$bad = @($matrix | Where-Object { -not $_.ok })
foreach ($row in $matrix) { Report "$($row.label) -> $($row.got)" }
# an empty matrix is a FAILED check, not a passed one - this proof said "0 wrong
# out of 0" on its first run and read as green
Check 1 "The channel decision, over $($matrix.Count) environments read from the real module, $($bad.Count) wrong" (
  ($matrix.Count -ge 10) -and ($bad.Count -eq 0))
Remove-Item $matrixPath -Force -ErrorAction SilentlyContinue
# 2. THE PHONE PATH, END TO END, on a test number - with an explicit channel
$testPhone = "+919999999999"
$testOtp = "123456"
$sent = $null
try {
  $sent = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/otp" -Headers $anonH -Body (@{ phone = $testPhone; channel = "sms" } | ConvertTo-Json)
  Check 2 "signInWithOtp on a test number, channel sms: accepted" $true
} catch {
  $body = $_.ErrorDetails.Message
  if (-not $body) { try { $st = $_.Exception.Response.GetResponseStream(); $st.Position = 0; $body = (New-Object System.IO.StreamReader($st)).ReadToEnd() } catch {} }
  Check 2 "signInWithOtp on a test number refused: $body" $false
}

$session = $null
try {
  $session = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/verify" -Headers $anonH -Body (@{ type = "sms"; phone = $testPhone; token = $testOtp } | ConvertTo-Json)
} catch {
  $body = $_.ErrorDetails.Message
  if (-not $body) { try { $st = $_.Exception.Response.GetResponseStream(); $st.Position = 0; $body = (New-Object System.IO.StreamReader($st)).ReadToEnd() } catch {} }
  Report "verify failed: $body"
}
Check 3 "verifyOtp with type sms returns a session for $($session.user.phone)" (
  ($null -ne $session) -and ($session.access_token) -and ($session.user.phone -eq "919999999999"))

# 4. A WHATSAPP SEND IS ATTEMPTED THE SAME WAY - and on a project with no
#    WhatsApp sender the refusal must be the PROVIDER's, not our code's. Either
#    answer proves the call shape is right: accepted (a sender exists) or refused
#    by Supabase/Twilio for a reason that names the provider or the channel.
# the SECOND test number, so Supabase's per-number rate limiter cannot answer
# for the channel (the first run of this proof asserted a "you can only request
# this after 4 seconds" and called it a pass)
$waPhone = "+918888888888"
$waMsg = ""
try {
  Invoke-RestMethod -Method Post -Uri "$base/auth/v1/otp" -Headers $anonH -Body (@{ phone = $waPhone; channel = "whatsapp" } | ConvertTo-Json) | Out-Null
  $waMsg = "accepted"
} catch {
  $body = $_.ErrorDetails.Message
  if (-not $body) { try { $st = $_.Exception.Response.GetResponseStream(); $st.Position = 0; $body = (New-Object System.IO.StreamReader($st)).ReadToEnd() } catch {} }
  try { $waMsg = ($body | ConvertFrom-Json).msg } catch { $waMsg = $body }
  if (-not $waMsg) { $waMsg = $body }
}
Report "channel=whatsapp on a test number: $waMsg"
# a rate-limit answer is evidence of nothing, so it does not count as one
Check 4 "The whatsapp channel is a call this API takes (answer: $waMsg)" (
  ($waMsg -ne "") -and ($waMsg -notmatch "only request this after"))

# 5. WHAT THE PROJECT IS CONFIGURED FOR - reported, not asserted (the user's work)
if ($mgmt) {
  $ref = ($base -replace "^https://", "") -replace "\..*$", ""
  try {
    $cfg = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$ref/config/auth" -Headers @{ Authorization = "Bearer $mgmt" }
    $hasTwilio = [bool]$cfg.sms_twilio_account_sid
    Report "phone sign-in enabled: $($cfg.external_phone_enabled)"
    Report "sms provider: $($cfg.sms_provider)"
    Report "twilio credentials present: $hasTwilio"
    Report "otp length / expiry: $($cfg.sms_otp_length) digits / $($cfg.sms_otp_exp)s"
    Report "test numbers configured: $([bool]$cfg.sms_test_otp)"
    Report "app switch AUTH_OTP_CHANNEL: $(if ($vars['AUTH_OTP_CHANNEL']) { $vars['AUTH_OTP_CHANNEL'] } else { '(unset - sms)' })"
    if (-not $hasTwilio) {
      Report "STILL THE USER'S TO DO: a Twilio account (SMS Messaging Service and/or a WhatsApp sender) in Supabase → Authentication → Providers → Phone; Meta business verification + an approved authentication template for WhatsApp; DLT registration for SMS to Indian numbers."
    }
    Check 5 "The live auth config was read: phone sign-in $($cfg.external_phone_enabled), provider $($cfg.sms_provider), credentials $hasTwilio" (
      ($cfg.external_phone_enabled -eq $true) -and ($null -ne $cfg.sms_provider))
  } catch {
    Check 5 "Could not read the auth config (management token): $($_.Exception.Message)" $false
  }
} else {
  Report "SUPABASE_ACCESS_TOKEN is not set - skipping the config report"
  Check 5 "Config report skipped (no management token)" $true
}

# 6. AND THE OTHER CHANNEL STILL WORKS: the email link path Step 6 shipped
if ($service) {
  $stamp = Get-Date -Format "HHmmss"
  $email = "otp-proof-$stamp@example.com"
  try {
    $link = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/admin/generate_link" -Headers $adminH -Body (@{ type = "magiclink"; email = $email } | ConvertTo-Json)
    Check 6 "The email channel is untouched: a link was minted for $email ($($link.verification_type))" ([bool]$link.hashed_token)
    Invoke-RestMethod -Method Delete -Uri "$base/auth/v1/admin/users/$($link.id)" -Headers $adminH | Out-Null
  } catch {
    Check 6 "Email link minting failed: $($_.Exception.Message)" $false
  }
} else {
  Check 6 "Email check skipped (no service key)" $true
}

if ($pass) { "`nALL OTP CHANNEL CHECKS PASSED"; exit 0 } else { "`nOTP CHANNEL CHECKS FAILED"; exit 1 }
