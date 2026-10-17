# No AWS calls. Preserve exactly three fractional digits in IAM date conditions.
function ConvertTo-EdgePolicyJson([object]$Policy) {
  if (@($Policy.Statement).Count -ne 1) { throw 'Expected one edge statement' }
  foreach ($operator in @('DateGreaterThanEquals', 'DateLessThan')) {
    $condition = $Policy.Statement[0].Condition.$operator
    $value = $condition.'aws:CurrentTime'
    if ($value -is [DateTime]) {
      if ($value.Kind -eq [DateTimeKind]::Unspecified) { throw 'Ambiguous edge date timezone' }
      $utc = $value.ToUniversalTime()
    } elseif ($value -is [DateTimeOffset]) {
      $utc = $value.UtcDateTime
    } elseif ($value -is [string]) {
      $utc = [DateTimeOffset]::ParseExact($value, "yyyy-MM-dd'T'HH:mm:ss.fff'Z'",
        [System.Globalization.CultureInfo]::InvariantCulture,
        [System.Globalization.DateTimeStyles]::AssumeUniversal).UtcDateTime
    } else {
      throw 'Edge dates must be UTC strings or typed timestamps'
    }
    $condition.'aws:CurrentTime' = $utc.ToString('yyyy-MM-ddTHH:mm:ss.fffZ',
      [System.Globalization.CultureInfo]::InvariantCulture)
  }
  return (ConvertTo-Json -InputObject $Policy -Depth 40 -Compress)
}
