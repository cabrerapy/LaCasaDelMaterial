$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$assembly = Join-Path $repo 'infrastructure/aws/cdk.out-review'
$manifest = Get-Content -Raw -LiteralPath (Join-Path $assembly 'LcmApplicationReview.assets.json') | ConvertFrom-Json
$template = Get-Content -Raw -LiteralPath (Join-Path $assembly 'LcmApplicationReview.template.json') | ConvertFrom-Json
$assets = @($manifest.files.PSObject.Properties | Where-Object { $_.Value.source.packaging -eq 'zip' })
$functions = @($template.Resources.PSObject.Properties | Where-Object { $_.Value.Type -eq 'AWS::Lambda::Function' })
if ($assets.Count -ne 1 -or $functions.Count -ne 1) { throw 'Expected one Lambda ZIP/function' }
$hash = [string]$assets[0].Name
if ($hash -cnotmatch '^[a-f0-9]{64}$' -or $assets[0].Value.source.path -cne "asset.$hash") { throw 'Unsafe asset identity/path' }
$destinations = @($assets[0].Value.destinations.PSObject.Properties)
$bucket = 'cdk-hnb659fds-assets-088668667831-us-east-1'
$code = $functions[0].Value.Properties.Code
if ($destinations.Count -ne 1 -or $destinations[0].Value.bucketName -cne $bucket -or
  $destinations[0].Value.objectKey -cne "$hash.zip" -or $destinations[0].Value.region -cne 'us-east-1' -or
  $code.S3Bucket -cne $bucket -or $code.S3Key -cne "$hash.zip" -or
  $code.PSObject.Properties['S3ObjectVersion'] -or $functions[0].Value.Properties.FunctionName -cne 'lcm-production-api') {
  throw 'Unreviewed manifest/template destination'
}
$source = Join-Path $assembly "asset.$hash"
$current = Join-Path $repo 'apps/api/dist/lambda-package'
foreach ($directory in @($source, $current)) {
  $entries = @(Get-ChildItem -LiteralPath $directory -Force)
  if ($entries.Count -ne 2) { throw 'Package must contain only index.js and package.json' }
  foreach ($entry in $entries) {
    if ($entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
      $entry.Name -cnotin @('index.js','package.json')) { throw 'Unexpected package entry' }
  }
  if ((Get-Content -Raw -LiteralPath (Join-Path $directory 'package.json')).Trim() -cne '{"private":true,"type":"commonjs"}') {
    throw 'Unexpected package metadata'
  }
}
foreach ($name in @('index.js','package.json')) {
  if ((Get-FileHash -LiteralPath (Join-Path $source $name) -Algorithm SHA256).Hash -cne
      (Get-FileHash -LiteralPath (Join-Path $current $name) -Algorithm SHA256).Hash) { throw 'Staged/current bundle mismatch; synth again' }
}
# Bounded heuristic, not a security audit; never print matching contents.
$bundle = Get-Content -Raw -LiteralPath (Join-Path $source 'index.js')
if ($bundle -cmatch '(AKIA|ASIA)[A-Z0-9]{16}' -or $bundle -match '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----') {
  throw 'Potential embedded credential; manual review required'
}
$outputDirectory = Join-Path $repo ('.data/asset-publication/' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $outputDirectory | Out-Null
$zipPath = Join-Path $outputDirectory "$hash.zip"
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($source, $zipPath)
$archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  if ($archive.Entries.Count -ne 2) { throw 'Unexpected ZIP entries' }
  foreach ($entry in $archive.Entries) {
    if ($entry.FullName -cnotin @('index.js','package.json')) { throw 'Incorrect ZIP root' }
    $stream = $entry.Open()
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $entryHash = [Convert]::ToHexString($sha.ComputeHash($stream)) }
    finally { $stream.Dispose(); $sha.Dispose() }
    if ($entryHash -cne (Get-FileHash -LiteralPath (Join-Path $source $entry.FullName) -Algorithm SHA256).Hash) {
      throw 'ZIP content integrity mismatch'
    }
  }
} finally { $archive.Dispose() }
[ordered]@{
  result='LOCAL_ZIP_VERIFIED_NOT_PUBLISHED'; readyForPublication=$false
  archive=$zipPath; bytes=(Get-Item -LiteralPath $zipPath).Length
  sha256=(Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  cdkAssetIdentity=$hash; bucket=$bucket; key="$hash.zip"
  limitations='Heuristic credential scan only; build freshness, publisher/KMS/effective permissions/approval still pending. No AWS calls.'
} | ConvertTo-Json
