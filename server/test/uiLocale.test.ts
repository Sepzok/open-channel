import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  localeFromAcceptLanguage,
  parseLangParam,
  resolveLocale,
  messagesFor,
  displayChannelTitle,
  titleFilterNeedles,
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

  it('displayChannelTitle maps seed ids for English', () => {
    assert.equal(displayChannelTitle('ch_grp_release', '发布小组', 'zh'), '发布小组');
    assert.equal(displayChannelTitle('ch_grp_release', '发布小组', 'en'), 'Release team');
    assert.equal(displayChannelTitle('ch_draft', '接口草案', 'en'), 'API draft');
    assert.equal(displayChannelTitle('', '首页文案', 'en'), 'Home page copy');
    assert.equal(displayChannelTitle('ch_custom', '自定义', 'en'), '自定义');
  });

  it('titleFilterNeedles maps English UI filter to Chinese seed titles', () => {
    assert.deepEqual(titleFilterNeedles('首页', 'zh'), ['首页']);
    assert.deepEqual(titleFilterNeedles('Home', 'en'), ['首页文案']);
    assert.deepEqual(titleFilterNeedles('API', 'en'), ['接口草案']);
    assert.deepEqual(titleFilterNeedles('unknown-x', 'en'), ['unknown-x']);
  });
});
