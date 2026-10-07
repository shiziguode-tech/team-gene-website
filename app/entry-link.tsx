'use client';
import type { ReactNode } from 'react';
import type { Entry } from '@/lib/content';
import { entryPath } from '@/lib/content-links';

export default function EntryLink({entry,onOpen,className,children}:{entry:Entry;onOpen:(entry:Entry)=>void;className:string;children:ReactNode}) {
  return <a className={className} href={entryPath(entry)} onClick={event=>{
    if(event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();onOpen(entry);
  }}>{children}</a>;
}
