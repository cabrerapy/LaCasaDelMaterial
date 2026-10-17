param([switch]$Offline)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$account = '088668667831'
$region = 'us-east-1'
$profile = 'lcm-client'
$executorRole = 'lcm-production-cfn-executor' # Proposed name; this script never creates/adopts it.
$utf8 = New-Object System.Text.UTF8Encoding($false)
$requestFile = [System.IO.Path]::GetTempFileName()
. (Join-Path $PSScriptRoot 'review-policy-json.ps1')

function Read-AwsJson([string[]]$CliArguments) {
  $raw = & aws @CliArguments --profile $profile --region $region --no-cli-pager --cli-connect-timeout 5 --cli-read-timeout 20
  if ($LASTEXITCODE -ne 0) { throw 'AWS read-only request failed; no permission changes made' }
  return ($raw | ConvertFrom-Json)
}

try {
  if (-not $Offline) {
    $identity = Read-AwsJson @('sts', 'get-caller-identity')
    if ($identity.Arn -ne "arn:aws:iam::${account}:user/lcm-admin") { throw 'Unexpected AWS operator' }
  }
  & npm.cmd --prefix (Join-Path $repo 'infrastructure/aws') run build
  if ($LASTEXITCODE -ne 0) { throw 'Infrastructure build failed' }
  $proposal = & node (Join-Path $repo 'infrastructure/aws/dist/bin/prepare-runtime-boundary.js') `
    $account $region lcm-production-runtime lcm-production-runtime-boundary | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $proposal.result -ne 'REVIEW_ONLY_NOT_APPLIED') { throw 'Invalid offline proposal' }
  $expiry = [DateTime]::UtcNow.AddMinutes(30).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  $edge = & node (Join-Path $repo 'infrastructure/aws/dist/bin/prepare-edge-creation.js') `
    $account $region $executorRole $expiry | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $edge.result -ne 'REVIEW_ONLY_NOT_APPLIED') { throw 'Invalid edge proposal' }
  $policies = @{}
  foreach ($name in @('runtimeBoundary', 'executorIamPortionOnly', 'executorDataPortionOnly',
    'executorStoragePortionOnly', 'executorComputePortionOnly', 'executorIdentityPortionOnly', 'executorApiPortionOnly')) {
    if (-not $proposal.$name.Statement) { throw "Missing policy: $name" }
    $policies[$name] = ConvertTo-Json -InputObject $proposal.$name -Depth 40 -Compress
  }
  # Do not let automatic DateTime round-tripping trim .000/.100/.650 to
  # variable precision. Normalize to canonical UTC strings before serialization.
  $policies.edge = ConvertTo-EdgePolicyJson $edge.policy
  foreach ($name in ($policies.Keys | Sort-Object)) {
    $validation = @{policyType='IDENTITY_POLICY'; policyDocument=$policies[$name]}
    [System.IO.File]::WriteAllText($requestFile, (ConvertTo-Json -InputObject $validation -Depth 45 -Compress), $utf8)
    if (-not $Offline) {
      $result = Read-AwsJson @('accessanalyzer', 'validate-policy', '--cli-input-json', "file://$requestFile")
      if (-not $result.PSObject.Properties['findings']) { throw "Missing validation findings: $name" }
      if (@($result.findings).Count -ne 0) {
        $result.findings | Select-Object findingType, issueCode, findingDetails, locations |
          ConvertTo-Json -Depth 12 | Write-Host
        throw "Policy findings require review: $name"
      }
      Write-Host "VALIDATED: $name"
    }
  }

  $r = @{'aws:RequestedRegion'=$region}
  $ownedS3 = @{'aws:RequestedRegion'=$region; 's3:ResourceAccount'=$account}
  $ownedPool = @{'aws:RequestedRegion'=$region; 'aws:ResourceTag/Project'='LaCasaDelMaterial'; 'aws:ResourceTag/Environment'='production'}
  $poolCreate = @{'aws:RequestedRegion'=$region; 'aws:RequestTag/Project'='LaCasaDelMaterial'; 'aws:RequestTag/Environment'='production'}
  $fn = "arn:aws:lambda:${region}:${account}:function:$($proposal.names.functionName)"
  $table = "arn:aws:dynamodb:${region}:${account}:table/$($proposal.names.tables.users)"
  $bucket = "arn:aws:s3:::$($proposal.names.evidenceBucket)"
  $pool = "arn:aws:cognito-idp:${region}:${account}:userpool/${region}_ReviewOnly"
  $apiCollection = "arn:aws:apigateway:${region}::/apis"
  $api = "$apiCollection/reviewonly"
  $apiOwned = $ownedPool.Clone(); $apiOwned['aws:PrincipalAccount']=$account
  $apiCreate = $poolCreate.Clone(); $apiCreate['aws:PrincipalAccount']=$account
  $apiCreate['apigateway:Request/ApiName']=$proposal.names.apiName
  $apiWrongName = $apiCreate.Clone(); $apiWrongName['apigateway:Request/ApiName']='other-project-api'
  $apiUntagged = @{'aws:PrincipalAccount'=$account;'aws:RequestedRegion'=$region;'apigateway:Request/ApiName'=$proposal.names.apiName}
  $apiOtherAccount = $apiOwned.Clone(); $apiOtherAccount['aws:PrincipalAccount']='999999999999'
  # Recent PowerShell versions parse JSON ISO timestamps as DateTime; Windows
  # PowerShell keeps strings. Normalize explicitly instead of culture formatting.
  $startValue = $edge.policy.Statement[0].Condition.DateGreaterThanEquals.'aws:CurrentTime'
  if ($startValue -is [DateTime]) {
    $startTime = $startValue.ToUniversalTime()
  } else {
    $startTime = [DateTimeOffset]::Parse([string]$startValue, [System.Globalization.CultureInfo]::InvariantCulture).UtcDateTime
  }
  $start = $startTime.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  $edgeContext = @{'aws:PrincipalArn'="arn:aws:iam::${account}:role/$executorRole"; 'aws:PrincipalAccount'=$account; 'aws:CurrentTime'=$start}
  $expired = $edgeContext.Clone(); $expired['aws:CurrentTime']=$expiry
  $before = $edgeContext.Clone(); $before['aws:CurrentTime']=$startTime.AddSeconds(-1).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  $otherRole = $edgeContext.Clone(); $otherRole['aws:PrincipalArn']="arn:aws:iam::${account}:role/lcm-production-other"
  $otherAccount = $edgeContext.Clone(); $otherAccount['aws:PrincipalAccount']='999999999999'

  # Every entry evaluates exactly one action/resource. Context values are simulation inputs,
  # not evidence that the real CloudFormation handler supplies them.
  $cases = @(
    @('data-create-own','executorDataPortionOnly','dynamodb:CreateTable',$table,'allowed',$r),
    @('data-other-table','executorDataPortionOnly','dynamodb:CreateTable',"$table-other",'implicitDeny',$r),
    @('data-no-items','executorDataPortionOnly','dynamodb:GetItem',$table,'implicitDeny',$r),
    @('s3-create','executorStoragePortionOnly','s3:CreateBucket',$bucket,'allowed',$r),
    @('s3-owned-config','executorStoragePortionOnly','s3:PutBucketPolicy',$bucket,'allowed',$ownedS3),
    @('s3-wrong-owner','executorStoragePortionOnly','s3:PutBucketPolicy',$bucket,'implicitDeny',@{'aws:RequestedRegion'=$region;'s3:ResourceAccount'='999999999999'}),
    @('s3-no-upload','executorStoragePortionOnly','s3:PutObject',"$bucket/deliveries/test",'implicitDeny',$ownedS3),
    @('lambda-own-config','executorComputePortionOnly','lambda:UpdateFunctionConfiguration',$fn,'allowed',$r),
    @('lambda-other-function','executorComputePortionOnly','lambda:UpdateFunctionConfiguration',"$fn-other",'implicitDeny',$r),
    @('lambda-api-permission','executorComputePortionOnly','lambda:AddPermission',$fn,'allowed',@{'aws:RequestedRegion'=$region;'lambda:Principal'='apigateway.amazonaws.com'}),
    @('lambda-public-permission','executorComputePortionOnly','lambda:AddPermission',$fn,'implicitDeny',@{'aws:RequestedRegion'=$region;'lambda:Principal'='*'}),
    @('logs-retention','executorComputePortionOnly','logs:PutRetentionPolicy',"arn:aws:logs:${region}:${account}:log-group:$($proposal.names.logGroup):*",'allowed',$r),
    @('logs-no-event-read','executorComputePortionOnly','logs:GetLogEvents',"arn:aws:logs:${region}:${account}:log-group:$($proposal.names.logGroup):log-stream:test",'implicitDeny',$r),
    @('runtime-https','runtimeBoundary','s3:GetObject',"$bucket/deliveries/test",'allowed',@{'aws:SecureTransport'='true'}),
    @('runtime-http','runtimeBoundary','s3:GetObject',"$bucket/deliveries/test",'implicitDeny',@{'aws:SecureTransport'='false'}),
    @('runtime-index','runtimeBoundary','dynamodb:Query',"$table/index/UsernameIndex",'allowed',@{}),
    @('runtime-other-index','runtimeBoundary','dynamodb:Query',"$table/index/OtherIndex",'implicitDeny',@{}),
    @('cognito-tagged-update','executorIdentityPortionOnly','cognito-idp:UpdateUserPool',$pool,'allowed',$ownedPool),
    @('cognito-missing-tags','executorIdentityPortionOnly','cognito-idp:UpdateUserPool',$pool,'implicitDeny',$r),
    @('cognito-no-user-admin','executorIdentityPortionOnly','cognito-idp:AdminCreateUser',$pool,'implicitDeny',$ownedPool),
    @('cognito-tagged-create','executorIdentityPortionOnly','cognito-idp:CreateUserPool','*','allowed',$poolCreate),
    @('cognito-missing-create-tags','executorIdentityPortionOnly','cognito-idp:CreateUserPool','*','implicitDeny',$r),
    @('api-create-named-tagged','executorApiPortionOnly','apigateway:POST',$apiCollection,'allowed',$apiCreate),
    @('api-create-wrong-name','executorApiPortionOnly','apigateway:POST',$apiCollection,'implicitDeny',$apiWrongName),
    @('api-create-missing-tags','executorApiPortionOnly','apigateway:POST',$apiCollection,'implicitDeny',$apiUntagged),
    @('api-update-tagged','executorApiPortionOnly','apigateway:PATCH',$api,'allowed',$apiOwned),
    @('api-update-missing-tags','executorApiPortionOnly','apigateway:PATCH',$api,'implicitDeny',$r),
    @('api-other-account','executorApiPortionOnly','apigateway:PATCH',$api,'implicitDeny',$apiOtherAccount),
    @('api-create-route','executorApiPortionOnly','apigateway:POST',"$api/routes",'allowed',$apiOwned),
    @('api-no-invoke','executorApiPortionOnly','execute-api:Invoke',"arn:aws:execute-api:${region}:${account}:reviewonly/GET/test",'implicitDeny',$apiOwned),
    @('edge-create-cache','edge','cloudfront:CreateCachePolicy','*','allowed',$edgeContext),
    @('edge-create-oac','edge','cloudfront:CreateOriginAccessControl','*','allowed',$edgeContext),
    @('edge-expired','edge','cloudfront:CreateCachePolicy','*','implicitDeny',$expired),
    @('edge-before-window','edge','cloudfront:CreateCachePolicy','*','implicitDeny',$before),
    @('edge-other-role','edge','cloudfront:CreateCachePolicy','*','implicitDeny',$otherRole),
    @('edge-other-account','edge','cloudfront:CreateCachePolicy','*','implicitDeny',$otherAccount)
  )
  foreach ($case in $cases) {
    $context = @($case[5].GetEnumerator() | ForEach-Object {
      @{ContextKeyName=$_.Key; ContextKeyValues=@([string]$_.Value); ContextKeyType=$(if ($_.Key -eq 'aws:CurrentTime') {'date'} elseif ($_.Key -eq 'aws:SecureTransport') {'boolean'} else {'string'})}
    })
    $request = @{PolicyInputList=@($policies[$case[1]]); ActionNames=@($case[2]); ResourceArns=@($case[3])}
    if ($context.Count -gt 0) { $request.ContextEntries=$context }
    $json = ConvertTo-Json -InputObject $request -Depth 45 -Compress
    $roundtrip = $json | ConvertFrom-Json
    if ($roundtrip.PolicyInputList.Count -ne 1 -or -not ($roundtrip.PolicyInputList[0] | ConvertFrom-Json).Statement) { throw 'Invalid serialized policy list' }
    [System.IO.File]::WriteAllText($requestFile, $json, $utf8)
    if (-not $Offline) {
      $result = Read-AwsJson @('iam', 'simulate-custom-policy', '--cli-input-json', "file://$requestFile")
      if (@($result.EvaluationResults).Count -ne 1) { throw "Unexpected evaluation count: $($case[0])" }
      $evaluation = $result.EvaluationResults[0]
      if ($evaluation.EvalDecision -ne $case[4]) { throw "Unexpected decision: $($case[0]) $($evaluation.EvalDecision)" }
      if ($case[4] -eq 'allowed' -and @($evaluation.MissingContextValues).Count -gt 0) { throw "Missing positive context: $($case[0])" }
      Write-Host "PASS: $($case[0]) - $($evaluation.EvalDecision)"
    }
  }
  if ($Offline) {
    Write-Host "OFFLINE_REQUESTS_VALID_NOT_REMOTE_PASS: $($policies.Count) policies; $($cases.Count) cases"
  } else {
    Write-Host "REMOTE_DOCUMENT_REVIEW_PASS_NOT_DEPLOYED: $($policies.Count) policies; $($cases.Count) cases"
  }
} finally {
  # Exact single temporary file created above; no directory removal.
  Remove-Item -LiteralPath $requestFile -Force -ErrorAction SilentlyContinue
}
