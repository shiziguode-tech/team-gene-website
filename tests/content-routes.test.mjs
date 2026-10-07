import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {profileSlugBase,withContentRoutes,resolveRouteId} from '../db/content-routes.ts';

const alumni=(id,extra={})=>({id,section:'alumni',alumniType:'profile',graduationYear:2022,title:'林知夏',subtitle:'',tag:'',date:'2026-09-29',body:'',url:'',revision:0,...extra});
test('profile URLs use pinyin and actual cohort years, with teacher and surname support',()=>{
  assert.equal(profileSlugBase(alumni('a')),'2022-linzhixia');
  assert.equal(profileSlugBase(alumni('a',{title:'单明'})),'2022-shanming');
  assert.equal(profileSlugBase(alumni('a',{title:'陈知远',section:'members',tag:'教师'})),'chenzhiyuan');
  assert.equal(profileSlugBase(alumni('a',{title:'陈思远',section:'members',subtitle:'本科研究助理 · 2023 级'})),'2023-chensiyuan');
  assert.equal(profileSlugBase(alumni('a',{graduationYear:undefined})),'linzhixia');
});
test('same-name profiles get stable unique routes; rename keeps aliases and deleted routes stay reserved',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    let entries=withContentRoutes(db,[alumni('a'),alumni('b')]);
    assert.deepEqual(entries.map(e=>e.slug),['2022-linzhixia','2022-linzhixia-2']);
    assert.equal(withContentRoutes(db,[alumni('b')])[0].slug,'2022-linzhixia-2');
    entries=withContentRoutes(db,[alumni('a',{graduationYear:2023}),alumni('b'),alumni('c')]);
    assert.deepEqual(entries.map(e=>e.slug),['2023-linzhixia','2022-linzhixia-2','2022-linzhixia-3']);
    assert.equal(resolveRouteId(db,'alumni','2022-linzhixia'),'a');
    assert.equal(resolveRouteId(db,'alumni','2023-linzhixia'),'a');
    assert.equal(withContentRoutes(db,[alumni('a')])[0].slug,'2022-linzhixia');
    assert.equal(resolveRouteId(db,'members','2022-linzhixia'),undefined);
  } finally {db.close();}
});
test('friendly routes never shadow an existing legacy ID',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    const entries=withContentRoutes(db,[alumni('2022-linzhixia',{title:'李红'}),alumni('a')]);
    assert.equal(entries[1].slug,'2022-linzhixia-2');
  } finally {db.close();}
});
