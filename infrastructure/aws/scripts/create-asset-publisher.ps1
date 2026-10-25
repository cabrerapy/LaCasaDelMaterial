param([switch]$Apply, [switch]$VerifyOnly)

$ErrorActionPreference = 'Stop'
if ($Apply -and $VerifyOnly) { throw 'Choose Apply or VerifyOnly, never both' }
. (Join-Path $PSScriptRoot 'iam-document-compare.ps1')
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$account = '088668667831'
$region = 'us-east-1'
$profile = 'lcm-client'
$roleName = 'lcm-production-asset-publisher'
$boundaryArn = 'arn:aws:iam::088668667831:policy/lcm-production-asset-publisher-boundary'
$policyName = 'lcm-production-publish-exact-lambda-zip'
$assetHash = '01b2a9375621410f29dabe33d6c820b323b919ed7cb8a0bfd71d0278acbe8409'
$keyArn = 'arn:aws:kms:us-east-1:088668667831:key/111fac51-e972-4c13-88f7-9f3e7a1b3ba0'
$requestFile = [IO.Path]::GetTempFileName()
$utf8 = [Text.UTF8Encoding]::new($false)
$previousAttempts = $env:AWS_MAX_ATTEMPTS
$env:AWS_MAX_ATTEMPTS = '1'
$writeAttempted = $false

function Invoke-AwsJson([string[]]$Arguments) {
  $raw = & aws @Arguments --profile $profile --region $region --output json --no-cli-pager --cli-connect-timeout 5 --cli-read-timeout 20
  if ($LASTEXITCODE -ne 0) { throw 'AWS operation failed; no automatic retries or permission expansion' }
  if ($raw) { return ($raw | ConvertFrom-Json) }
}
function Save-Request($Request) {
  [IO.File]::WriteAllText($requestFile, (ConvertTo-Json -InputObject $Request -Depth 40 -Compress), $utf8)
}

