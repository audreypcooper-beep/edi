'use strict';

const {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3Client } = require('../config/aws');

const BUCKET = () => process.env.S3_BUCKET;

/**
 * Upload a file (Buffer, string, or ReadableStream) to S3.
 *
 * @param {string} key          S3 object key (path within the bucket).
 * @param {Buffer|string|Uint8Array} body
 * @param {string} contentType  MIME type, e.g. 'application/json' or 'text/csv'.
 * @param {object} [metadata]   Optional key-value metadata attached to the object.
 * @returns {Promise<void>}
 */
async function uploadFile(key, body, contentType, metadata = {}) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
      // Server-side encryption using AWS-managed keys.
      ServerSideEncryption: 'AES256',
    }),
  );
}

/**
 * Generate a pre-signed URL that allows temporary, unauthenticated GET access
 * to a private S3 object.
 *
 * @param {string} key
 * @param {number} [expiresIn=3600]  Seconds until the URL expires.
 * @returns {Promise<string>}  The pre-signed URL.
 */
async function getSignedDownloadUrl(key, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: BUCKET(),
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Delete an object from S3.
 *
 * @param {string} key
 * @returns {Promise<void>}
 */
async function deleteFile(key) {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET(),
      Key: key,
    }),
  );
}

/**
 * List objects under a given key prefix.
 *
 * @param {string} prefix        e.g. 'reports/user-123/'
 * @param {number} [maxKeys=100]
 * @returns {Promise<Array<{ key: string, size: number, lastModified: Date }>>}
 */
async function listFiles(prefix, maxKeys = 100) {
  const result = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: BUCKET(),
      Prefix: prefix,
      MaxKeys: maxKeys,
    }),
  );

  return (result.Contents || []).map((obj) => ({
    key: obj.Key,
    size: obj.Size,
    lastModified: obj.LastModified,
  }));
}

module.exports = {
  uploadFile,
  getSignedDownloadUrl,
  deleteFile,
  listFiles,
};
