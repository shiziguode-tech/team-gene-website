import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRedesign} from '../lib/redesign/templates.mjs';

const entry = (section, overrides = {}) => ({id:section+'-test',section,title:'测试内容',subtitle:'副标题',tag:'测试',date:'2026-09-28',body:'完整正文',url:'',media:[],graduationYear:'其他',...overrides});
const image = key => ({key,name:key,type:'image',mime:'image/png',size:12});
const video = {key:'activity.mp4',name:'活动视频',type:'video',mime:'video/mp4',size:24};

test('all sections render with an empty CMS, without invented people or broken teacher access',()=>{
  const app=createRedesign([]);
  for(const section of ['home','members','alumni','research','awards','life','news','rules','mail','404'])assert.match(app.page(section).html,/<main id="main">/);
  assert.match(app.page('home').html,/0 位老师，0 位学生/);
});
test('independent render snapshots cannot leak content across requests',()=>{
  const one=createRedesign([entry('alumni',{title:'第一位校友',graduationYear:'2022'})]);
  const two=createRedesign([entry('alumni',{title:'第二位校友',graduationYear:'2025'})]);
  assert.match(one.page('alumni').html,/第一位校友/);
  assert.doesNotMatch(one.page('alumni').html,/第二位校友/);
  assert.match(two.page('alumni').html,/第二位校友/);
});
test('CMS text and media attributes are escaped; unsafe and empty links are omitted',()=>{
  const malicious=entry('alumni',{title:'<script>alert(1)</script>',body:'<img src=x onerror=alert(1)>',url:'javascript:alert(1)',media:[image('x" onerror="oops.png')]});
  const html=createRedesign([malicious]).detail(malicious).html;
  assert.doesNotMatch(html,/<script>|<img src=x|href="javascript:|onerror="oops/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/%22%20onerror%3D%22/);
  const clean=entry('members');
  assert.doesNotMatch(createRedesign([clean]).detail(clean).html,/相关链接/);
});
test('profile detail preserves messages, extra images, video and live links',()=>{
  const profile=entry('alumni',{alumniMessage:'独立的校友寄语',media:[image('portrait.png'),image('extra.png'),video],url:'https://example.com/profile'});
  const html=createRedesign([profile]).detail(profile).html;
  for(const text of ['独立的校友寄语','portrait.png','extra.png','activity.mp4','https://example.com/profile'])assert.ok(html.includes(text));
  assert.match(html,/未填写/);
});
test('research preserves all uploaded figures and non-numbered Chinese results',()=>{
  const paper=entry('research',{researchBackground:'背景完整内容',researchResults:'成果开头\n第二段结果',titleImages:[image('title1.png'),image('title2.png')],modelImages:[image('model1.png'),image('model2.png')],media:[video]});
  const html=createRedesign([paper]).detail(paper).html;
  for(const text of ['背景完整内容','成果开头','第二段结果','title1.png','title2.png','model1.png','model2.png','activity.mp4'])assert.ok(html.includes(text));
});
test('members retain uploaded portraits and individual routes; timeline attachments survive redesign',()=>{
  const member=entry('members',{media:[image('student.png')]});
  const news=entry('news',{media:[video]});
  const app=createRedesign([member,news]);
  assert.match(app.page('members').html,/student.png/);
  assert.match(app.page('members').html,/href="\/members\/members-test"/);
  assert.match(app.page('news').html,/activity.mp4/);
  assert.match(app.detail(news).html,/完整正文/);
});
test('hard-wrapped English from PDFs is reflowed, while numbered items and Chinese lines stay separate',()=>{
  const paper=entry('research',{researchResults:'(1) We propose a framework that combines\ngeneral pretraining with task-\nspecific tuning.\n(2) Rates are applied to each\nlayer.\n成果开头\n第二段结果'});
  const html=createRedesign([paper]).detail(paper).html;
  assert.match(html,/<p>\(1\) We propose a framework that combines general pretraining with task-specific tuning.<\/p>/);
  assert.match(html,/<p>\(2\) Rates are applied to each layer.<\/p>/);
  assert.match(html,/<p>成果开头<\/p><p>第二段结果<\/p>/);
});
test('general content keeps explicit paragraphs, line breaks, hyphens and lettered items unchanged',()=>{
  const body='First paragraph\n\nand a deliberate second paragraph\n\nA state-of-the-\nart result\n\n(a) Accuracy\n(b) Recall';
  const expected='<p>First paragraph</p><p>and a deliberate second paragraph</p><p>A state-of-the-</p><p>art result</p><p>(a) Accuracy</p><p>(b) Recall</p>';
  for(const section of ['news','life','rules']){
    const record=entry(section,{body});
    assert.ok(createRedesign([record]).detail(record).html.includes(expected),section);
  }
});
test('research reflow respects paragraph/list boundaries and only removes explicit soft hyphens',()=>{
  const body='First paragraph\n\nand a deliberate second paragraph\n\nA state-of-the-\nart result\n\n(a) Accuracy\n(b) Recall\n1. Precision\n2. Coverage\n\nPre\u00ad\ntraining stays readable.\n\nResearch with task-spe-\ncific text.\n中文 AI\nand a separate English line';
  const expected='<p>First paragraph</p><p>and a deliberate second paragraph</p><p>A state-of-the-art result</p><p>(a) Accuracy</p><p>(b) Recall</p><p>1. Precision</p><p>2. Coverage</p><p>Pretraining stays readable.</p><p>Research with task-spe-cific text.</p><p>中文 AI</p><p>and a separate English line</p>';
  for(const field of ['researchBackground','researchResults']){
    const record=entry('research',{[field]:body});
    assert.ok(createRedesign([record]).detail(record).html.includes(expected),field);
  }
});
test('PDF breaks after brackets and percentages, or before numbers, are joined; item markers still split',()=>{
  const paper=entry('research',{researchBackground:'pretrained language models (PLMs)\nhave results [12]\nacross tasks. Accuracy improves by\n4.0% and speed by 50%\nwhile memory\n2. Coverage\nis listed separately\n3) Third item'});
  const html=createRedesign([paper]).detail(paper).html;
  assert.ok(html.includes('<p>pretrained language models (PLMs) have results [12] across tasks. Accuracy improves by 4.0% and speed by 50% while memory</p><p>2. Coverage is listed separately</p><p>3) Third item</p>'));
});
test('Chinese headings and result labels break between words, never inside single-character words',()=>{
  const paper=entry('research',{highlights:[{value:'+4.0%',label:'四个基准数据集上的平均准确率提升'}]});
  const site=createRedesign([paper]);
  const home=site.page('home').html;
  assert.ok(home.includes('data-ph>好的<wbr>研究，<wbr>始于<wbr>一起<wbr>思考。</h2>'));
  assert.match(home,/<h1 class="hero__title">/,'the hand-set hero title is left alone');
  assert.ok(site.detail(paper).html.includes('<span data-ph>四个<wbr>基准<wbr>数据集上的<wbr>平均<wbr>准确率<wbr>提升</span>'));
  assert.ok(site.page('404').html.includes('这条<wbr>路径还<wbr>没有被<wbr>探索'),'every heading has somewhere to break');
  assert.ok(!/始<wbr>于|准确<wbr>率/.test(home+site.detail(paper).html));
});
test('gallery photos and paper figures open in one page-wide viewer; GIFs and videos keep their originals',()=>{
  const news=entry('news',{media:[image('a1b2.jpg'),image('c3d4.gif'),video]});
  const html=createRedesign([news]).detail(news).html;
  assert.ok(html.includes('data-zoom="/api/media/a1b2.jpg?w=1600" data-alt="a1b2.jpg" data-original="/api/media/a1b2.jpg"'),'photos open a 1600px rendition');
  assert.ok(html.includes('data-zoom="/api/media/c3d4.gif" '),'animated GIFs are not resized');
  assert.equal((html.match(/id="lightbox"/g)||[]).length,1);
  assert.match(html,/data-lb-prev[^>]*aria-label="上一张"/);
  const plain=entry('news',{media:[]});
  assert.doesNotMatch(createRedesign([plain]).detail(plain).html,/id="lightbox"/,'no viewer without images');
  const paper=entry('research',{modelImages:[image('model.png')]});
  const figure=createRedesign([paper]).detail(paper).html;
  assert.match(figure,/data-zoom="\/api\/media\/model.png\?w=1600"[^>]*data-original="\/api\/media\/model.png"/,'paper figures keep the original available without loading it for the viewer');
  assert.match(figure,/srcset="[^\"]*model.png\?w=640 640w/,'paper figures choose a responsive preview');
});
test('empty record sections leave the header, menu and footer; their page drops the "00" counter',()=>{
  const navLinks=html=>[...html.matchAll(/class="(nav__link|menu__link)(?: [^"]+)?"[^>]*href="\/(\w+)"/g)].map(m=>m[1]+':'+m[2]);
  const site=createRedesign([entry('news')]);
  const home=site.page('home').html;
  for(const kind of ['nav__link','menu__link'])for(const key of ['awards','life'])assert.ok(!navLinks(home).includes(kind+':'+key),kind+' hides empty '+key);
  assert.ok(navLinks(home).includes('nav__link:news')&&navLinks(home).includes('nav__link:rules'));
  assert.doesNotMatch(home,/<li><a href="\/awards">/,'footer hides it too');
  assert.match(home,/class="menu__num">02<\/span><span class="menu__label">团队成员/,'menu numbers stay consecutive');
  assert.doesNotMatch(site.page('awards').html,/page-hero__count/);
  const full=createRedesign([entry('awards'),entry('life'),entry('news')]).page('home').html;
  for(const key of ['awards','life','news'])assert.ok(navLinks(full).includes('nav__link:'+key));
  assert.match(full,/<li><a href="\/awards">团队获奖<\/a><\/li>/);
});
test('papers without key results list their publication details; key results take that place when present',()=>{
  const paper=entry('research',{tag:'Expert Systems With Applications（SCI Q1）',date:'2026-03-18',url:'https://doi.org/10.1016/x',titleImages:[image('t.png')],modelImages:[image('m.png')]});
  const html=createRedesign([paper]).detail(paper).html;
  assert.match(html,/class="paper-aside paper-aside--facts"/);
  for(const row of ['<dt>期刊 / 会议</dt><dd>Expert Systems With Applications</dd>','<dt>收录</dt><dd>SCI Q1</dd>','<dt>发表时间</dt><dd>2026 年 3 月</dd>','<dt>图表</dt><dd>2 幅</dd>'])assert.ok(html.includes(row),row);
  assert.match(html,/<a class="btn btn--forest btn--sm" href="https:\/\/doi\.org\/10\.1016\/x" target="_blank" rel="noopener noreferrer">查看原文/);
  assert.doesNotMatch(html,/相关链接/,'the paper link appears once, as the button');
  const withResults={...paper,highlights:[{value:'+4.0%',label:'平均准确率提升'}]};
  const kpi=createRedesign([withResults]).detail(withResults).html;
  assert.match(kpi,/<h2>KEY RESULTS<\/h2><div class="kpi"><strong>\+4\.0%<\/strong>/);
  assert.doesNotMatch(kpi,/paper-aside--facts|<dt>收录<\/dt>/);
});
test('a teacher profile lists research directions instead of the “教师” category; empty facts are omitted',()=>{
  const teacher=entry('members',{id:'teacher-x',title:'王老师',subtitle:'指导教师 · 副教授',tag:'教师',body:'研究方向：机器学习、可信人工智能。\n指导理念：认真提问。'});
  const student=entry('members',{id:'student-x',title:'新同学',subtitle:'',tag:''});
  const site=createRedesign([teacher,student]);
  const t=site.detail(teacher).html;
  assert.ok(t.includes('<dt>研究方向</dt><dd>机器学习、可信人工智能</dd>'));
  assert.ok(t.includes('<dt>身份</dt><dd>指导教师 · 副教授</dd>'));
  assert.doesNotMatch(t,/<dd>教师<\/dd>/);
  assert.match(t,/sizes="\(min-width: 860px\) 460px, \(min-width: 601px\) 420px, 132px"|class="frame profile__photo/,'phones request a small portrait');
  assert.doesNotMatch(site.detail(student).html,/<dt>(研究方向|身份)<\/dt>/);
});
test('video-only profiles use initials for portraits while retaining playable gallery video',()=>{
  const teacher=entry('members',{id:'teacher',tag:'教师',media:[video]});
  const student=entry('members',{id:'student',media:[video]});
  const alumnus=entry('alumni',{id:'alumnus',graduationYear:'2022',media:[video]});
  const other=entry('alumni',{id:'other',graduationYear:'2023',media:[video,image('portrait.png')]});
  const app=createRedesign([teacher,student,alumnus,other]);
  for(const html of [app.page('home').html,app.page('members').html,app.page('alumni').html,...[teacher,student,alumnus,other].map(profile=>app.detail(profile).html)]){
    assert.doesNotMatch(html,/<img[^>]*src="[^"]*activity\.mp4"/,'a video is never used as a portrait');
  }
  for(const profile of [teacher,student,alumnus])assert.match(app.detail(profile).html,/<video[^>]*src="\/api\/media\/activity.mp4"/);
  assert.match(app.page('alumni').html,/<img[^>]*src="\/api\/media\/portrait.png"/,'the actual image is selected even after a video');
});

test('rules retain introductions, interleaved explanations and original item numbers',()=>{
  const rule=entry('rules',{body:'阅读前的说明\n3. 第三项\n5、第五项\n中间的补充说明\n8．第八项\n最后的备注 <img src=x>'});
  const html=createRedesign([rule]).page('rules').html;
  const texts=['阅读前的说明','第三项','第五项','中间的补充说明','第八项','最后的备注 &lt;img src=x&gt;'];
  const offsets=texts.map(text=>html.indexOf(text));
  assert.ok(offsets.every((offset,i)=>offset>=0&&(!i||offset>offsets[i-1])),'the CMS order must not change');
  assert.match(html,/<ol start="3"><li value="3" data-rule-number="3">/);
  assert.match(html,/<li value="5" data-rule-number="5">/);
  assert.match(html,/<ol start="8"><li value="8" data-rule-number="8">/);
  assert.doesNotMatch(createRedesign([entry('rules',{body:'仅有一段说明'})]).page('rules').html,/<ol><\/ol>/);
});

test('research labels do not turn conference publications into journals and preserve the text language',()=>{
  for(const [background,lang] of [['研究背景与实验结果','zh-CN'],['An English abstract with model results.','en']]){
    const paper=entry('research',{tag:'NeurIPS',researchBackground:background});
    const app=createRedesign([paper]);
    const list=app.page('research').html,detail=app.detail(paper).html;
    assert.doesNotMatch(list,/期刊论文/);
    assert.match(list,/2026\.09 · 学术成果/);
    assert.ok(list.includes(`<p lang="${lang}"`));
    assert.ok(detail.includes(`<div class="en-prose" lang="${lang}">`));
  }
});

test('research figures have a real original-file link when scripts are unavailable',()=>{
  const paper=entry('research',{modelImages:[image('model.png')]});
  const html=createRedesign([paper]).detail(paper).html;
  assert.match(html,/<a class="figure__zoom" href="\/api\/media\/model\.png" target="_blank" rel="noopener" data-zoom="\/api\/media\/model.png\?w=1600"/);
});

test('profile paging describes the member or alumni roster correctly',()=>{
  for(const [section,label] of [['members','浏览其他团队成员'],['alumni','浏览其他校友']]){
    const profile=entry(section);
    assert.ok(createRedesign([profile]).detail(profile).html.includes(`aria-label="${label}"`));
  }
});