try {
  & npm.cmd --prefix (Join-Path $repo 'infrastructure/aws') run build
  if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
  $proposal = & node (Join-Path $repo 'infrastructure/aws/dist/bin/prepare-asset-publisher.js') `
    $account $region $assetHash $keyArn | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $proposal.roleName -cne $roleName -or
    $proposal.result -cne 'INCOMPLETE_REVIEW_ONLY_NOT_APPLIED' -or $proposal.readyForPublication -ne $false) {
    throw 'Unexpected proposal'
  }
  $create = @{ RoleName=$roleName; AssumeRolePolicyDocument=(ConvertTo-Json -InputObject $proposal.trustPolicy -Depth 30 -Compress);
    MaxSessionDuration=3600; PermissionsBoundary=$boundaryArn }
  $put = @{ RoleName=$roleName; PolicyName=$policyName;
    PolicyDocument=(ConvertTo-Json -InputObject $proposal.s3Policy -Depth 30 -Compress) }
  if (-not $Apply -and -not $VerifyOnly) {
    Write-Host 'OFFLINE_CREATE_PLAN_ONLY: one role and one inline S3 policy; no AWS calls. Publication remains blocked.'
    return
  }
  $identity = Invoke-AwsJson @('sts','get-caller-identity')
  if ($identity.Account -cne $account -or $identity.Arn -cne $proposal.operatorArn) { throw 'Unexpected operator' }
  $boundary = Invoke-AwsJson @('iam','get-policy','--policy-arn',$boundaryArn)
  if ($boundary.Policy.Arn -cne $boundaryArn -or -not $boundary.Policy.DefaultVersionId) { throw 'Independent boundary missing' }
  $version = Invoke-AwsJson @('iam','get-policy-version','--policy-arn',$boundaryArn,'--version-id',$boundary.Policy.DefaultVersionId)
  Assert-SameDocument $version.PolicyVersion.Document $proposal.s3Policy
  if (-not $VerifyOnly) {
  # Only NoSuchEntity permits creation. Access denied/expiry/network errors stop.
  $existing = & aws iam get-role --role-name $roleName --profile $profile --region $region --output json --no-cli-pager --cli-connect-timeout 5 --cli-read-timeout 20 2>&1
  if ($LASTEXITCODE -eq 0) { throw 'Role already exists; refusing adoption or update' }
  if (($existing | Out-String) -notmatch '\(NoSuchEntity\)') { throw 'Could not confirm role absence' }
  foreach ($entry in @(
    @{policyType='RESOURCE_POLICY';validatePolicyResourceType='AWS::IAM::AssumeRolePolicyDocument';policyDocument=$create.AssumeRolePolicyDocument},
    @{policyType='IDENTITY_POLICY';policyDocument=$put.PolicyDocument}
  )) {
    Save-Request $entry
    $validation = Invoke-AwsJson @('accessanalyzer','validate-policy','--cli-input-json',"file://$requestFile")
    if (-not $validation.PSObject.Properties['findings'] -or @($validation.findings).Count -ne 0) {
      throw 'Policy validation has findings; no writes allowed'
    }
  }
  Save-Request $create
  $writeAttempted = $true
  $created = Invoke-AwsJson @('iam','create-role','--cli-input-json',"file://$requestFile")
  if ($created.Role.Arn -cne $proposal.roleArn) { throw 'Unexpected created role' }
  Save-Request $put
  $null = Invoke-AwsJson @('iam','put-role-policy','--cli-input-json',"file://$requestFile")
  }
  $actual = Invoke-AwsJson @('iam','get-role','--role-name',$roleName)
  $inline = Invoke-AwsJson @('iam','get-role-policy','--role-name',$roleName,'--policy-name',$policyName)
  $attached = Invoke-AwsJson @('iam','list-attached-role-policies','--role-name',$roleName)
  $names = Invoke-AwsJson @('iam','list-role-policies','--role-name',$roleName)
  if ($actual.Role.Arn -cne $proposal.roleArn -or $actual.Role.MaxSessionDuration -ne 3600 -or
    $actual.Role.PermissionsBoundary.PermissionsBoundaryArn -cne $boundaryArn -or @($attached.AttachedPolicies).Count -ne 0 -or
    @($names.PolicyNames).Count -ne 1 -or $names.PolicyNames[0] -cne $policyName) { throw 'Unexpected role configuration' }
  Assert-SameDocument $actual.Role.AssumeRolePolicyDocument $proposal.trustPolicy
  Assert-SameDocument $inline.PolicyDocument $proposal.s3Policy
  $finalBoundary = Invoke-AwsJson @('iam','get-policy','--policy-arn',$boundaryArn)
  if ($finalBoundary.Policy.DefaultVersionId -cne $boundary.Policy.DefaultVersionId) { throw 'Boundary version changed during creation' }
  if ($VerifyOnly) {
    $operatorInline = Invoke-AwsJson @('iam','list-user-policies','--user-name','lcm-admin')
    if (@($operatorInline.PolicyNames) -ccontains 'lcm-temporary-create-asset-publisher') { throw 'Temporary delegation still present' }
    Write-Host 'ROLE_READ_ONLY_VERIFIED_NOT_PUBLISHED: exact trust/inline/boundary checked; temporary delegation absent. No AWS writes or role assumption.'
  } else {
    Write-Host 'ROLE_CREATED_AND_READ_BACK_NOT_PUBLISHED: lcm-production-asset-publisher; no role assumption, upload or deployment.'
  }
} catch {
  if ($writeAttempted) {
    Write-Warning 'AWS write attempted: role/policy may partially exist. Do not rerun or delete automatically; inspect exact role before recovery.'
  }
  throw
} finally {
  $env:AWS_MAX_ATTEMPTS = $previousAttempts
  Remove-Item -LiteralPath $requestFile -Force -ErrorAction SilentlyContinue
}
