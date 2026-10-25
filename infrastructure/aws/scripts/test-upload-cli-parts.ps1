$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'upload-cli-parts.ps1')
$request = [pscustomobject]@{Body='C:\folder with spaces\artifact.zip';IfNoneMatch='*';ChecksumSHA256='YQ==';SSEKMSKeyId='exact-key'}
$parts=Get-UploadCliParts $request
if ($parts.Parameters.PSObject.Properties['Body'] -or $parts.BodyPath -cne $request.Body -or
  $request.Body -cne 'C:\folder with spaces\artifact.zip') { throw 'Incorrect streaming body split' }
$roundtrip=($parts.Parameters | ConvertTo-Json -Compress | ConvertFrom-Json)
if ($roundtrip.IfNoneMatch -cne '*' -or $roundtrip.ChecksumSHA256 -cne 'YQ==' -or
  $roundtrip.SSEKMSKeyId -cne 'exact-key') { throw 'Upload controls changed' }
foreach ($invalid in @('', 'file://artifact.zip', 'fileb://artifact.zip')) {
  $failed=$false
  try { $null=Get-UploadCliParts ([pscustomobject]@{Body=$invalid}) } catch { $failed=$true }
  if (-not $failed) { throw 'Invalid body path accepted' }
}
Write-Host 'PASS: streaming CLI split, unchanged controls and three invalid paths; no AWS calls'
