param([string]$ArchivePath)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$assetHash = '01b2a9375621410f29dabe33d6c820b323b919ed7cb8a0bfd71d0278acbe8409'
$expectedSha = 'aee89f6d5fe8d364462e716417b81051e2fcc45b88e2c3933e43ac8ac2385004'
if (-not $ArchivePath) {
  $ArchivePath = Join-Path $repo ".data/asset-publication/25e2ddf8ff274127aa8c461ab9bd9795/$assetHash.zip"
}
$archive = Get-Item -LiteralPath $ArchivePath
if ($archive.PSIsContainer -or ($archive.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
  $archive.Name -cne "$assetHash.zip" -or $archive.Length -ne 687779) { throw 'Unreviewed ZIP path/name/size' }
$sha = (Get-FileHash -LiteralPath $archive.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if ($sha -cne $expectedSha) { throw 'Reviewed ZIP checksum mismatch; no request prepared' }
$assembly = Join-Path $repo 'infrastructure/aws/cdk.out-review'
$manifest = Get-Content -Raw -LiteralPath (Join-Path $assembly 'LcmApplicationReview.assets.json') | ConvertFrom-Json
$template = Get-Content -Raw -LiteralPath (Join-Path $assembly 'LcmApplicationReview.template.json') | ConvertFrom-Json
$assetEntries = @($manifest.files.PSObject.Properties | Where-Object { $_.Value.source.packaging -eq 'zip' })
$functions = @($template.Resources.PSObject.Properties | Where-Object { $_.Value.Type -eq 'AWS::Lambda::Function' })
$bucket = 'cdk-hnb659fds-assets-088668667831-us-east-1'
if ($assetEntries.Count -ne 1 -or $assetEntries[0].Name -cne $assetHash -or $functions.Count -ne 1) { throw 'Candidate changed' }
$destinations = @($assetEntries[0].Value.destinations.PSObject.Properties)
if ($destinations.Count -ne 1 -or $destinations[0].Value.bucketName -cne $bucket -or
  $destinations[0].Value.objectKey -cne "$assetHash.zip" -or $destinations[0].Value.region -cne 'us-east-1' -or
  $functions[0].Value.Properties.Code.S3Bucket -cne $bucket -or
  $functions[0].Value.Properties.Code.S3Key -cne "$assetHash.zip" -or
  $functions[0].Value.Properties.Code.PSObject.Properties['S3ObjectVersion']) { throw 'Manifest/template destination mismatch' }
$checksumBase64 = [Convert]::ToBase64String([Convert]::FromHexString($sha))
[ordered]@{
  result='UPLOAD_REQUEST_ONLY_NOT_PUBLISHED'; readyToUpload=$false
  intendedRole='arn:aws:iam::088668667831:role/lcm-production-asset-publisher'
  region='us-east-1'; sha256=$sha
  putObjectRequest=[ordered]@{
    Bucket=$bucket; Key="$assetHash.zip"; Body=$archive.FullName
    ExpectedBucketOwner='088668667831'; IfNoneMatch='*'; ContentType='application/zip'
    ContentLength=$archive.Length; ChecksumAlgorithm='SHA256'; ChecksumSHA256=$checksumBase64
    ServerSideEncryption='aws:kms'
    SSEKMSKeyId='arn:aws:kms:us-east-1:088668667831:key/111fac51-e972-4c13-88f7-9f3e7a1b3ba0'
    BucketKeyEnabled=$false
  }
  blockers=@('Separate explicit upload and role-assumption approval required',
    'Recheck operator/role/boundary and bucket/key state immediately before approved upload',
    'No credentials or AWS calls here; request is not executed or saved automatically',
    'Single PUT only; no automatic retries, overwrite fallback, ACL, tags or deployment',
    'Local check is point-in-time; lock or reverify bytes before sending and verify response checksum/encryption')
} | ConvertTo-Json -Depth 8
