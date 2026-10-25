$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'iam-document-compare.ps1')
$expected = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:PutObject"],"Resource":["arn:aws:s3:::example/exact"],"Condition":{"Bool":{"aws:SecureTransport":"true"}}}]}'
$normalized = '{"Statement":[{"Resource":"arn:aws:s3:::example/exact","Action":"s3:PutObject","Condition":{"Bool":{"aws:SecureTransport":"true"}},"Effect":"Allow"}],"Version":"2012-10-17"}'
Assert-SameDocument $normalized $expected
$rejected = 0
foreach ($changed in @(
  $normalized.Replace('s3:PutObject','s3:*'),
  $normalized.Replace('example/exact','example/*'),
  $normalized.Replace('"true"','"false"'),
  $normalized.Replace('"s3:PutObject"','["s3:PutObject","s3:DeleteObject"]'),
  $normalized.Replace('"Allow"','"Deny"'),
  $normalized.Replace('"true"','["true"]'),
  $normalized.Replace('"Action":','"action":')
)) {
  try { Assert-SameDocument $changed $expected } catch { $rejected++; continue }
  throw 'Comparator accepted changed permission/condition'
}
if ($rejected -ne 7) { throw 'Missing negative checks' }
Write-Host 'PASS: 8 offline IAM comparison cases; no AWS calls'
