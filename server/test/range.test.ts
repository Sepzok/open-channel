import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseByteRange } from '../src/util.js';

describe('parseByteRange', () => {
  it('missing header is all', () => {
    assert.equal(parseByteRange(undefined, 10).kind, 'all');
  });

  it('closed interval', () => {
    assert.deepEqual(parseByteRange('bytes=0-3', 10), { kind: 'partial', start: 0, end: 3 });
  });

  it('open end', () => {
    assert.deepEqual(parseByteRange('bytes=8-', 10), { kind: 'partial', start: 8, end: 9 });
  });

  it('past end is unsatisfiable', () => {
    assert.equal(parseByteRange('bytes=999-', 10).kind, 'unsatisfiable');
  });

  it('multipart is invalid', () => {
    assert.equal(parseByteRange('bytes=0-1,2-3', 10).kind, 'invalid');
  });
});
