import { DescribeTableCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DescribeUserPoolCommand, type CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import type { BootstrapResourceReader } from '../application/bootstrap-resource-check.js';

export class CognitoBootstrapResourceReader implements BootstrapResourceReader {
  constructor(private readonly dynamo: DynamoDBClient, private readonly cognito: CognitoIdentityProviderClient) {}
  async table(name: string) {
    const result = await this.dynamo.send(new DescribeTableCommand({ TableName: name }));
    return { arn: result.Table?.TableArn, status: result.Table?.TableStatus,
      keySchema: result.Table?.KeySchema?.map(key => ({ name: key.AttributeName ?? '', type: key.KeyType ?? '' })),
      attributes: result.Table?.AttributeDefinitions?.map(attribute => ({ name: attribute.AttributeName ?? '', type: attribute.AttributeType ?? '' })) };
  }
  async pool(id: string) {
    const result = await this.cognito.send(new DescribeUserPoolCommand({ UserPoolId: id }));
    return { arn: result.UserPool?.Arn, id: result.UserPool?.Id };
  }
}
