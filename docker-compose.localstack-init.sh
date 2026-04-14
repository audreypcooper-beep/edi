#!/usr/bin/env bash
# =============================================================================
# docker-compose.localstack-init.sh
#
# Bootstraps LocalStack with all AWS resources required by the ClearPath EDI
# Portal for local development. Run this script AFTER `docker compose up -d`
# and AFTER LocalStack is healthy.
#
# Prerequisites:
#   - awslocal (pip install awscli-local)  OR
#     AWS CLI configured with --endpoint-url http://localhost:4566
#   - jq (brew install jq)
#
# Usage:
#   chmod +x docker-compose.localstack-init.sh
#   ./docker-compose.localstack-init.sh
#
# The script prints every created resource ARN / ID so you can paste the
# values into .env.local.
# =============================================================================

set -euo pipefail

ENDPOINT="http://localhost:4566"
REGION="us-east-1"
ACCOUNT_ID="000000000000"   # LocalStack default fake account ID

# Use awslocal if available, otherwise fall back to AWS CLI with endpoint-url
if command -v awslocal &>/dev/null; then
  AWS="awslocal"
else
  AWS="aws --endpoint-url=${ENDPOINT} --region=${REGION}"
fi

# Colour helpers
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RESET="\033[0m"

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
header()  { echo -e "\n${YELLOW}=== $* ===${RESET}"; }

# =============================================================================
# Wait for LocalStack to be ready
# =============================================================================
header "Waiting for LocalStack"
MAX_RETRIES=30
RETRY=0
until curl -sf "${ENDPOINT}/_localstack/health" | grep -q '"dynamodb": "running"'; do
  RETRY=$((RETRY + 1))
  if [ $RETRY -ge $MAX_RETRIES ]; then
    echo "LocalStack did not become ready in time. Exiting."
    exit 1
  fi
  info "LocalStack not ready yet (attempt ${RETRY}/${MAX_RETRIES}) — waiting 3s..."
  sleep 3
done
success "LocalStack is ready"

# =============================================================================
# DynamoDB Tables
# =============================================================================
header "DynamoDB Tables"

create_table_if_missing() {
  local TABLE_NAME="$1"
  local EXTRA_ARGS="${2:-}"

  if $AWS dynamodb describe-table --table-name "${TABLE_NAME}" &>/dev/null; then
    info "Table ${TABLE_NAME} already exists — skipping"
    return
  fi

  eval "$AWS dynamodb create-table \
    --table-name \"${TABLE_NAME}\" \
    --billing-mode PAY_PER_REQUEST \
    ${EXTRA_ARGS}" > /dev/null
  success "Created DynamoDB table: ${TABLE_NAME}"
}

# clearpath-users
create_table_if_missing "clearpath-users" \
  "--attribute-definitions AttributeName=userId,AttributeType=S \
   --key-schema AttributeName=userId,KeyType=HASH"

# clearpath-edi-transactions (with GSI on referenceId)
create_table_if_missing "clearpath-edi-transactions" \
  "--attribute-definitions \
     AttributeName=userId,AttributeType=S \
     AttributeName=transactionId,AttributeType=S \
     AttributeName=referenceId,AttributeType=S \
   --key-schema \
     AttributeName=userId,KeyType=HASH \
     AttributeName=transactionId,KeyType=RANGE \
   --global-secondary-indexes '[
     {
       \"IndexName\": \"referenceId-index\",
       \"KeySchema\": [{\"AttributeName\": \"referenceId\", \"KeyType\": \"HASH\"}],
       \"Projection\": {\"ProjectionType\": \"ALL\"}
     }
   ]'"

# clearpath-payments
create_table_if_missing "clearpath-payments" \
  "--attribute-definitions \
     AttributeName=userId,AttributeType=S \
     AttributeName=paymentId,AttributeType=S \
   --key-schema \
     AttributeName=userId,KeyType=HASH \
     AttributeName=paymentId,KeyType=RANGE"

