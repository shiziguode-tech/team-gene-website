import type { Metadata } from 'next';
import '../globals.css';
export const metadata: Metadata = { title: '后台管理', robots: { index: false, follow: false } };
export default function AdminLayout({children}:{children:React.ReactNode}) { return children; }
