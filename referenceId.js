'use strict';

/**
 * Generates a unique reference ID in the format CPE-YYYYMMDD-XXXXXX
 * where XXXXXX is a random 6-character uppercase alphanumeric string.
 *
 * Example: CPE-20260407-K3M9PQ
 *
 * @returns {string}
 */
function generateReferenceId(suffix) {
  const now = new Date();

  // Build YYYYMMDD date segment.
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const datePart = `${year}${month}${day}`;

  // Generate 6 random uppercase alphanumeric characters.
  const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomPart = '';
  for (let i = 0; i < 6; i++) {
    randomPart += CHARSET.charAt(Math.floor(Math.random() * CHARSET.length));
  }

  return suffix ? `CPE-${datePart}-${suffix}-${randomPart}` : `CPE-${datePart}-${randomPart}`;
}

module.exports = { generateReferenceId };
