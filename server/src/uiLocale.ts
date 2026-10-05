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
  enterAs: string;
  signedIn: string;
  conversations: string;
  composeMessage: string;
  projects: string;
  tasks: string;
  status: string;
  notesNav: string;
  annotations: string;
  ticketId: string;
  walkHint: string;
  walkStart: string;
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
  enterAs: '进入',
  signedIn: '当前身份',
  conversations: '会话',
  composeMessage: '写下消息',
  projects: '项目',
  tasks: '任务',
  status: '状态',
  notesNav: '笔记',
  annotations: '批注',
  ticketId: '工单号',
  walkHint: '方向键移动林可，W A S D 移动周宁',
  walkStart: '开始走动',
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
  enterAs: 'Enter',
  signedIn: 'Signed in as',
  conversations: 'Conversations',
  composeMessage: 'Write a message',
  projects: 'Projects',
  tasks: 'Tasks',
  status: 'Status',
  notesNav: 'Notes',
  annotations: 'Annotations',
  ticketId: 'Ticket',
  walkHint: 'Arrow keys move Lin Ke; W A S D move Zhou Ning',
  walkStart: 'Start walking',
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

/** Seed channel titles stay Chinese on disk; UI shows these when locale is en. */
export const SEED_CHANNEL_TITLES: Record<string, { zh: string; en: string }> = {
  ch_dm_lin_zhou: { zh: '林可、周宁', en: 'Lin Ke, Zhou Ning' },
  ch_grp_release: { zh: '发布小组', en: 'Release team' },
  ch_room_design: { zh: '设计讨论', en: 'Design discussion' },
  ch_proj: { zh: '官网改版', en: 'Site redesign' },
  ch_task_copy: { zh: '首页文案', en: 'Home page copy' },
  ch_task_img: { zh: '配图导出', en: 'Export art' },
  ch_draft: { zh: '接口草案', en: 'API draft' },
  ch_glossary: { zh: '术语表', en: 'Glossary' },
  ch_walk: { zh: '走动房间', en: 'Walk room' },
  ch_accept: { zh: '验收清单', en: 'Acceptance list' },
};

/** Exact Chinese seed strings → English for UI display. Disk and API stay Chinese. */
export const SEED_TEXT_EN: Record<string, string> = {
  '示例会话': 'Sample chat',
  '示例任务': 'Sample tasks',
  '示例笔记': 'Sample notes',
  '工单适配': 'Ticket adapter',
  '对局房间': 'Match room',
  '融合台': 'Fusion Console',
  '林可': 'Lin Ke',
  '周宁': 'Zhou Ning',
  '许安': 'Xu An',
  '访客': 'Guest',
  '临时访问': 'Temporary access',
  '撰写中': 'In progress',
  '术语.txt': 'terms.txt',
  '所属项目': 'Parent project',
  '配图未导出前，首页文案先不定稿': 'Hold home copy until art is exported',
  '下午的稿子我放在笔记里了': 'I put this afternoon’s draft in notes',
  '我看完就在任务里标进度': 'I’ll mark progress on the task after I read it',
  '今天把配图导出': 'Export the art today',
  '文案以笔记里的口径为准': 'Copy follows the wording in notes',
  '对外官网的信息架构和首页。': 'Information architecture and home page for the public site.',
  '按笔记里的口径写首页主标题和副标题。': 'Write the home headline and subhead using the wording in notes.',
  '导出首页用的三张图。': 'Export the three images for the home page.',
  '主标题先用笔记里的那句。': 'Use the line from notes for the headline for now.',
  '频道是可寻址的容器，讨论附在频道上。':
    'A channel is an addressable container; discussion hangs on the channel.',
  '链接把相关频道连起来，分享给出外部可打开的地址。':
    'Links connect related channels; shares give an address others can open.',
  '频道、讨论、链接是三条基本记录。': 'Channel, discussion, and link are the three basic records.',
  '这里的容器包括会话、任务和笔记。': 'Container here includes chat, tasks, and notes.',
  '频道\n讨论\n链接\n': 'channel\ndiscussion\nlink\n',
  '先对协议再写适配。': 'Match the protocol first, then write the adapter.',
  '对局已结束': 'Match ended',
  '验收清单': 'Acceptance list',
};

export function displaySeedText(text: string, locale: Locale): string {
  if (locale === 'zh' || !text) return text;
  return SEED_TEXT_EN[text] ?? text;
}

export function displayChannelTitle(
  channelId: string,
  fallbackTitle: string,
  locale: Locale,
): string {
  if (locale === 'zh') return fallbackTitle;
  const byId = SEED_CHANNEL_TITLES[channelId];
  if (byId) return byId.en;
  for (const row of Object.values(SEED_CHANNEL_TITLES)) {
    if (row.zh === fallbackTitle) return row.en;
  }
  return displaySeedText(fallbackTitle, locale);
}

/** Map UI filter text to Chinese title needles for provider `title co` (seeds stay Chinese). */
export function titleFilterNeedles(q: string, locale: Locale): string[] {
  const trimmed = q.trim();
  if (!trimmed) return [];
  if (locale !== 'en') return [trimmed];
  const lower = trimmed.toLowerCase();
  const hits = Object.values(SEED_CHANNEL_TITLES).filter(
    (row) => row.en.toLowerCase().includes(lower) || row.zh.includes(trimmed),
  );
  if (hits.length === 0) return [trimmed];
  return [...new Set(hits.map((row) => row.zh))];
}

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
