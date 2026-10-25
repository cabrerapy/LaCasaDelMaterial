param([switch]$Publish)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'upload-cli-parts.ps1')
. (Join-Path $PSScriptRoot 'upload-response-check.ps1')
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$plan = & (Join-Path $PSScriptRoot 'prepare-zip-upload.ps1') | ConvertFrom-Json
if ($plan.result -cne 'UPLOAD_REQUEST_ONLY_NOT_PUBLISHED' -or $plan.readyToUpload -ne $false) { throw 'Unexpected local plan' }
if (-not $Publish) { Write-Host 'OFFLINE_UPLOAD_CHECK_ONLY: reviewed ZIP checked; no AWS calls.'; return }
foreach ($entry in Get-ChildItem Env:) {
  if ($entry.Name -like 'AWS_ENDPOINT_URL*' -and $entry.Value) { throw 'Custom AWS endpoint environment rejected' }
}
$savedEnvironment = @{}
$credentialNames = @('AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_SECURITY_TOKEN','AWS_PROFILE','AWS_DEFAULT_PROFILE','AWS_MAX_ATTEMPTS')
foreach ($name in $credentialNames) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$requestFile = [IO.Path]::GetTempFileName()
$lockedZip = $null
$putAttempted = $false
function Read-Base([string[]]$Arguments) {
  $raw = & aws @Arguments --profile lcm-client --region us-east-1 --output json --no-cli-pager --cli-connect-timeout 5 --cli-read-timeout 20
  if ($LASTEXITCODE -ne 0) { throw 'Base AWS check failed; stopping without widening permissions' }
  return ($raw | ConvertFrom-Json)
}
function Read-Publisher([string[]]$Arguments, [string]$Endpoint) {
  $raw = & aws @Arguments --endpoint-url $Endpoint --region us-east-1 --output json --no-cli-pager --cli-connect-timeout 5 --cli-read-timeout 30
  if ($LASTEXITCODE -ne 0) { throw 'Publisher request failed; do not retry automatically or remove upload conditions' }
  return ($raw | ConvertFrom-Json)
}
try {
  $env:AWS_MAX_ATTEMPTS='1'
  # Prevent environment credentials left from local QA from overriding the named profile.
  foreach ($name in @('AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_SECURITY_TOKEN')) {
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
  }
  & (Join-Path $PSScriptRoot 'create-asset-publisher.ps1') -VerifyOnly
  $identity = Read-Base @('sts','get-caller-identity','--endpoint-url','https://sts.us-east-1.amazonaws.com')
  if ($identity.Arn -cne 'arn:aws:iam::088668667831:user/lcm-admin') { throw 'Unexpected operator' }
  $keyArn=$plan.putObjectRequest.SSEKMSKeyId
  $key = Read-Base @('kms','describe-key','--key-id',$keyArn,'--endpoint-url','https://kms.us-east-1.amazonaws.com')
  if ($key.KeyMetadata.Arn -cne $keyArn -or $key.KeyMetadata.AWSAccountId -cne '088668667831' -or
    $key.KeyMetadata.KeyManager -cne 'AWS' -or $key.KeyMetadata.KeyState -cne 'Enabled' -or
    $key.KeyMetadata.KeyUsage -cne 'ENCRYPT_DECRYPT') { throw 'Unreviewed KMS state' }
  $encryption = Read-Base @('s3api','get-bucket-encryption','--bucket',$plan.putObjectRequest.Bucket,
    '--expected-bucket-owner','088668667831','--endpoint-url','https://s3.us-east-1.amazonaws.com')
  $rules=@($encryption.ServerSideEncryptionConfiguration.Rules)
  if ($rules.Count -ne 1 -or $rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm -cne 'aws:kms' -or
    $rules[0].BucketKeyEnabled -ne $false) { throw 'Bucket encryption changed; review before upload' }
  # Keep reviewed bytes immutable while CLI opens its own read handle.
  $lockedZip = [IO.File]::Open($plan.putObjectRequest.Body, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $lockedHash=[Convert]::ToHexString($sha.ComputeHash($lockedZip)).ToLowerInvariant() }
  finally { $sha.Dispose() }
  if ($lockedHash -cne $plan.sha256 -or $lockedZip.Length -ne $plan.putObjectRequest.ContentLength) { throw 'ZIP changed since preparation' }
  $session = Read-Base @('sts','assume-role','--role-arn',$plan.intendedRole,'--role-session-name','lcm-reviewed-zip-upload',
    '--duration-seconds','900','--endpoint-url','https://sts.us-east-1.amazonaws.com')
  if (-not $session.Credentials.AccessKeyId -or -not $session.Credentials.SecretAccessKey -or
    -not $session.Credentials.SessionToken -or
    $session.AssumedRoleUser.Arn -cne 'arn:aws:sts::088668667831:assumed-role/lcm-production-asset-publisher/lcm-reviewed-zip-upload') {
    throw 'Unexpected temporary publisher session'
  }
  $env:AWS_ACCESS_KEY_ID=$session.Credentials.AccessKeyId
  $env:AWS_SECRET_ACCESS_KEY=$session.Credentials.SecretAccessKey
  $env:AWS_SESSION_TOKEN=$session.Credentials.SessionToken
  $env:AWS_PROFILE=$null; $env:AWS_DEFAULT_PROFILE=$null
  $session=$null
  $caller=Read-Publisher @('sts','get-caller-identity') 'https://sts.us-east-1.amazonaws.com'
  if ($caller.Account -cne '088668667831' -or
    $caller.Arn -cne 'arn:aws:sts::088668667831:assumed-role/lcm-production-asset-publisher/lcm-reviewed-zip-upload') { throw 'Unexpected active publisher' }
  # Streaming Body must be a separate CLI file argument, not a JSON blob value.
  $cliParts = Get-UploadCliParts $plan.putObjectRequest
  $requestParameters = $cliParts.Parameters
  if ($requestParameters.PSObject.Properties['Body']) { throw 'Body must not be serialized as JSON blob' }
  [IO.File]::WriteAllText($requestFile, (ConvertTo-Json -InputObject $requestParameters -Depth 8 -Compress), [Text.UTF8Encoding]::new($false))
  $putAttempted=$true
  $result=Read-Publisher @('s3api','put-object','--cli-input-json',"file://$requestFile",'--body',$cliParts.BodyPath) 'https://s3.us-east-1.amazonaws.com'
  $bucketKeyState=Assert-UploadResponse $result $plan.putObjectRequest.ChecksumSHA256 $keyArn
  [ordered]@{ result='ZIP_PUBLISHED_RESPONSE_VERIFIED_NOT_DEPLOYED'; bucket=$plan.putObjectRequest.Bucket
    key=$plan.putObjectRequest.Key; bytes=$lockedZip.Length; sha256=$lockedHash
    versionId=$result.VersionId; encryption=$result.ServerSideEncryption; kmsKeyArn=$result.SSEKMSKeyId
    bucketKeyState=$bucketKeyState
    note='Verified PutObject response; independent remote metadata check remains. No deployment.' } | ConvertTo-Json
} catch {
  if ($putAttempted) { Write-Warning 'PUT attempted: object may exist even if response verification failed. Do not rerun, overwrite or delete; inspect exact object first.' }
  throw
} finally {
  if ($lockedZip) { $lockedZip.Dispose() }
  foreach ($name in $credentialNames) { [Environment]::SetEnvironmentVariable($name,$savedEnvironment[$name],'Process') }
  $session=$null
  Remove-Item -LiteralPath $requestFile -Force -ErrorAction SilentlyContinue
}
