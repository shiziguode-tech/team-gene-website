import type { Metadata } from 'next';

export const SITE_URL = 'https://team-gene.com';
export const sectionSeo = {
  members: { title: '团队成员', description: '认识 Team Gene 的指导教师与学生成员，了解团队成员的研究方向和个人简介。' },
  alumni: { title: '校友介绍', description: '按毕业年份浏览 Team Gene 校友资料，了解校友发展近况与校友寄语。' },
  research: { title: '学术成果', description: '浏览 Team Gene 在计算机科学与人工智能领域的研究成果、期刊会议论文、模型结构与研究背景。' },
  awards: { title: '团队获奖', description: '了解 Team Gene 团队的学术荣誉、竞赛获奖与团队成果。' },
  life: { title: '团建活动', description: '记录 Team Gene 团队交流、运动与团建活动，了解科研之外的团队生活。' },
  rules: { title: '管理规则', description: '了解 Team Gene 的学术规范、团队协作、计算资源与成果管理规则。' },
  news: { title: '活动与通知', description: '查看 Team Gene 的学术交流、组会活动、团队通知与最新安排。' },
} as const;
export const BRAND_SHARE_IMAGE='/share/team-gene.png';
// Returned by generateMetadata for unknown paths so the 404 page gets its own
// title; only the page component throws notFound().
export const notFoundMetadata: Metadata = { title: '页面未找到' };
export function pageMetadata(title: string, description: string, path: string, image={url:BRAND_SHARE_IMAGE,alt:'Team Gene · Computer Science & AI Research'}, type: 'website' | 'article' | 'profile' = 'website'): Metadata {
  const images=[{url:SITE_URL+image.url,width:1200,height:630,alt:image.alt}];
  return { title, description, alternates: { canonical: path },
    openGraph: { title: `${title} | Team Gene`, description, url: path, siteName: 'Team Gene', locale: 'zh_CN', type, images },
    twitter: { card: 'summary_large_image', title: `${title} | Team Gene`, description,images },
  };
}
