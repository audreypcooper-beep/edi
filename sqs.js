'use strict';

const {
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require('@aws-sdk/client-sqs');
const { sqsClient } = require('../config/aws');

/**
 * Send a JSON-serialisable payload to an SQS queue.
 *
 * Supports FIFO queues via optional `messageGroupId` and `deduplicationId`.
 * For standard queues, omit those two options.
 *
 * @param {string} queueUrl
 * @param {object} payload              Will be JSON.stringify'd.
 * @param {object} [options]
 * @param {string} [options.messageGroupId]       Required for FIFO queues.
 * @param {string} [options.deduplicationId]      Required for FIFO queues without ContentBasedDeduplication.
 * @param {number} [options.delaySeconds=0]       Delivery delay (standard queues only, 0-900s).
 * @returns {Promise<{ messageId: string }>}
 */
async function sendMessage(queueUrl, payload, options = {}) {
  const { messageGroupId, deduplicationId, delaySeconds } = options;

  const params = {
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(payload),
  };

  if (messageGroupId) params.MessageGroupId = messageGroupId;
  if (deduplicationId) params.MessageDeduplicationId = deduplicationId;
  // DelaySeconds is not valid on FIFO queues; only attach when needed.
  if (delaySeconds !== undefined && !messageGroupId) params.DelaySeconds = delaySeconds;

  const result = await sqsClient.send(new SendMessageCommand(params));

  return { messageId: result.MessageId };
}

/**
 * Receive up to `maxMessages` messages from a queue.
 * Messages are long-polled for up to 20 seconds.
 *
 * NOTE: Received messages are NOT automatically deleted. Call `deleteMessage`
 * after successful processing.
 *
 * @param {string} queueUrl
 * @param {number} [maxMessages=10]  1–10.
 * @returns {Promise<Array<{ messageId, receiptHandle, body, attributes }>>}
 */
async function receiveMessages(queueUrl, maxMessages = 10) {
  const result = await sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: Math.min(Math.max(maxMessages, 1), 10),
      WaitTimeSeconds: 20, // Long polling — reduces empty responses and cost.
      AttributeNames: ['All'],
      MessageAttributeNames: ['All'],
    }),
  );

  return (result.Messages || []).map((msg) => {
    let body;
    try {
      body = JSON.parse(msg.Body);
    } catch {
      // Return raw string if not valid JSON.
      body = msg.Body;
    }

    return {
      messageId: msg.MessageId,
      receiptHandle: msg.ReceiptHandle,
      body,
      attributes: msg.Attributes || {},
    };
  });
}

/**
 * Delete a message from the queue after successful processing.
 * Must be called within the visibility timeout window.
 *
 * @param {string} queueUrl
 * @param {string} receiptHandle  Returned by `receiveMessages`.
 * @returns {Promise<void>}
 */
async function deleteMessage(queueUrl, receiptHandle) {
  await sqsClient.send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    }),
  );
}

module.exports = {
  sendMessage,
  receiveMessages,
  deleteMessage,
};
