import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';

test('secure URL tokens are sufficiently long and URL-safe', () => {
  const token = randomBytes(24).toString('base64url');
  assert.ok(token.length >= 32);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
});

test('token hashes are deterministic and differ for different tokens', () => {
  const hash = (s) => createHash('sha256').update(s).digest('hex');
  assert.equal(hash('token-a'), hash('token-a'));
  assert.notEqual(hash('token-a'), hash('token-b'));
});

test('USD cents rounding avoids floating point price noise', () => {
  const money = (n) => Math.round(Number(n) * 100) / 100;
  assert.equal(money(0.1 + 0.2), 0.3);
  assert.equal(money(3.99), 3.99);
});
