# ClearPath EDI Portal — Infrastructure Deployment Guide

This directory contains the AWS CloudFormation template that provisions all
infrastructure required by the ClearPath EDI Portal.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| AWS CLI | 2.x | `brew install awscli` or official installer |
| Node.js | 18+ | Required for backend and deployment scripts |
| Docker | 24+ | Required to build and push the backend image |
| aws-vault (optional) | 6+ | Recommended for credential management |

Configure your AWS credentials before proceeding:

```bash
aws configure
# or
aws configure --profile clearpath
```

Verify access:

```bash
aws sts get-caller-identity
```

---

## 1. Deploy CloudFormation Stack

From this directory run:

```bash
aws cloudformation deploy \
  --template-file cloudformation.yml \
  --stack-name clearpath-edi \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    Environment=production \
    FrontendDomain=https://app.clearpath-edi.com \
    SESFromDomain=clearpath-edi.com \
    SESFromEmail=no-reply@clearpath-edi.com \
  --region us-east-1
```

To deploy to staging:

```bash
aws cloudformation deploy \
  --template-file cloudformation.yml \
  --stack-name clearpath-edi-staging \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides Environment=staging \
  --region us-east-1
```

Monitor the deployment:

```bash
aws cloudformation describe-stack-events \
  --stack-name clearpath-edi \
  --query 'StackEvents[*].[Timestamp,ResourceStatus,LogicalResourceId,ResourceStatusReason]' \
  --output table
```

---

## 2. Copy Stack Outputs to `.env`

Fetch all outputs and write them to the backend `.env` file:

```bash
aws cloudformation describe-stacks \
  --stack-name clearpath-edi \
  --query 'Stacks[0].Outputs' \
  --output json | \
jq -r '.[] | "\(.OutputKey)=\(.OutputValue)"' > ../backend/.env
```

You will still need to add the following secrets manually:

```dotenv
# AWS region
AWS_REGION=us-east-1

# Cognito (from stack outputs — already present after the jq step)
COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# SES
SES_FROM_EMAIL=no-reply@clearpath-edi.com

# Application
NODE_ENV=production
PORT=8080
JWT_SECRET=<generate with: openssl rand -hex 64>

# Clearinghouse / EDI partner credentials (kept out of CloudFormation)
EDI_CLEARINGHOUSE_URL=https://edi.example-clearinghouse.com/submit
EDI_CLEARINGHOUSE_API_KEY=<secret>
```

---

## 3. SES — Move from Sandbox to Production

By default every new AWS account starts in the SES sandbox, which restricts
sending to verified addresses only.

### 3a. Verify the sender domain

```bash
# Check verification status
aws ses get-identity-verification-attributes \
  --identities clearpath-edi.com

# Resend verification email if needed
aws ses verify-domain-identity --domain clearpath-edi.com
```

Add the TXT record returned by the command to your DNS provider.

### 3b. Request production access

1. Open the AWS Console → Simple Email Service → Account dashboard.
2. Click **Request production access**.
3. Fill in the use-case form:
   - **Mail type**: Transactional
   - **Website URL**: https://app.clearpath-edi.com
   - **Use case**: Healthcare EDI portal sending verification codes and
     transaction notifications to registered providers.
4. AWS typically responds within 24 hours.

### 3c. (Optional) Configure DKIM and DMARC

```bash
aws ses put-email-identity-dkim-attributes \
  --email-identity clearpath-edi.com \
  --dkim-signing-attributes NextSigningKeyLength=RSA_2048_BIT
```

Add the three CNAME records returned to your DNS zone.

---

## 4. Cognito Domain Setup

A Cognito hosted-UI domain is created automatically by CloudFormation
(`clearpath-edi-{AccountId}.auth.{Region}.amazoncognito.com`).

To use a custom domain (e.g. `auth.clearpath-edi.com`):

1. Issue or import an ACM certificate in **us-east-1** for
   `auth.clearpath-edi.com`.
2. Add a `AWS::Cognito::UserPoolDomain` resource pointing to the custom
   domain and the certificate ARN, or run:

```bash
aws cognito-idp create-user-pool-domain \
  --domain auth.clearpath-edi.com \
  --user-pool-id <UserPoolId> \
  --custom-domain-config CertificateArn=arn:aws:acm:us-east-1:123456789012:certificate/xxxxxxxx
```

3. Create a CNAME in your DNS pointing `auth.clearpath-edi.com` to the
   CloudFront alias returned by the command above.

---

## 5. Deploy the Backend

### Option A — Elastic Beanstalk (simplest)

```bash
# Install the EB CLI
pip install awsebcli

cd ..
# Initialise (first time only)
eb init clearpath-edi --platform "Docker running on 64bit Amazon Linux 2023" --region us-east-1

# Create the environment (first deploy)
eb create clearpath-production \
  --instance-type t3.small \
  --iam-instance-profile ClearPathBackendInstanceProfile \
  --envvars $(cat backend/.env | tr '\n' ',' | sed 's/,$//') \
  --region us-east-1

# Subsequent deploys
eb deploy clearpath-production
```

### Option B — ECS Fargate

```bash
# Authenticate to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS \
  --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

# Build and push
docker build -t clearpath-edi .
docker tag clearpath-edi:latest \
  123456789012.dkr.ecr.us-east-1.amazonaws.com/clearpath-edi:latest
docker push \
  123456789012.dkr.ecr.us-east-1.amazonaws.com/clearpath-edi:latest

# Update the ECS service (assumes task definition is already registered)
aws ecs update-service \
  --cluster clearpath-cluster \
  --service clearpath-backend \
  --force-new-deployment
```

---

## 6. Deploy the Frontend

```bash
# Build (if using a build step; for pure static sites skip this)
# npm --prefix ../frontend run build

# Sync to S3
aws s3 sync ../frontend/ s3://clearpath-frontend-$(aws sts get-caller-identity --query Account --output text)/ \
  --delete \
  --cache-control "no-cache" \
  --exclude "assets/*"

# Re-sync assets with long-lived cache headers
aws s3 sync ../frontend/assets/ \
  s3://clearpath-frontend-$(aws sts get-caller-identity --query Account --output text)/assets/ \
  --cache-control "public, max-age=31536000, immutable"

# Invalidate CloudFront cache
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name clearpath-edi \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" \
  --output text)

aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*"
```

---

## Tearing Down

> **Warning**: The DynamoDB tables and EDI reports S3 bucket have
> `DeletionPolicy: Retain`. They will NOT be deleted when you delete the stack.
> Delete them manually only after confirming no production data remains.

```bash
aws cloudformation delete-stack --stack-name clearpath-edi

# Wait for completion
aws cloudformation wait stack-delete-complete --stack-name clearpath-edi

# Then manually empty and delete retained resources if needed
aws s3 rm s3://clearpath-edi-reports-<AccountId> --recursive
aws s3 rb s3://clearpath-edi-reports-<AccountId>

aws dynamodb delete-table --table-name clearpath-users
aws dynamodb delete-table --table-name clearpath-edi-transactions
aws dynamodb delete-table --table-name clearpath-payments
aws dynamodb delete-table --table-name clearpath-bank-accounts
aws dynamodb delete-table --table-name clearpath-reports
```
