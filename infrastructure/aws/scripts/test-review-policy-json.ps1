$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'review-policy-json.ps1')
$originalCulture = [System.Threading.Thread]::CurrentThread.CurrentCulture
try {
  foreach ($culture in @('en-US', 'es-PY')) {
    [System.Threading.Thread]::CurrentThread.CurrentCulture = [System.Globalization.CultureInfo]::GetCultureInfo($culture)
    foreach ($fraction in @('000', '100', '650', '999')) {
      $start = "2026-10-17T12:00:00.${fraction}Z"
      $end = "2026-10-17T12:30:00.${fraction}Z"
      $raw = '{"Statement":[{"Condition":{"DateGreaterThanEquals":{"aws:CurrentTime":"START"},"DateLessThan":{"aws:CurrentTime":"END"}}}]}'
      $raw = $raw.Replace('START', $start).Replace('END', $end)
      # Default JSON parsing reproduces automatic DateTime conversion in pwsh.
      $policy = $raw | ConvertFrom-Json
      $json = ConvertTo-EdgePolicyJson $policy
      foreach ($expected in @($start, $end)) {
        if (-not $json.Contains(('"aws:CurrentTime":"{0}"' -f $expected))) {
          throw "Date serialization regression: $culture $fraction"
        }
      }
    }
  }
  Write-Host 'PASS: 8 date serialization cases, both operators; no AWS calls'
} finally {
  [System.Threading.Thread]::CurrentThread.CurrentCulture = $originalCulture
}
