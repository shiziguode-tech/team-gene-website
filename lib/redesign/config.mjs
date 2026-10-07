// Content mirrors the live CMS records at team-gene.com (same field names:
// id, section, title, subtitle, tag, date, body, media, graduationYear,
// alumniMessage, researchBackground, researchResults, titleImages, modelImages),
// so the templates can be ported back onto the real data source unchanged.

export const site = {
  name: 'Team Gene',
  fullName: '计算机科学与人工智能科研团队',
  tagline: '思想相遇，智能生长。',
  // Media is served by the production CMS. Swap to '/api/media/' when ported.
  mediaBase: process.env.REDESIGN_MEDIA_BASE || '/api/media/',
  // Routes that only exist on the production app (forum, admin, webmail).
  appOrigin: '',
  webmail: 'https://mail.team-gene.com/',
};

export const nav = [
  { key: 'home', href: '/', label: '团队概览', en: 'Overview' },
  { key: 'members', href: '/members', label: '团队成员', en: 'Members' },
  { key: 'alumni', href: '/alumni', label: '校友介绍', en: 'Alumni' },
  { key: 'research', href: '/research', label: '学术成果', en: 'Research' },
  { key: 'awards', href: '/awards', label: '团队获奖', en: 'Awards' },
  { key: 'life', href: '/life', label: '团建活动', en: 'Life' },
  { key: 'rules', href: '/rules', label: '管理规则', en: 'Rules' },
  { key: 'news', href: '/news', label: '活动与通知', en: 'News' },
];

export const mailNav = { key: 'mail', href: '/mail', label: '邮箱与论坛', en: 'Mail & Forum' };

export const pages = {
  members: { en: 'Members', title: '团队成员', lede: '在不同的研究兴趣之间，找到共同探索的方向。' },
  alumni: { en: 'Alumni', title: '校友介绍', lede: '认识 Team Gene 的校友，按毕业年份浏览个人资料。' },
  research: { en: 'Research', title: '学术成果', lede: '从一个值得追问的问题，到一次可以复现的探索。' },
  awards: { en: 'Awards', title: '团队获奖', lede: '每一份认可，记录一段并肩投入的时光。' },
  life: { en: 'Life', title: '团建活动', lede: '科研之外，也有值得记录的日常。' },
  rules: { en: 'Rules', title: '管理规则', lede: '让协作有序，让探索自由。' },
  news: { en: 'News', title: '活动与通知', lede: '在这里，了解下一场交流和团队的最新安排。' },
  mail: { en: 'Mail & Forum', title: '邮箱与论坛', lede: '申领 @team-gene.com 邮箱并设置论坛昵称，邮箱开通后即可进入团队论坛。' },
};

export const focus = [
  { cn: '机器学习', en: 'Learning to understand', desc: '深度学习、表征学习与可信人工智能', glyph: 'ml' },
  { cn: '大语言模型', en: 'Language meets intelligence', desc: '知识增强、智能体与多模态推理', glyph: 'llm' },
  { cn: '计算机视觉', en: 'Seeing beyond pixels', desc: '视觉理解、图像生成与场景感知', glyph: 'cv' },
  { cn: '智能计算系统', en: 'Ideas into systems', desc: '高效计算、软件工程与智能应用', glyph: 'sys' },
];

