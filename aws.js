'use strict';

const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { S3Client } = require('@aws-sdk/client-s3');
const { SESClient } = require('@aws-sdk/client-ses');
const { SQSClient } = require('@aws-sdk/client-sqs');

const region = process.env.AWS_REGION || 'us-east-1';

// Shared credential config pulled from environment.
// In production on EC2/ECS/Lambda the SDK will automatically use the
// instance/task/execution role — no key/secret needed in env.
const baseConfig = {
  region,
  ...(process.env.AWS_ACCESS_KEY_ID && {
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  }),
};

const cognitoClient = new CognitoIdentityProviderClient(baseConfig);
const dynamodbClient = new DynamoDBClient(baseConfig);
const s3Client = new S3Client(baseConfig);
const sesClient = new SESClient(baseConfig);
const sqsClient = new SQSClient(baseConfig);

module.exports = {
  cognitoClient,
  dynamodbClient,
  s3Client,
  sesClient,
  sqsClient,
  region,
};
