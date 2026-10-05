export type HubTarget = {
  id: string;
  /** Default loopback origin when env override is absent. */
  defaultUrl: string;
  envKey?: string;
  genreZh: string;
  genreEn: string;
  titleZh: string;
  titleEn: string;
  blurbZh: string;
  blurbEn: string;
};

export const HUB_TARGETS: HubTarget[] = [
  {
    id: 'console',
    defaultUrl: 'http://127.0.0.1:8780',
    envKey: 'OCP_CONSOLE_URL',
    genreZh: '操作台',
    genreEn: 'Ops console',
    titleZh: '融合台',
    titleEn: 'Fusion Console',
    blurbZh: '同时查看会话、任务、笔记三个来源',
    blurbEn: 'Read chat, tasks, and notes together',
  },
  {
    id: 'chat',
    defaultUrl: 'http://127.0.0.1:8781',
    envKey: 'OCP_CHAT_URL',
    genreZh: '即时通讯',
    genreEn: 'Messenger',
    titleZh: '示例会话',
    titleEn: 'Sample chat',
    blurbZh: '会话列表与气泡消息',
    blurbEn: 'Conversation list and message bubbles',
  },
  {
    id: 'tasks',
    defaultUrl: 'http://127.0.0.1:8782',
    envKey: 'OCP_TASKS_URL',
    genreZh: '项目台',
    genreEn: 'Project board',
    titleZh: '示例任务',
    titleEn: 'Sample tasks',
    blurbZh: '项目、任务与状态',
    blurbEn: 'Projects, tasks, and status',
  },
  {
    id: 'notes',
    defaultUrl: 'http://127.0.0.1:8783',
    envKey: 'OCP_NOTES_URL',
    genreZh: '文稿',
    genreEn: 'Document',
    titleZh: '示例笔记',
    titleEn: 'Sample notes',
    blurbZh: '正文、批注与修订',
    blurbEn: 'Body, annotations, and revisions',
  },
  {
    id: 'native',
    defaultUrl: 'http://127.0.0.1:8784',
    envKey: 'OCP_NATIVE_URL',
    genreZh: '工单',
    genreEn: 'Ticket',
    titleZh: '工单适配',
    titleEn: 'Ticket adapter',
    blurbZh: '不引用参考服务端的独立适配',
    blurbEn: 'Standalone adapter without the reference server',
  },
  {
    id: 'walk',
    defaultUrl: 'http://127.0.0.1:8785',
    envKey: 'OCP_WALK_URL',
    genreZh: '房间舞台',
    genreEn: 'Room stage',
    titleZh: '走动房间',
    titleEn: 'Walk room',
    blurbZh: '入场后在格子上走动',
    blurbEn: 'Join and walk on a grid',
  },
];

export function resolveHubTargets(env: NodeJS.ProcessEnv = process.env): {
  id: string;
  url: string;
  genreZh: string;
  genreEn: string;
  titleZh: string;
  titleEn: string;
  blurbZh: string;
  blurbEn: string;
}[] {
  return HUB_TARGETS.map((t) => ({
    id: t.id,
    url: (t.envKey && env[t.envKey]) || t.defaultUrl,
    genreZh: t.genreZh,
    genreEn: t.genreEn,
    titleZh: t.titleZh,
    titleEn: t.titleEn,
    blurbZh: t.blurbZh,
    blurbEn: t.blurbEn,
  }));
}

export async function probeTarget(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/`, {
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(1500),
    });
    return res.ok && (res.headers.get('content-type') ?? '').includes('text/html');
  } catch {
    return false;
  }
}
