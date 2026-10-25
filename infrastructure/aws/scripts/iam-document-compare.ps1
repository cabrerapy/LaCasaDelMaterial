# Offline comparator: normalize only string/list forms of statement Action/Resource.
# Do not normalize condition values, principal identities, case, or extra fields.
function Assert-SameDocument($Actual, $Expected) {
  if ($Actual -is [string]) { $Actual = $Actual | ConvertFrom-Json }
  if ($Expected -is [string]) { $Expected = $Expected | ConvertFrom-Json }
  function Canonical($Value, [string]$Path = '') {
    if ($Path -cmatch '^Statement\[\d+\]\.(Action|Resource)$' -and $Value -is [string]) {
      $Value = @($Value)
    }
    if ($null -eq $Value) { return 'null' }
    if ($Value -is [System.Management.Automation.PSCustomObject]) {
      return '{' + ((@($Value.PSObject.Properties | Sort-Object Name | ForEach-Object {
        $child = if ($Path) { "$Path.$($_.Name)" } else { $_.Name }
        (ConvertTo-Json -InputObject $_.Name -Compress) + ':' + (Canonical $_.Value $child)
      })) -join ',') + '}'
    }
    if ($Value -is [array]) {
      $parts = @(for ($index=0; $index -lt $Value.Count; $index++) { Canonical $Value[$index] "$Path[$index]" })
      return '[' + ($parts -join ',') + ']'
    }
    return (ConvertTo-Json -InputObject $Value -Compress)
  }
  if ((Canonical $Actual) -cne (Canonical $Expected)) { throw 'Read-back document mismatch; manual review required' }
}