# clearpath-bank-accounts
create_table_if_missing "clearpath-bank-accounts" \
  "--attribute-definitions \
     AttributeName=userId,AttributeType=S \
     AttributeName=accountId,AttributeType=S \
   --key-schema \
     AttributeName=userId,KeyType=HASH \
     AttributeName=accountId,KeyType=RANGE"

# clearpath-reports
create_table_if_missing "clearpath-reports" \
  "--attribute-definitions \
     AttributeName=userId,AttributeType=S \
     AttributeName=reportId,AttributeType=S \
   --key-schema \
     AttributeName=userId,KeyType=HASH \
     AttributeName=reportId,KeyType=RANGE"

# =============================================================================
# S3 Buckets
# =============================================================================
header "S3 Buckets"

create_bucket_if_missing() {
  local BUCKET="$1"
  if $AWS s3api head-bucket --bucket "${BUCKET}" &>/dev/null; then
    info "Bucket ${BUCKET} already exists — skipping"
    return
  fi
  $AWS s3api create-bucket --bucket "${BUCKET}" > /dev/null
  success "Created S3 bucket: ${BUCKET}"
}

EDI_BUCKET="clearpath-edi-reports-${ACCOUNT_ID}"
FRONTEND_BUCKET="clearpath-frontend-${ACCOUNT_ID}"

create_bucket_if_missing "${EDI_BUCKET}"
create_bucket_if_missing "${FRONTEND_BUCKET}"

# Enable versioning on the EDI reports bucket
$AWS s3api put-bucket-versioning \
  --bucket "${EDI_BUCKET}" \
  --versioning-configuration Status=Enabled > /dev/null
success "Enabled versioning on ${EDI_BUCKET}"

# =============================================================================
# SQS Queues
# =============================================================================
header "SQS Queues"

# DLQ first
DLQ_RESULT=$($AWS sqs create-queue \
  --queue-name clearpath-edi-processing-dlq \
  --attributes MessageRetentionPeriod=1209600 2>/dev/null || \
  $AWS sqs get-queue-url --queue-name clearpath-edi-processing-dlq)

