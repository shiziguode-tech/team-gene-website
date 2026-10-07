import { connection } from 'next/server';
import Redesign from './redesign';
import { listContent } from '@/db/content';
// Read content per request (not at build time) so the header lists the same sections as other pages.
export default async function NotFound(){await connection();return <Redesign section="404" entries={await listContent()} />;}
