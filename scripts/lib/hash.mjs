import crypto from 'node:crypto';
import fs from 'node:fs';

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath));
}
