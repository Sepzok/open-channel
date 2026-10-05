import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  localeFromAcceptLanguage,
  parseLangParam,
  resolveLocale,
  messagesFor,
} from '../src/uiLocale.js';

describe('resolveLocale', () => {
  it('prefers queryLang over stored and Accept-Language', () => {
    assert.equal(
      resolveLocale({
        queryLang: 'en',
        stored: 'zh',
        acceptLanguage: 'zh-CN,zh;q=0.9',
      }),
      'en',
    );
  });

  it('uses stored when query is absent', () => {
    assert.equal(
      resolveLocale({
        queryLang: null,
        stored: 'en',
        acceptLanguage: 'zh-CN',
      }),
      'en',
    );
  });

  it('uses Accept-Language when query and stored are absent', () => {
    assert.equal(
      resolveLocale({
        acceptLanguage: 'en-US,en;q=0.9,zh;q=0.8',
      }),
      'en',
    );
    assert.equal(resolveLocale({ acceptLanguage: 'zh-CN,zh;q=0.9' }), 'zh');
  });

  it('defaults to zh', () => {
    assert.equal(resolveLocale({}), 'zh');
    assert.equal(resolveLocale({ queryLang: 'fr', acceptLanguage: 'de' }), 'zh');
  });

  it('parseLangParam accepts zh/en variants', () => {
    assert.equal(parseLangParam('zh-CN'), 'zh');
    assert.equal(parseLangParam('en-GB'), 'en');
    assert.equal(parseLangParam(''), null);
  });

  it('localeFromAcceptLanguage respects q', () => {
    assert.equal(localeFromAcceptLanguage('zh;q=0.5,en;q=0.9'), 'en');
    assert.equal(localeFromAcceptLanguage(null), null);
  });

  it('messagesFor returns Send / Create share in English', () => {
    assert.equal(messagesFor('en').send, 'Send');
    assert.equal(messagesFor('en').createShare, 'Create share');
    assert.equal(messagesFor('zh').send, '发送');
    assert.equal(messagesFor('zh').createShare, '创建分享');
  });
});
