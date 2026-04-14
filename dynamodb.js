'use strict';

const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { dynamodbClient } = require('../config/aws');

// DynamoDB Document Client marshals/unmarshals JS objects automatically.
const docClient = DynamoDBDocumentClient.from(dynamodbClient, {
  marshallOptions: {
    // Convert empty strings to null (DynamoDB does not allow empty strings as
    // attribute values in some contexts).
    convertEmptyValues: false,
    removeUndefinedValues: true,
  },
});

/**
 * Put (create or overwrite) an item.
 * Automatically injects createdAt and updatedAt ISO timestamps.
 *
 * @param {string} tableName
 * @param {object} item  Must include the table's primary key attribute(s).
 * @returns {Promise<object>}  The item that was stored.
 */
async function putItem(tableName, item) {
  const now = new Date().toISOString();
  const enrichedItem = {
    ...item,
    createdAt: item.createdAt || now,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: enrichedItem,
    }),
  );

  return enrichedItem;
}

/**
 * Get a single item by its primary key.
 *
 * @param {string} tableName
 * @param {object} key  e.g. { userId: '123' } or { pk: '123', sk: 'PROFILE' }
 * @returns {Promise<object|null>}
 */
async function getItem(tableName, key) {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: key,
    }),
  );

  return result.Item || null;
}

/**
 * Update specific attributes of an existing item.
 * Builds a SET UpdateExpression dynamically from the `updates` object.
 * Always updates the `updatedAt` timestamp.
 *
 * @param {string} tableName
 * @param {object} key
 * @param {object} updates  Key-value pairs to set.
 * @returns {Promise<object>}  The updated item attributes.
 */
async function updateItem(tableName, key, updates) {
  const now = new Date().toISOString();
  const fields = { ...updates, updatedAt: now };

  // Build expression: "SET #attr0 = :val0, #attr1 = :val1, ..."
  // We use expression attribute names (#attrN) to avoid conflicts with
  // DynamoDB reserved words.
  const setExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  Object.entries(fields).forEach(([key, value], i) => {
    const namePlaceholder = `#attr${i}`;
    const valuePlaceholder = `:val${i}`;
    setExpressions.push(`${namePlaceholder} = ${valuePlaceholder}`);
    expressionAttributeNames[namePlaceholder] = key;
    expressionAttributeValues[valuePlaceholder] = value;
  });

  const result = await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: `SET ${setExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    }),
  );

  return result.Attributes;
}

/**
 * Delete an item by its primary key.
 *
 * @param {string} tableName
 * @param {object} key
 */
async function deleteItem(tableName, key) {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName,
      Key: key,
    }),
  );
}

/**
 * Query items using a key condition (and optional filter expression).
 * Supports GSI queries via `indexName`.
 *
 * @param {string} tableName
 * @param {string} keyConditionExpression  e.g. 'userId = :uid'
 * @param {object} options
 * @param {object} options.expressionAttributeNames
 * @param {object} options.expressionAttributeValues  Must supply values for keyConditionExpression.
 * @param {string} [options.indexName]
 * @param {string} [options.filterExpression]
 * @param {number} [options.limit]
 * @param {object} [options.lastKey]  ExclusiveStartKey for pagination.
 * @param {boolean} [options.scanIndexForward=true]  Sort order.
 * @returns {Promise<{ items: object[], lastKey: object|null }>}
 */
async function queryItems(tableName, keyConditionExpression, options = {}) {
  const {
    expressionAttributeNames,
    expressionAttributeValues,
    indexName,
    filterExpression,
    limit,
    lastKey,
    scanIndexForward = true,
  } = options;

  const params = {
    TableName: tableName,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeValues: expressionAttributeValues,
    ScanIndexForward: scanIndexForward,
  };

  if (expressionAttributeNames) params.ExpressionAttributeNames = expressionAttributeNames;
  if (indexName) params.IndexName = indexName;
  if (filterExpression) params.FilterExpression = filterExpression;
  if (limit) params.Limit = limit;
  if (lastKey) params.ExclusiveStartKey = lastKey;

  const result = await docClient.send(new QueryCommand(params));

  return {
    items: result.Items || [],
    lastKey: result.LastEvaluatedKey || null,
    count: result.Count || 0,
  };
}

/**
 * Scan a table (full scan — use sparingly on large tables).
 *
 * @param {string} tableName
 * @param {object} options
 * @param {string} [options.filterExpression]
 * @param {object} [options.expressionAttributeNames]
 * @param {object} [options.expressionAttributeValues]
 * @param {number} [options.limit]
 * @returns {Promise<{ items: object[] }>}
 */
async function scanItems(tableName, options = {}) {
  const { filterExpression, expressionAttributeNames, expressionAttributeValues, limit } = options;

  const params = { TableName: tableName };
  if (filterExpression) params.FilterExpression = filterExpression;
  if (expressionAttributeNames) params.ExpressionAttributeNames = expressionAttributeNames;
  if (expressionAttributeValues) params.ExpressionAttributeValues = expressionAttributeValues;
  if (limit) params.Limit = limit;

  const result = await docClient.send(new ScanCommand(params));

  return {
    items: result.Items || [],
    count: result.Count || 0,
  };
}

module.exports = {
  putItem,
  getItem,
  updateItem,
  deleteItem,
  queryItems,
  scanItems,
};
