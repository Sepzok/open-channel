export type Locale = 'zh' | 'en';

export type UiMessages = {
  htmlLang: string;
  consoleTitle: string;
  filterPlaceholder: string;
  filterAria: string;
  loading: string;
  selectChannel: string;
  noChannels: string;
  sourceUnavailable: string;
  readFailed: string;
  meta: string;
  body: string;
  entries: string;
  writeEntry: string;
  send: string;
  links: string;
  noLinks: string;
  parents: string;
  children: string;
  others: string;
  associate: string;
  noAssociate: string;
  revisions: string;
  restore: string;
  shares: string;
  createShare: string;
  sharePlaceholder: string;
  shareSend: string;
  langZh: string;
  langEn: string;
  typeLabels: Record<string, string>;
};

const ZH: UiMessages = {
  htmlLang: 'zh-CN',
  consoleTitle: '融合台',
  filterPlaceholder: '筛选频道',
  filterAria: '筛选频道',
  loading: '加载中…',
  selectChannel: '选择左侧频道',
  noChannels: '暂无频道',
  sourceUnavailable: '来源不可用',
  readFailed: '读取失败',
  meta: '资料',
  body: '正文',
  entries: '讨论',
  writeEntry: '写下讨论',
  send: '发送',
  links: '链接',
  noLinks: '暂无链接',
  parents: '上级',
  children: '下级',
  others: '其它',
  associate: '关联',
  noAssociate: '没有可关联的频道',
  revisions: '修订',
  restore: '恢复',
  shares: '分享',
  createShare: '创建分享',
  sharePlaceholder: '写下补充',
  shareSend: '发送',
  langZh: '中文',
  langEn: 'English',
  typeLabels: {
    dm: '私聊',
    group: '群组',
    room: '聊天室',
    project: '项目',
    task: '任务',
    note: '笔记',
  },
};

const EN: UiMessages = {
  htmlLang: 'en',
  consoleTitle: 'Fusion Console',
  filterPlaceholder: 'Filter channels',
  filterAria: 'Filter channels',
  loading: 'Loading…',
  selectChannel: 'Select a channel',
  noChannels: 'No channels',
  sourceUnavailable: 'Source unavailable',
  readFailed: 'Failed to load',
  meta: 'Metadata',
  body: 'Body',
  entries: 'Discussion',
  writeEntry: 'Write a reply',
  send: 'Send',
  links: 'Links',
  noLinks: 'No links',
  parents: 'Parents',
  children: 'Children',
  others: 'Other',
  associate: 'Link',
  noAssociate: 'No channels to link',
  revisions: 'Revisions',
  restore: 'Restore',
  shares: 'Shares',
  createShare: 'Create share',
  sharePlaceholder: 'Add a comment',
  shareSend: 'Send',
  langZh: '中文',
  langEn: 'English',
  typeLabels: {
    dm: 'DM',
    group: 'Group',
    room: 'Room',
    project: 'Project',
    task: 'Task',
    note: 'Note',
  },
};

export const UI_MESSAGES: Record<Locale, UiMessages> = { zh: ZH, en: EN };

export function parseLangParam(raw: string | null | undefined): Locale | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === 'zh' || v === 'zh-cn' || v === 'zh-hans') return 'zh';
  if (v === 'en' || v.startsWith('en-')) return 'en';
  return null;
}

export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const parts = header.split(',').map((p) => {
    const [tag, ...params] = p.trim().split(';');
    let q = 1;
    for (const param of params) {
      const m = /q\s*=\s*([0-9.]+)/i.exec(param);
      if (m) q = Number(m[1]);
    }
    return { tag: (tag ?? '').trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 };
  });
  parts.sort((a, b) => b.q - a.q);
  for (const { tag } of parts) {
    const hit = parseLangParam(tag);
    if (hit) return hit;
  }
  return null;
}

/** Priority: queryLang → stored → Accept-Language → zh */
export function resolveLocale(opts: {
  queryLang?: string | null;
  acceptLanguage?: string | null;
  stored?: string | null;
}): Locale {
  return (
    parseLangParam(opts.queryLang) ??
    parseLangParam(opts.stored) ??
    localeFromAcceptLanguage(opts.acceptLanguage) ??
    'zh'
  );
}

export function messagesFor(locale: Locale): UiMessages {
  return UI_MESSAGES[locale];
}
