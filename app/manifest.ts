import type { MetadataRoute } from 'next';

// Name, colours and icons when the site is added to a phone home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Team Gene · 计算机科学与人工智能科研团队',
    short_name: 'Team Gene',
    description: '以好奇心为起点，一起探索计算与智能的边界。',
    lang: 'zh-CN',
    start_url: '/',
    display: 'minimal-ui',
    background_color: '#f7f5ef',
    theme_color: '#0f2b24',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
