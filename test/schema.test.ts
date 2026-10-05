import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = path.join(import.meta.dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schema/ocp.v1.schema.json'), 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(schema);

const validateCh = ajv.getSchema('https://open-channel.local/schema/ocp.v1.schema.json#/$defs/channel')!;
const validateEntry = ajv.getSchema('https://open-channel.local/schema/ocp.v1.schema.json#/$defs/entry')!;
const validateLink = ajv.getSchema('https://open-channel.local/schema/ocp.v1.schema.json#/$defs/link')!;

function loadFixture(rel: string) {
  return JSON.parse(fs.readFileSync(path.join(root, 'schema/fixtures', rel), 'utf8'));
}

describe('schema fixtures', () => {
  it('valid channel', () => {
    assert.equal(validateCh(loadFixture('valid/channel.json')), true);
  });
  it('valid entry', () => {
    assert.equal(validateEntry(loadFixture('valid/entry.json')), true);
  });
  it('valid internal link', () => {
    assert.equal(validateLink(loadFixture('valid/link-internal.json')), true);
  });
  it('valid external link', () => {
    assert.equal(validateLink(loadFixture('valid/link-external.json')), true);
  });
  it('invalid channel without type', () => {
    assert.equal(validateCh(loadFixture('invalid/channel-no-type.json')), false);
  });
  it('invalid entry empty body', () => {
    assert.equal(validateEntry(loadFixture('invalid/entry-empty-body.json')), false);
  });
  it('invalid link both targets', () => {
    assert.equal(validateLink(loadFixture('invalid/link-both-targets.json')), false);
  });
  it('valid channel ext number', () => {
    const ch = loadFixture('valid/channel.json') as { ext: { duration_ms: unknown } };
    assert.equal(typeof ch.ext.duration_ms, 'number');
    assert.equal(validateCh(ch), true);
  });
  it('invalid nested ext object', () => {
    assert.equal(validateCh(loadFixture('invalid/channel-ext-nested.json')), false);
  });
  it('invalid ext key case', () => {
    assert.equal(validateCh(loadFixture('invalid/channel-ext-key.json')), false);
  });
});
