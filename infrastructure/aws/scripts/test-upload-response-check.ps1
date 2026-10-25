$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'upload-response-check.ps1')
$baseline = '{"ChecksumSHA256":"expected","ServerSideEncryption":"aws:kms","SSEKMSKeyId":"exact-key"}'
if ((Assert-UploadResponse ($baseline | ConvertFrom-Json) 'expected' 'exact-key') -cne 'NOT_REPORTED') { throw 'Omitted field is not false' }
foreach ($pair in @(@($null,'NOT_REPORTED'),@($false,'DISABLED_CONFIRMED'))) {
  $response=$baseline | ConvertFrom-Json
  $response | Add-Member NoteProperty BucketKeyEnabled $pair[0]
  if ((Assert-UploadResponse $response 'expected' 'exact-key') -cne $pair[1]) { throw 'Incorrect optional-field state' }
}
$failures=0
foreach ($value in @($true,'false',0)) {
  $response=$baseline | ConvertFrom-Json
  $response | Add-Member NoteProperty BucketKeyEnabled $value
  try { $null=Assert-UploadResponse $response 'expected' 'exact-key' } catch { $failures++; continue }
  throw 'Invalid BucketKey accepted'
}
foreach ($field in @('ChecksumSHA256','ServerSideEncryption','SSEKMSKeyId')) {
  $response=$baseline | ConvertFrom-Json; $response.$field='wrong'
  try { $null=Assert-UploadResponse $response 'expected' 'exact-key' } catch { $failures++; continue }
  throw 'Required check weakened'
}
if ($failures -ne 6) { throw 'Missing negative cases' }
Write-Host 'PASS: 9 upload-response regressions; omitted stays unknown, required checks remain strict; no AWS calls'
