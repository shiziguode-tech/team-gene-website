import {cookies} from 'next/headers';
import {ADMIN_COOKIE,hasAdminSession} from '@/app/admin-session';
import Admin from './panel';
import AdminChrome from './chrome';
import AdminLogin from './login';
import AdminSessionGuard from './session-guard';
import {STYLE_VERSION} from '@/lib/redesign/style-version';
export const dynamic='force-dynamic';
export default async function Page(){const token=(await cookies()).get(ADMIN_COOKIE)?.value;if(!await hasAdminSession(token))return <AdminChrome home><AdminLogin/></AdminChrome>;return <AdminChrome home><link rel="stylesheet" href={`/redesign/content-admin.css?v=${STYLE_VERSION}`} precedence="default"/><AdminSessionGuard><Admin name="密码验证"/></AdminSessionGuard></AdminChrome>}
