param([switch]$Offline)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$account = '088668667831'
$region = 'us-east-1'
$profile = 'lcm-client'
$executorRole = 'lcm-production-cfn-executor' # Proposed name; this script never creates/adopts it.
$kmsKeyArn = 'arn:aws:kms:us-east-1:088668667831:key/111fac51-e972-4c13-88f7-9f3e7a1b3ba0' # Client-confirmed metadata; not an access grant.
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
  $bundle = & node (Join-Path $repo 'infrastructure/aws/dist/bin/prepare-executor-review.js') `
    $account $region lcm-production-runtime lcm-production-runtime-boundary $executorRole | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $bundle.result -ne 'INCOMPLETE_REVIEW_ONLY_NOT_APPLIED' -or
    $bundle.readyForDeployment -ne $false) { throw 'Invalid incomplete executor bundle' }
  # Local agreement only: not proof of freshness, publication, encryption or bytes.
  $assembly = Join-Path $repo 'infrastructure/aws/cdk.out-review'
  $manifest = Get-Content -Raw -LiteralPath (Join-Path $assembly 'LcmApplicationReview.assets.json') | ConvertFrom-Json
  $template = Get-Content -Raw -LiteralPath (Join-Path $assembly 'LcmApplicationReview.template.json') | ConvertFrom-Json
  $zipAssets = @($manifest.files.PSObject.Properties | Where-Object { $_.Value.source.packaging -eq 'zip' })
  $functions = @($template.Resources.PSObject.Properties | Where-Object { $_.Value.Type -eq 'AWS::Lambda::Function' })
  if ($zipAssets.Count -ne 1 -or $functions.Count -ne 1) { throw 'Expected one explicit Lambda ZIP and function; regenerate/review candidate' }
  $destinations = @($zipAssets[0].Value.destinations.PSObject.Properties)
  $assetHash = [string]$zipAssets[0].Name
  $expectedBucket = "cdk-hnb659fds-assets-${account}-${region}"
  $code = $functions[0].Value.Properties.Code
  if ($assetHash -cnotmatch '^[a-f0-9]{64}$' -or $destinations.Count -ne 1 -or
    $destinations[0].Value.bucketName -cne $expectedBucket -or
    $destinations[0].Value.objectKey -cne "$assetHash.zip" -or
    $destinations[0].Value.region -cne $region -or
    $code.S3Bucket -cne $expectedBucket -or $code.S3Key -cne "$assetHash.zip" -or
    $code.PSObject.Properties['S3ObjectVersion'] -or
    $functions[0].Value.Properties.FunctionName -cne 'lcm-production-api') {
    throw 'Manifest/template ZIP target mismatch; no broader fallback permitted'
  }
  $asset = & node (Join-Path $repo 'infrastructure/aws/dist/bin/prepare-asset-read.js') `
    $account $region $executorRole $assetHash | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $asset.result -ne 'INCOMPLETE_REVIEW_ONLY_NOT_APPLIED' -or
    $asset.readyForDeployment -ne $false -or -not $asset.policy.Statement) { throw 'Invalid exact asset proposal' }
  $policies = @{}
  $policies.assetRead = ConvertTo-Json -InputObject $asset.policy -Depth 40 -Compress
  $publisher = & node (Join-Path $repo 'infrastructure/aws/dist/bin/prepare-asset-publisher.js') `
    $account $region $assetHash $kmsKeyArn | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $publisher.result -ne 'INCOMPLETE_REVIEW_ONLY_NOT_APPLIED' -or
    $publisher.readyForPublication -ne $false -or -not $publisher.trustPolicy.Statement -or
    -not $publisher.s3Policy.Statement) { throw 'Invalid publisher proposal' }
  $policies.publisherTrust = ConvertTo-Json -InputObject $publisher.trustPolicy -Depth 40 -Compress
  $policies.publisherS3 = ConvertTo-Json -InputObject $publisher.s3Policy -Depth 40 -Compress
  $delegation = & node (Join-Path $repo 'infrastructure/aws/dist/bin/prepare-publisher-delegation.js') `
    $account $region $assetHash $kmsKeyArn $expiry | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $delegation.readyToApply -ne $false -or
    $delegation.result -cne 'INCOMPLETE_DELEGATION_REVIEW_ONLY') { throw 'Invalid delegation proposal' }
  foreach ($statement in $delegation.operatorPolicy.Statement) {
    if ($statement.Effect -ceq 'Allow') {
      $null = ConvertTo-EdgePolicyJson ([pscustomobject]@{Version='2012-10-17';Statement=@($statement)})
    }
  }
  $policies.publisherDelegation = ConvertTo-Json -InputObject $delegation.operatorPolicy -Depth 40 -Compress
  $policies.publisherBoundary = ConvertTo-Json -InputObject $delegation.boundaryDocument -Depth 40 -Compress
  $authority = & node (Join-Path $repo 'infrastructure/aws/dist/bin/prepare-executor-authority.js') $account $region | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $authority.result -cne 'INCOMPLETE_EXECUTOR_AUTHORITY_REVIEW_ONLY' -or
    $authority.readyForDeployment -ne $false) { throw 'Invalid authority proposal' }
  $policies.executorTrust = ConvertTo-Json -InputObject $authority.trustPolicy -Depth 40 -Compress
  $policies.operatorPassExecutor = ConvertTo-Json -InputObject $authority.operatorPassRolePolicy -Depth 40 -Compress
  $operatorStack = & node (Join-Path $repo 'infrastructure/aws/dist/bin/prepare-operator-stack.js') $account $region | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $operatorStack.result -cne 'OPERATOR_STACK_PLAN_ONLY_NOT_APPLIED' -or
    $operatorStack.readyToApply -ne $false) { throw 'Invalid operator stack proposal' }
  $policies.operatorStackReview = ConvertTo-Json -InputObject $operatorStack.reviewPolicy -Depth 40 -Compress
  $policies.operatorStackExecution = ConvertTo-Json -InputObject $operatorStack.executionPolicy -Depth 40 -Compress
  $policies.operatorCreationTags = ConvertTo-Json -InputObject $operatorStack.creationTaggingPolicy -Depth 40 -Compress
  $policies.operatorExecutionTags = ConvertTo-Json -InputObject $operatorStack.executionTaggingPolicy -Depth 40 -Compress
  foreach ($name in @('runtimeBoundary', 'executorIamPortionOnly', 'executorDataPortionOnly',
    'executorStoragePortionOnly', 'executorComputePortionOnly', 'executorIdentityPortionOnly', 'executorApiPortionOnly')) {
    if (-not $proposal.$name.Statement) { throw "Missing policy: $name" }
    $policies[$name] = ConvertTo-Json -InputObject $proposal.$name -Depth 40 -Compress
  }
  # Do not let automatic DateTime round-tripping trim .000/.100/.650 to
  # variable precision. Normalize to canonical UTC strings before serialization.
  $policies.edge = ConvertTo-EdgePolicyJson $edge.policy
  if (-not $edge.taggedPolicy.Statement) { throw 'Missing tagged edge proposal' }
  $policies.edgeTagged = ConvertTo-EdgePolicyJson $edge.taggedPolicy
  if (-not $edge.distributionTaggingPolicy.Statement) { throw 'Missing distribution tagging proposal' }
  $policies.distributionTagging = ConvertTo-EdgePolicyJson $edge.distributionTaggingPolicy
  if (-not $edge.functionLifecyclePolicy.Statement) { throw 'Missing exact function lifecycle proposal' }
  foreach ($statement in $edge.functionLifecyclePolicy.Statement) {
    $null = ConvertTo-EdgePolicyJson ([pscustomobject]@{Version='2012-10-17';Statement=@($statement)})
  }
  $policies.functionLifecycle = ConvertTo-Json -InputObject $edge.functionLifecyclePolicy -Depth 40 -Compress
  if (-not $edge.initialLifecyclePolicy.Statement) { throw 'Missing initial edge lifecycle proposal' }
  foreach ($statement in $edge.initialLifecyclePolicy.Statement) {
    $null = ConvertTo-EdgePolicyJson ([pscustomobject]@{Version='2012-10-17';Statement=@($statement)})
  }
  $policies.initialLifecycle = ConvertTo-Json -InputObject $edge.initialLifecyclePolicy -Depth 40 -Compress
  $bundleDocuments = @()
  foreach ($part in $bundle.policies) {
    $document = ConvertTo-Json -InputObject $part.document -Depth 40 -Compress
    if ($document.Length -gt 6144 -or -not $part.document.Statement) { throw 'Invalid managed-policy partition' }
    if ($policies.ContainsKey($part.proposedName)) { throw 'Duplicate bundle partition' }
    $policies[$part.proposedName]=$document
    $bundleDocuments += $document
  }
  if ($bundleDocuments.Count -lt 1) { throw 'Empty executor bundle' }
  foreach ($name in ($policies.Keys | Sort-Object)) {
    $validation = @{policyType='IDENTITY_POLICY'; policyDocument=$policies[$name]}
    if ($name -in @('publisherTrust','executorTrust')) {
      $validation.policyType='RESOURCE_POLICY'
      $validation.validatePolicyResourceType='AWS::IAM::AssumeRolePolicyDocument'
    }
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

  $simulationPolicies = @{}
  foreach ($name in $policies.Keys) { $simulationPolicies[$name]=@($policies[$name]) }
  $simulationPolicies.executorBundle=$bundleDocuments
  # Exact proposed eight-document union. Never include runtime, publisher,
  # delegation, operator or trust documents as executor permissions.
  $attachmentDocuments = @($bundleDocuments) + @($policies.assetRead, $policies.edge,
    $policies.edgeTagged, $policies.functionLifecycle, $policies.distributionTagging, $policies.initialLifecycle)
  if ($attachmentDocuments.Count -ne 8) { throw 'Unexpected proposed attachment count; review union explicitly' }
  $simulationPolicies.executorAttachments=$attachmentDocuments
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
  $taggedEdge = $edgeContext.Clone()
  $taggedEdge['aws:RequestTag/Project']='LaCasaDelMaterial'; $taggedEdge['aws:RequestTag/Environment']='production'
  $taggedExpired = $taggedEdge.Clone(); $taggedExpired['aws:CurrentTime']=$expiry
  $taggedOtherRole = $taggedEdge.Clone(); $taggedOtherRole['aws:PrincipalArn']="arn:aws:iam::${account}:role/lcm-production-other"
  $taggedWrongProject = $taggedEdge.Clone(); $taggedWrongProject['aws:RequestTag/Project']='OtherProject'
  $distributionArn = "arn:aws:cloudfront::${account}:distribution/EREVIEWONLY"
  $spaFunctionArn = "arn:aws:cloudfront::${account}:function/lcm-production-spa"
  $distributionTags = $taggedEdge.Clone(); $distributionTags['aws:TagKeys']=@('Project','Environment')
  $distributionExtra = $distributionTags.Clone(); $distributionExtra['aws:TagKeys']=@('Project','Environment','Other')
  $distributionMissing = $distributionTags.Clone(); $distributionMissing.Remove('aws:RequestTag/Environment')
  $distributionWrongProject = $distributionTags.Clone(); $distributionWrongProject['aws:RequestTag/Project']='OtherProject'
  $distributionOtherRole = $distributionTags.Clone(); $distributionOtherRole['aws:PrincipalArn']=$otherRole['aws:PrincipalArn']
  $distributionOtherAccount = $distributionTags.Clone(); $distributionOtherAccount['aws:PrincipalAccount']='999999999999'
  $distributionExpired = $distributionTags.Clone(); $distributionExpired['aws:CurrentTime']=$expiry
  $distributionBefore = $distributionTags.Clone(); $distributionBefore['aws:CurrentTime']=$before['aws:CurrentTime']
  $assetArn = "arn:aws:s3:::${expectedBucket}/$assetHash.zip"
  $assetContext = @{'aws:PrincipalArn'="arn:aws:iam::${account}:role/$executorRole";
    'aws:PrincipalAccount'=$account;'s3:ResourceAccount'=$account;'aws:RequestedRegion'=$region;'aws:SecureTransport'='true'}
  $assetHttp = $assetContext.Clone(); $assetHttp['aws:SecureTransport']='false'
  $assetOtherRole = $assetContext.Clone(); $assetOtherRole['aws:PrincipalArn']="arn:aws:iam::${account}:role/lcm-production-other"
  $assetOtherOwner = $assetContext.Clone(); $assetOtherOwner['s3:ResourceAccount']='999999999999'
  $assetOtherRegion = $assetContext.Clone(); $assetOtherRegion['aws:RequestedRegion']='us-east-2'
  $publishContext = $assetContext.Clone()
  $publishContext['aws:PrincipalArn']=$publisher.roleArn
  $publishContext['s3:x-amz-server-side-encryption']='aws:kms'
  $publishContext['s3:x-amz-server-side-encryption-aws-kms-key-id']=$kmsKeyArn
  $publishContext['s3:if-none-match']='*'
  $publishMissingKey = $publishContext.Clone(); $publishMissingKey.Remove('s3:x-amz-server-side-encryption-aws-kms-key-id')
  $publishOtherKey = $publishContext.Clone(); $publishOtherKey['s3:x-amz-server-side-encryption-aws-kms-key-id']=$kmsKeyArn.Replace('111fac51','222fac51')
  $publishUnconditional = $publishContext.Clone(); $publishUnconditional.Remove('s3:if-none-match')
  $publishWrongEncryption = $publishContext.Clone(); $publishWrongEncryption['s3:x-amz-server-side-encryption']='AES256'
  $publishHttp = $publishContext.Clone(); $publishHttp['aws:SecureTransport']='false'
  $publishWrongRole = $publishContext.Clone(); $publishWrongRole['aws:PrincipalArn']=$assetContext['aws:PrincipalArn']
  $delegateContext = @{'aws:PrincipalArn'=$publisher.operatorArn;'aws:SecureTransport'='true';
    'aws:CurrentTime'=$delegation.operatorPolicy.Statement[0].Condition.DateGreaterThanEquals.'aws:CurrentTime';
    'iam:PermissionsBoundary'=$delegation.boundaryArn}
  $delegateNoBoundary = $delegateContext.Clone(); $delegateNoBoundary.Remove('iam:PermissionsBoundary')
  $delegateWrongBoundary = $delegateContext.Clone(); $delegateWrongBoundary['iam:PermissionsBoundary']="$($delegation.boundaryArn)-other"
  $delegateExpired = $delegateContext.Clone(); $delegateExpired['aws:CurrentTime']=$expiry
  $passExecutor = @{'aws:PrincipalArn'=$authority.operatorArn;'aws:PrincipalAccount'=$account;
    'iam:PassedToService'='cloudformation.amazonaws.com';'aws:SecureTransport'='true'}
  $passEc2 = $passExecutor.Clone(); $passEc2['iam:PassedToService']='ec2.amazonaws.com'
  $passOtherOperator = $passExecutor.Clone(); $passOtherOperator['aws:PrincipalArn']="arn:aws:iam::${account}:user/other"
  $passHttp = $passExecutor.Clone(); $passHttp['aws:SecureTransport']='false'
  $stackSimulationArn = "arn:aws:cloudformation:${region}:${account}:stack/LcmApplicationReview/review-only-id"
  $stackOtherArn = "arn:aws:cloudformation:${region}:${account}:stack/OtherStack/review-only-id"
  $stackContext = @{'aws:PrincipalArn'=$authority.operatorArn;'aws:PrincipalAccount'=$account;
    'aws:RequestedRegion'=$region;'aws:SecureTransport'='true';
    'cloudformation:RoleArn'=$authority.roleArn;'cloudformation:ChangeSetName'='lcm-reviewed-simulation'}
  $stackWrongRole=$stackContext.Clone(); $stackWrongRole['cloudformation:RoleArn']="arn:aws:iam::${account}:role/other"
  $stackMissingRole=$stackContext.Clone(); $stackMissingRole.Remove('cloudformation:RoleArn')
  $stackWrongRegion=$stackContext.Clone(); $stackWrongRegion['aws:RequestedRegion']='us-east-2'
  $stackWrongOperator=$stackContext.Clone(); $stackWrongOperator['aws:PrincipalArn']="arn:aws:iam::${account}:user/other"
  $stackHttp=$stackContext.Clone(); $stackHttp['aws:SecureTransport']='false'
  $stackWrongName=$stackContext.Clone(); $stackWrongName['cloudformation:ChangeSetName']='unreviewed'

  # Every entry evaluates exactly one action/resource. Context values are simulation inputs,
  # not evidence that the real CloudFormation handler supplies them.
  $cases = @(
    @('stack-create-change-set','operatorStackReview','cloudformation:CreateChangeSet',$stackSimulationArn,'allowed',$stackContext),
    @('stack-wrong-executor','operatorStackReview','cloudformation:CreateChangeSet',$stackSimulationArn,'implicitDeny',$stackWrongRole),
    @('stack-missing-executor','operatorStackReview','cloudformation:CreateChangeSet',$stackSimulationArn,'implicitDeny',$stackMissingRole),
    @('stack-other-name','operatorStackReview','cloudformation:CreateChangeSet',$stackOtherArn,'implicitDeny',$stackContext),
    @('stack-foreign-resource','operatorStackReview','cloudformation:CreateChangeSet',$stackSimulationArn.Replace($account,'999999999999'),'implicitDeny',$stackContext),
    @('stack-other-region','operatorStackReview','cloudformation:CreateChangeSet',$stackSimulationArn,'implicitDeny',$stackWrongRegion),
    @('stack-other-operator','operatorStackReview','cloudformation:CreateChangeSet',$stackSimulationArn,'implicitDeny',$stackWrongOperator),
    @('stack-http','operatorStackReview','cloudformation:CreateChangeSet',$stackSimulationArn,'implicitDeny',$stackHttp),
    @('stack-change-set-wrong-name','operatorStackReview','cloudformation:CreateChangeSet',$stackSimulationArn,'implicitDeny',$stackWrongName),
    @('stack-read','operatorStackReview','cloudformation:DescribeStacks',$stackSimulationArn,'allowed',$stackContext),
    @('stack-change-set-read','operatorStackReview','cloudformation:DescribeChangeSet',$stackSimulationArn,'allowed',$stackContext),
    @('stack-review-no-execute','operatorStackReview','cloudformation:ExecuteChangeSet',$stackSimulationArn,'implicitDeny',$stackContext),
    @('stack-execute-separate','operatorStackExecution','cloudformation:ExecuteChangeSet',$stackSimulationArn,'allowed',$stackContext),
    @('stack-execute-wrong-name','operatorStackExecution','cloudformation:ExecuteChangeSet',$stackSimulationArn,'implicitDeny',$stackWrongName),
    @('stack-execute-other-stack','operatorStackExecution','cloudformation:ExecuteChangeSet',$stackOtherArn,'implicitDeny',$stackContext),
    @('stack-no-tag-yet','operatorStackReview','cloudformation:TagResource',$stackSimulationArn,'implicitDeny',$stackContext),
    @('stack-no-untag-yet','operatorStackReview','cloudformation:UntagResource',$stackSimulationArn,'implicitDeny',$stackContext),
    @('stack-no-direct-update','operatorStackReview','cloudformation:UpdateStack',$stackSimulationArn,'implicitDeny',$stackContext),
    @('stack-no-delete','operatorStackReview','cloudformation:DeleteStack',$stackSimulationArn,'implicitDeny',$stackContext),
    @('stack-no-direct-create','operatorStackReview','cloudformation:CreateStack',$stackSimulationArn,'implicitDeny',$stackContext),
    @('function-describe','functionLifecycle','cloudfront:DescribeFunction',$spaFunctionArn,'allowed',$edgeContext),
    @('function-get','functionLifecycle','cloudfront:GetFunction',$spaFunctionArn,'allowed',$edgeContext),
    @('function-update','functionLifecycle','cloudfront:UpdateFunction',$spaFunctionArn,'allowed',$edgeContext),
    @('function-publish','functionLifecycle','cloudfront:PublishFunction',$spaFunctionArn,'allowed',$edgeContext),
    @('function-delete-permission-only','functionLifecycle','cloudfront:DeleteFunction',$spaFunctionArn,'allowed',$edgeContext),
    @('function-list-tags','functionLifecycle','cloudfront:ListTagsForResource',$spaFunctionArn,'allowed',$edgeContext),
    @('function-tag','functionLifecycle','cloudfront:TagResource',$spaFunctionArn,'allowed',$taggedEdge),
    @('function-tag-missing-tags','functionLifecycle','cloudfront:TagResource',$spaFunctionArn,'implicitDeny',$edgeContext),
    @('function-tag-wrong-project','functionLifecycle','cloudfront:TagResource',$spaFunctionArn,'implicitDeny',$taggedWrongProject),
    @('function-other-name','functionLifecycle','cloudfront:PublishFunction',"$spaFunctionArn-other",'implicitDeny',$edgeContext),
    @('function-other-resource-account','functionLifecycle','cloudfront:PublishFunction','arn:aws:cloudfront::999999999999:function/lcm-production-spa','implicitDeny',$edgeContext),
    @('function-other-role','functionLifecycle','cloudfront:PublishFunction',$spaFunctionArn,'implicitDeny',$otherRole),
    @('function-other-principal-account','functionLifecycle','cloudfront:PublishFunction',$spaFunctionArn,'implicitDeny',$otherAccount),
    @('function-expired','functionLifecycle','cloudfront:PublishFunction',$spaFunctionArn,'implicitDeny',$expired),
    @('function-before-window','functionLifecycle','cloudfront:PublishFunction',$spaFunctionArn,'implicitDeny',$before),
    @('function-no-create','functionLifecycle','cloudfront:CreateFunction',$spaFunctionArn,'implicitDeny',$taggedEdge),
    @('function-no-untag','functionLifecycle','cloudfront:UntagResource',$spaFunctionArn,'implicitDeny',$taggedEdge),
    @('function-no-distribution-tag','functionLifecycle','cloudfront:TagResource',$distributionArn,'implicitDeny',$taggedEdge),
    @('distribution-tags-allowed','distributionTagging','cloudfront:TagResource',$distributionArn,'allowed',$distributionTags),
    @('distribution-tags-extra-key','distributionTagging','cloudfront:TagResource',$distributionArn,'implicitDeny',$distributionExtra),
    @('distribution-tags-missing-environment','distributionTagging','cloudfront:TagResource',$distributionArn,'implicitDeny',$distributionMissing),
    @('distribution-tags-wrong-project','distributionTagging','cloudfront:TagResource',$distributionArn,'implicitDeny',$distributionWrongProject),
    @('distribution-tags-other-role','distributionTagging','cloudfront:TagResource',$distributionArn,'implicitDeny',$distributionOtherRole),
    @('distribution-tags-other-account','distributionTagging','cloudfront:TagResource',$distributionArn,'implicitDeny',$distributionOtherAccount),
    @('distribution-tags-foreign-resource','distributionTagging','cloudfront:TagResource','arn:aws:cloudfront::999999999999:distribution/EREVIEWONLY','implicitDeny',$distributionTags),
    @('distribution-tags-expired','distributionTagging','cloudfront:TagResource',$distributionArn,'implicitDeny',$distributionExpired),
    @('distribution-tags-before-window','distributionTagging','cloudfront:TagResource',$distributionArn,'implicitDeny',$distributionBefore),
    @('distribution-tags-no-function','distributionTagging','cloudfront:TagResource',"arn:aws:cloudfront::${account}:function/lcm-production-spa",'implicitDeny',$distributionTags),
    @('distribution-tags-no-delete','distributionTagging','cloudfront:DeleteDistribution',$distributionArn,'implicitDeny',$distributionTags),
    @('distribution-tags-no-untag','distributionTagging','cloudfront:UntagResource',$distributionArn,'implicitDeny',$distributionTags),
    @('operator-pass-executor','operatorPassExecutor','iam:PassRole',$authority.roleArn,'allowed',$passExecutor),
    @('operator-no-pass-runtime','operatorPassExecutor','iam:PassRole',"arn:aws:iam::${account}:role/lcm-production-runtime",'implicitDeny',$passExecutor),
    @('operator-no-pass-ec2','operatorPassExecutor','iam:PassRole',$authority.roleArn,'implicitDeny',$passEc2),
    @('operator-no-other-user','operatorPassExecutor','iam:PassRole',$authority.roleArn,'implicitDeny',$passOtherOperator),
    @('operator-no-http','operatorPassExecutor','iam:PassRole',$authority.roleArn,'implicitDeny',$passHttp),
    @('delegate-create-bounded','publisherDelegation','iam:CreateRole',$publisher.roleArn,'allowed',$delegateContext),
    @('delegate-no-boundary','publisherDelegation','iam:CreateRole',$publisher.roleArn,'implicitDeny',$delegateNoBoundary),
    @('delegate-wrong-boundary','publisherDelegation','iam:CreateRole',$publisher.roleArn,'implicitDeny',$delegateWrongBoundary),
    @('delegate-other-role','publisherDelegation','iam:CreateRole',"$($publisher.roleArn)-other",'implicitDeny',$delegateContext),
    @('delegate-expired','publisherDelegation','iam:CreateRole',$publisher.roleArn,'implicitDeny',$delegateExpired),
    @('delegate-put-inline','publisherDelegation','iam:PutRolePolicy',$publisher.roleArn,'allowed',$delegateContext),
    @('delegate-no-remove-boundary','publisherDelegation','iam:DeleteRolePermissionsBoundary',$publisher.roleArn,'explicitDeny',$delegateContext),
    @('delegate-no-edit-boundary','publisherDelegation','iam:CreatePolicyVersion',$delegation.boundaryArn,'explicitDeny',$delegateContext),
    @('publisher-missing-key','publisherS3','s3:PutObject',$assetArn,'implicitDeny',$publishMissingKey),
    @('publisher-other-key','publisherS3','s3:PutObject',$assetArn,'implicitDeny',$publishOtherKey),
    @('publisher-conditional-put','publisherS3','s3:PutObject',$assetArn,'allowed',$publishContext),
    @('publisher-no-condition','publisherS3','s3:PutObject',$assetArn,'implicitDeny',$publishUnconditional),
    @('publisher-wrong-encryption','publisherS3','s3:PutObject',$assetArn,'implicitDeny',$publishWrongEncryption),
    @('publisher-http','publisherS3','s3:PutObject',$assetArn,'implicitDeny',$publishHttp),
    @('publisher-other-role','publisherS3','s3:PutObject',$assetArn,'implicitDeny',$publishWrongRole),
    @('publisher-other-object','publisherS3','s3:PutObject',"$assetArn-other",'implicitDeny',$publishContext),
    @('asset-exact-zip','assetRead','s3:GetObject',$assetArn,'allowed',$assetContext),
    @('asset-other-object','assetRead','s3:GetObject',"$assetArn-other",'implicitDeny',$assetContext),
    @('asset-http','assetRead','s3:GetObject',$assetArn,'implicitDeny',$assetHttp),
    @('asset-other-role','assetRead','s3:GetObject',$assetArn,'implicitDeny',$assetOtherRole),
    @('asset-other-owner','assetRead','s3:GetObject',$assetArn,'implicitDeny',$assetOtherOwner),
    @('asset-other-region','assetRead','s3:GetObject',$assetArn,'implicitDeny',$assetOtherRegion),
    @('asset-no-upload','assetRead','s3:PutObject',$assetArn,'implicitDeny',$assetContext),
    @('asset-no-delete','assetRead','s3:DeleteObject',$assetArn,'implicitDeny',$assetContext),
    @('asset-no-list','assetRead','s3:ListBucket',"arn:aws:s3:::$expectedBucket",'implicitDeny',$assetContext),
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
    @('edge-other-account','edge','cloudfront:CreateCachePolicy','*','implicitDeny',$otherAccount),
    @('edge-tagged-distribution','edgeTagged','cloudfront:CreateDistribution','*','allowed',$taggedEdge),
    @('edge-tagged-function','edgeTagged','cloudfront:CreateFunction','*','allowed',$taggedEdge),
    @('edge-distribution-missing-tags','edgeTagged','cloudfront:CreateDistribution','*','implicitDeny',$edgeContext),
    @('edge-function-missing-tags','edgeTagged','cloudfront:CreateFunction','*','implicitDeny',$edgeContext),
    @('edge-tagged-expired','edgeTagged','cloudfront:CreateDistribution','*','implicitDeny',$taggedExpired),
    @('edge-tagged-other-role','edgeTagged','cloudfront:CreateFunction','*','implicitDeny',$taggedOtherRole),
    @('edge-tagged-other-project','edgeTagged','cloudfront:CreateDistribution','*','implicitDeny',$taggedWrongProject),
    @('edge-tagged-no-retag','edgeTagged','cloudfront:TagResource',"arn:aws:cloudfront::${account}:distribution/EREVIEWONLY",'implicitDeny',$taggedEdge),
    @('bundle-own-table','executorBundle','dynamodb:CreateTable',$table,'allowed',$r),
    @('bundle-no-runtime-data','executorBundle','dynamodb:GetItem',$table,'implicitDeny',$r),
    @('bundle-no-user-admin','executorBundle','cognito-idp:AdminCreateUser',$pool,'implicitDeny',$ownedPool),
    @('bundle-preserves-boundary-deny','executorBundle','iam:DeleteRolePermissionsBoundary',"arn:aws:iam::${account}:role/lcm-production-runtime",'explicitDeny',$r),
    @('bundle-no-temporary-edge-grant','executorBundle','cloudfront:CreateCachePolicy','*','implicitDeny',$edgeContext),
    @('bundle-no-adopt-untagged-pool','executorBundle','cognito-idp:TagResource',$pool,'implicitDeny',$r)
  )
  # Synthetic IDs are simulation inputs only, never actual deployment targets.
  $initialTargets = @(
    @{Name='distribution'; Resource=$distributionArn; Actions=@('GetDistribution','GetDistributionConfig','UpdateDistribution','DeleteDistribution','ListTagsForResource')},
    @{Name='cache'; Resource="arn:aws:cloudfront::${account}:cache-policy/00000000-0000-4000-8000-000000000001"; Actions=@('GetCachePolicy','GetCachePolicyConfig','UpdateCachePolicy','DeleteCachePolicy')},
    @{Name='oac'; Resource="arn:aws:cloudfront::${account}:origin-access-control/EREVIEWONLY"; Actions=@('GetOriginAccessControl','GetOriginAccessControlConfig','UpdateOriginAccessControl','DeleteOriginAccessControl')}
  )
  foreach ($target in $initialTargets) {
    foreach ($action in $target.Actions) {
      $cases += ,@("initial-$($target.Name)-$action",'initialLifecycle',"cloudfront:$action",$target.Resource,'allowed',$edgeContext)
    }
    $readAction = "cloudfront:$($target.Actions[0])"
    $cases += ,@("initial-$($target.Name)-other-role",'initialLifecycle',$readAction,$target.Resource,'implicitDeny',$otherRole)
    $cases += ,@("initial-$($target.Name)-other-account",'initialLifecycle',$readAction,$target.Resource,'implicitDeny',$otherAccount)
    $cases += ,@("initial-$($target.Name)-foreign-resource",'initialLifecycle',$readAction,$target.Resource.Replace($account,'999999999999'),'implicitDeny',$edgeContext)
    $cases += ,@("initial-$($target.Name)-expired",'initialLifecycle',$readAction,$target.Resource,'implicitDeny',$expired)
    $cases += ,@("initial-$($target.Name)-before-window",'initialLifecycle',$readAction,$target.Resource,'implicitDeny',$before)
    $cases += ,@("initial-$($target.Name)-wrong-resource-type",'initialLifecycle',$readAction,$spaFunctionArn,'implicitDeny',$edgeContext)
    $cases += ,@("initial-$($target.Name)-no-tag",'initialLifecycle','cloudfront:TagResource',$target.Resource,'implicitDeny',$taggedEdge)
  }
  # These expected Allows expose composition risk; they are NOT evidence of
  # resource ownership or authorization to modify an existing resource.
  $cases += @(
    @('combined-create-cache','executorAttachments','cloudfront:CreateCachePolicy','*','allowed',$edgeContext),
    @('combined-function-publish','executorAttachments','cloudfront:PublishFunction',$spaFunctionArn,'allowed',$edgeContext),
    @('combined-existing-distribution-update-risk','executorAttachments','cloudfront:UpdateDistribution',$distributionArn,'allowed',$edgeContext),
    @('combined-existing-distribution-retag-risk','executorAttachments','cloudfront:TagResource',$distributionArn,'allowed',$distributionTags),
    @('combined-cache-delete-permission-only','executorAttachments','cloudfront:DeleteCachePolicy',$initialTargets[1].Resource,'allowed',$edgeContext),
    @('combined-oac-read','executorAttachments','cloudfront:GetOriginAccessControl',$initialTargets[2].Resource,'allowed',$edgeContext),
    @('combined-exact-zip','executorAttachments','s3:GetObject',$assetArn,'allowed',$assetContext),
    @('combined-own-table-config','executorAttachments','dynamodb:CreateTable',$table,'allowed',$r),
    @('combined-no-runtime-data','executorAttachments','dynamodb:GetItem',$table,'implicitDeny',$r),
    @('combined-no-user-admin','executorAttachments','cognito-idp:AdminCreateUser',$pool,'implicitDeny',$ownedPool),
    @('combined-boundary-deny-preserved','executorAttachments','iam:DeleteRolePermissionsBoundary',"arn:aws:iam::${account}:role/lcm-production-runtime",'explicitDeny',$r),
    @('combined-no-publisher-upload','executorAttachments','s3:PutObject',$assetArn,'implicitDeny',$publishContext),
    @('combined-no-human-assume','executorAttachments','sts:AssumeRole',$authority.roleArn,'implicitDeny',$edgeContext),
    @('combined-edge-expired','executorAttachments','cloudfront:UpdateDistribution',$distributionArn,'implicitDeny',$expired),
    @('combined-edge-other-role','executorAttachments','cloudfront:UpdateDistribution',$distributionArn,'implicitDeny',$otherRole),
    @('combined-no-foreign-distribution','executorAttachments','cloudfront:UpdateDistribution','arn:aws:cloudfront::999999999999:distribution/EREVIEWONLY','implicitDeny',$edgeContext)
  )
  foreach ($tagStage in @(
    @{Name='prepare';Operation='CreateChangeSet';Policy='operatorCreationTags'},
    @{Name='execute';Operation='ExecuteChangeSet';Policy='operatorExecutionTags'}
  )) {
    $tagContext=$stackContext.Clone()
    $tagContext['cloudformation:CreateAction']=$tagStage.Operation
    $tagContext['aws:RequestTag/Project']='LaCasaDelMaterial'; $tagContext['aws:RequestTag/Environment']='production'
    $tagContext['aws:ResourceTag/Project']='LaCasaDelMaterial'; $tagContext['aws:ResourceTag/Environment']='production'
    $tagContext['aws:TagKeys']=@('Project','Environment')
    $noAction=$tagContext.Clone(); $noAction.Remove('cloudformation:CreateAction')
    $wrongAction=$tagContext.Clone(); $wrongAction['cloudformation:CreateAction']='UpdateStack'
    $wrongProject=$tagContext.Clone(); $wrongProject['aws:RequestTag/Project']='Other'
    $extraKeys=$tagContext.Clone(); $extraKeys['aws:TagKeys']=@('Project','Environment','Other')
    $noKeys=$tagContext.Clone(); $noKeys.Remove('aws:TagKeys')
    $unowned=$tagContext.Clone(); $unowned.Remove('aws:ResourceTag/Project')
    $tagPrefix="stack-tags-$($tagStage.Name)"; $tagPolicy=$tagStage.Policy
    $cases += @(
      @("$tagPrefix-allow",$tagPolicy,'cloudformation:TagResource',$stackSimulationArn,'allowed',$tagContext),
      @("$tagPrefix-untag-permission-only",$tagPolicy,'cloudformation:UntagResource',$stackSimulationArn,'allowed',$tagContext),
      @("$tagPrefix-no-direct-call",$tagPolicy,'cloudformation:TagResource',$stackSimulationArn,'implicitDeny',$noAction),
      @("$tagPrefix-other-operation",$tagPolicy,'cloudformation:TagResource',$stackSimulationArn,'implicitDeny',$wrongAction),
      @("$tagPrefix-other-stack",$tagPolicy,'cloudformation:TagResource',$stackOtherArn,'implicitDeny',$tagContext),
      @("$tagPrefix-wrong-project",$tagPolicy,'cloudformation:TagResource',$stackSimulationArn,'implicitDeny',$wrongProject),
      @("$tagPrefix-extra-key",$tagPolicy,'cloudformation:TagResource',$stackSimulationArn,'implicitDeny',$extraKeys),
      @("$tagPrefix-missing-keys",$tagPolicy,'cloudformation:TagResource',$stackSimulationArn,'implicitDeny',$noKeys),
      @("$tagPrefix-no-change-set-resource",$tagPolicy,'cloudformation:TagResource',"arn:aws:cloudformation:${region}:${account}:changeSet/lcm-reviewed-simulation/review-only-id",'implicitDeny',$tagContext),
      @("$tagPrefix-foreign-resource",$tagPolicy,'cloudformation:TagResource',$stackSimulationArn.Replace($account,'999999999999'),'implicitDeny',$tagContext),
      @("$tagPrefix-untag-unowned",$tagPolicy,'cloudformation:UntagResource',$stackSimulationArn,'implicitDeny',$unowned),
      @("$tagPrefix-no-execute",$tagPolicy,'cloudformation:ExecuteChangeSet',$stackSimulationArn,'implicitDeny',$tagContext)
    )
  }
  foreach ($case in $cases) {
    $context = @($case[5].GetEnumerator() | ForEach-Object {
      @{ContextKeyName=$_.Key; ContextKeyValues=@($_.Value | ForEach-Object { [string]$_ }); ContextKeyType=$(if ($_.Key -eq 'aws:TagKeys') {'stringList'} elseif ($_.Key -eq 'aws:CurrentTime') {'date'} elseif ($_.Key -eq 'aws:SecureTransport') {'boolean'} else {'string'})}
    })
    $expectedPolicies = @($simulationPolicies[$case[1]])
    if ($expectedPolicies.Count -lt 1) { throw "Missing simulation policy group: $($case[1])" }
    $request = @{PolicyInputList=$expectedPolicies; ActionNames=@($case[2]); ResourceArns=@($case[3])}
    if ($context.Count -gt 0) { $request.ContextEntries=$context }
    $json = ConvertTo-Json -InputObject $request -Depth 45 -Compress
    $roundtrip = $json | ConvertFrom-Json
    foreach ($entry in $roundtrip.ContextEntries) {
      if ($entry.ContextKeyName -eq 'aws:TagKeys') {
        $expectedKeys = @($case[5]['aws:TagKeys'])
        if ($entry.ContextKeyType -cne 'stringList' -or $entry.ContextKeyValues.Count -ne $expectedKeys.Count -or
          (@($entry.ContextKeyValues) -join ',') -cne ($expectedKeys -join ',')) { throw 'Invalid multi-value tag context serialization' }
      }
    }
    if ($roundtrip.PolicyInputList.Count -ne $expectedPolicies.Count) { throw 'Invalid serialized policy count' }
    foreach ($policyText in $roundtrip.PolicyInputList) {
      if (-not ($policyText | ConvertFrom-Json).Statement) { throw 'Invalid serialized policy document' }
    }
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
