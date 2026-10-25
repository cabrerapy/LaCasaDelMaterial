function Assert-UploadResponse($Response, [string]$ExpectedChecksum, [string]$ExpectedKeyArn) {
  if ($Response.ChecksumSHA256 -cne $ExpectedChecksum -or
    $Response.ServerSideEncryption -cne 'aws:kms' -or $Response.SSEKMSKeyId -cne $ExpectedKeyArn) {
    throw 'Upload response did not confirm expected integrity/encryption; inspect without retry'
  }
  $property = $Response.PSObject.Properties['BucketKeyEnabled']
  if (-not $property -or $null -eq $property.Value) { return 'NOT_REPORTED' }
  if ($property.Value -isnot [bool] -or $property.Value -ne $false) {
    throw 'Unexpected BucketKeyEnabled; inspect without retry'
  }
  return 'DISABLED_CONFIRMED'
}