DLQ_URL=$(echo "${DLQ_RESULT}" | grep -o '"QueueUrl": *"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "${DLQ_URL}" ]; then
  DLQ_URL=$($AWS sqs get-queue-url --queue-name clearpath-edi-processing-dlq --query QueueUrl --output text)
fi
success "DLQ URL: ${DLQ_URL}"

DLQ_ARN="arn:aws:sqs:${REGION}:${ACCOUNT_ID}:clearpath-edi-processing-dlq"

# Main processing queue with redrive policy
REDRIVE_POLICY="{\"deadLetterTargetArn\":\"${DLQ_ARN}\",\"maxReceiveCount\":\"3\"}"

$AWS sqs create-queue \
  --queue-name clearpath-edi-processing \
  --attributes \
    MessageRetentionPeriod=1209600 \
    VisibilityTimeout=300 \
    ReceiveMessageWaitTimeSeconds=20 \
    "RedrivePolicy=${REDRIVE_POLICY}" > /dev/null 2>&1 || true

QUEUE_URL=$($AWS sqs get-queue-url --queue-name clearpath-edi-processing --query QueueUrl --output text)
success "Processing queue URL: ${QUEUE_URL}"

# =============================================================================
# Cognito User Pool
# =============================================================================
header "Cognito User Pool"

# Check if a pool named ClearPathUserPool already exists
EXISTING_POOL_ID=$($AWS cognito-idp list-user-pools --max-results 20 \
  --query "UserPools[?Name=='ClearPathUserPool'].Id" --output text 2>/dev/null || echo "")

if [ -n "${EXISTING_POOL_ID}" ] && [ "${EXISTING_POOL_ID}" != "None" ]; then
  USER_POOL_ID="${EXISTING_POOL_ID}"
  info "User pool ClearPathUserPool already exists (${USER_POOL_ID}) — skipping creation"
else
  POOL_RESULT=$($AWS cognito-idp create-user-pool \
    --pool-name ClearPathUserPool \
    --policies 'PasswordPolicy={MinimumLength=8,RequireUppercase=true,RequireLowercase=true,RequireNumbers=true,RequireSymbols=true}' \
    --auto-verified-attributes email \
    --username-attributes email \
    --mfa-configuration OPTIONAL \
    --schema \
      '[
        {"Name":"email","AttributeDataType":"String","Mutable":true,"Required":true},
        {"Name":"orgName","AttributeDataType":"String","Mutable":true,"Required":false,"StringAttributeConstraints":{"MinLength":"1","MaxLength":"256"}},
        {"Name":"npi","AttributeDataType":"String","Mutable":true,"Required":false,"StringAttributeConstraints":{"MinLength":"10","MaxLength":"10"}},
        {"Name":"taxId","AttributeDataType":"String","Mutable":true,"Required":false,"StringAttributeConstraints":{"MinLength":"9","MaxLength":"10"}},
        {"Name":"accountType","AttributeDataType":"String","Mutable":true,"Required":false,"StringAttributeConstraints":{"MinLength":"1","MaxLength":"64"}}
      ]')
  USER_POOL_ID=$(echo "${POOL_RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin)['UserPool']['Id'])")
  success "Created Cognito User Pool: ${USER_POOL_ID}"
fi

# User Pool Client
EXISTING_CLIENT_ID=$($AWS cognito-idp list-user-pool-clients \
  --user-pool-id "${USER_POOL_ID}" \
  --query "UserPoolClients[?ClientName=='clearpath-web-client'].ClientId" \
  --output text 2>/dev/null || echo "")

if [ -n "${EXISTING_CLIENT_ID}" ] && [ "${EXISTING_CLIENT_ID}" != "None" ]; then
  CLIENT_ID="${EXISTING_CLIENT_ID}"
  info "User pool client clearpath-web-client already exists (${CLIENT_ID}) — skipping"
else
  CLIENT_RESULT=$($AWS cognito-idp create-user-pool-client \
    --user-pool-id "${USER_POOL_ID}" \
    --client-name clearpath-web-client \
    --no-generate-secret \
    --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_USER_SRP_AUTH)
  CLIENT_ID=$(echo "${CLIENT_RESULT}" | python3 -c "import sys,json; print(json.load(sys.stdin)['UserPoolClient']['ClientId'])")
  success "Created Cognito User Pool Client: ${CLIENT_ID}"
fi

# =============================================================================
# SES — verify sender identity
# =============================================================================
header "SES Email Identity"

$AWS ses verify-email-identity --email-address no-reply@clearpath-edi.com > /dev/null 2>&1 || true
success "Queued SES verification for: no-reply@clearpath-edi.com (auto-confirmed in LocalStack)"

# =============================================================================
# Summary — print .env.local values
# =============================================================================
header "Environment variable values for .env.local"

cat <<ENV

# -------------------------------------------------------
# Paste the following into your .env.local file:
# -------------------------------------------------------
AWS_REGION=${REGION}
AWS_ENDPOINT_URL=${ENDPOINT}
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

COGNITO_USER_POOL_ID=${USER_POOL_ID}
COGNITO_CLIENT_ID=${CLIENT_ID}

DYNAMODB_USERS_TABLE=clearpath-users
DYNAMODB_EDI_TRANSACTIONS_TABLE=clearpath-edi-transactions
DYNAMODB_PAYMENTS_TABLE=clearpath-payments
DYNAMODB_BANK_ACCOUNTS_TABLE=clearpath-bank-accounts
DYNAMODB_REPORTS_TABLE=clearpath-reports

S3_EDI_REPORTS_BUCKET=${EDI_BUCKET}
S3_FRONTEND_BUCKET=${FRONTEND_BUCKET}

SQS_EDI_PROCESSING_QUEUE_URL=${QUEUE_URL}
SQS_EDI_PROCESSING_DLQ_URL=${DLQ_URL}

SES_FROM_EMAIL=no-reply@clearpath-edi.com
# -------------------------------------------------------

ENV

success "LocalStack initialisation complete."
