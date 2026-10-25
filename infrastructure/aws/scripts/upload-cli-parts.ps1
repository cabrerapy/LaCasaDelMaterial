function Get-UploadCliParts($Request) {
  if (-not ($Request.Body -is [string]) -or [string]::IsNullOrWhiteSpace($Request.Body) -or
    $Request.Body -match '^file(b)?://') { throw 'Streaming Body requires a plain file path' }
  $parameters = $Request.PSObject.Copy()
  $parameters.PSObject.Properties.Remove('Body')
  return [pscustomobject]@{ Parameters=$parameters; BodyPath=$Request.Body }
}
