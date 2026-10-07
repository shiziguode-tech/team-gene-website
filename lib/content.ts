export const sections=[['overview','团队概览'],['members','团队成员'],['alumni','校友介绍'],['research','学术成果'],['awards','团队获奖'],['life','团建活动'],['rules','管理规则'],['news','活动与通知']] as const;
export type Section='members'|'alumni'|'research'|'awards'|'life'|'rules'|'news';
export type MediaAsset={key:string;name:string;type:'image'|'video';mime:string;size:number};
export type Entry={id:string;section:Section;title:string;subtitle:string;tag:string;date:string;body:string;url:string;revision:number;slug?:string;media?:MediaAsset[];alumniType?:'profile'|'update';graduationYear?:number;alumniMessage?:string;modelImages?:MediaAsset[];titleImages?:MediaAsset[];researchBackground?:string;researchResults?:string;researchHighlights?:ResearchHighlight[]};
// Key results shown beside a paper (value such as “+4.0%”, with a short label).
export type ResearchHighlight={value:string;label:string};
export function entryMedia(entry:Pick<Entry,'media'|'modelImages'|'titleImages'>):MediaAsset[]{return [...(entry.media??[]),...(entry.modelImages??[]),...(entry.titleImages??[])];}
export function getAlumniYear(entry:Pick<Entry,'subtitle'|'tag'|'graduationYear'>):string{return entry.graduationYear?String(entry.graduationYear):`${entry.subtitle} ${entry.tag}`.match(/((?:19|20)\d{2})\s*届/)?.[1]??'其他';}
const entry=(id:string,section:Section,title:string,subtitle:string,tag:string,date:string,body:string):Entry=>({id,section,title,subtitle,tag,date,body,url:'',revision:0});
export const initial:Entry[]=[
entry('teacher-01','members','林知远','指导教师 · 副教授','教师','2026-09-01','研究方向：机器学习、可信人工智能与智能计算系统。\n关注人工智能的基础方法与实际应用，鼓励从真实问题出发，在开放协作中形成独立的研究判断。\n指导理念：认真提问，扎实验证，自由讨论。'),
...['陈思远','王若宁','李明轩','张予安','刘星禾','赵一凡','周书言','吴沐阳','徐清越','孙嘉宁','胡景行','朱知夏','高子墨','林见山','何知行','郭语桐'].map((name,i)=>entry('student-'+String(i+1).padStart(2,'0'),'members',name,i<4?'博士研究生 · 2024 级':i<12?'硕士研究生 · '+(i<8?'2025':'2026')+' 级':'本科研究助理 · 2023 级',['机器学习','大语言模型','计算机视觉','智能计算'][i%4],'2026-09-01',['探索鲁棒表征学习与模型泛化，希望让人工智能更可靠。','关注知识增强生成与智能体协作，探索语言模型的推理边界。','研究视觉表征与多模态理解，让模型感知更丰富的真实世界。','关注高效推理、软件工程与系统优化，让研究成果走向实际应用。'][i%4])),
entry('paper-01','research','面向开放环境的可靠多模态表征学习','陈思远、王若宁、林知远 · 2026','研究论文','2026-08-20','本文探索开放环境下多模态数据的分布变化问题，通过一致性约束与不确定性估计提升模型的可靠性。\n研究关键词：多模态学习、鲁棒表征、可信 AI。\n阶段：实验验证中。此为展示用的虚构研究成果，未对应真实发表论文。'),
entry('paper-02','research','GeneAgent：面向科研任务的协作智能体框架','李明轩、赵一凡、林知远 · 2026','开源项目','2026-07-15','围绕文献整理、实验计划与结果复核等科研环节，探索可追踪的智能体协作机制。\n当前重点：工具调用评估与工作流可复现性。\n此项目为示例；正式仓库地址可在后台补充。'),
entry('paper-03','research','资源受限场景下的大模型高效推理','吴沐阳、林见山、林知远 · 2026','技术报告','2026-06-21','研究量化、缓存与任务调度之间的联合优化，为资源受限环境提供可复现的推理方案。\n阶段：内部技术报告。本文仅为网站示例内容。'),
entry('paper-04','research','少样本条件下的视觉场景理解','刘星禾、徐清越、林知远 · 2026','研究论文','2026-05-10','探索有限标注条件下的场景识别，通过自监督表征与原型学习提升数据使用效率。\n阶段：研究方案讨论中。本文仅为网站示例内容。'),
entry('award-01','awards','高校人工智能创新挑战赛 · 一等奖','陈思远、李明轩、赵一凡','竞赛荣誉','2026-07-22','参赛方向：智能体应用与可靠推理。\n作品：科研文献协作助手。\n此奖项和赛事为虚构示例，不代表团队实际获奖。'),
entry('award-02','awards','优秀研究项目展示 · 最佳展示奖','王若宁、刘星禾、徐清越','学术荣誉','2026-06-10','展示方向：可靠多模态学习。\n此奖项为虚构示例，用于演示荣誉展示方式。'),
entry('award-03','awards','校园程序设计邀请赛 · 银奖','吴沐阳、林见山、郭语桐','竞赛荣誉','2026-04-18','围绕算法设计、工程实现与团队协作展开竞赛。\n此奖项和赛事为虚构示例。'),
entry('life-01','life','走进山野，把灵感带回来','秋日徒步 · 校园周边绿道','户外团建','2026-09-26','计划在周六上午组织轻松徒步，以交流和放松为主。\n集合：09:00，校园东门。\n路线：绿道往返约 5 公里。\n请穿舒适的鞋并自备饮水；如遇降雨改期。此为示例活动。'),
entry('life-02','life','一杯咖啡，一场没有标准答案的讨论','夏日 Coffee Chat · 团队交流空间','轻松交流','2026-08-14','从最近读到的一篇论文，聊到一个还没想清楚的问题。每个人带来一个想法，不设评判，以交流为主。'),
entry('life-03','life','暂时放下键盘，一起上场','羽毛球友谊赛 · 校内体育馆','运动时刻','2026-06-28','自由组队的双打友谊赛。研究之外，也一起保持活力。'),
entry('rule-01','rules','学术诚信与研究规范','认真求证，诚实记录','研究准则','2026-09-01','1. 尊重原创，准确引用，严禁抄袭、伪造或选择性隐瞒实验结果。\n2. 在使用数据前确认来源、许可与隐私要求。\n3. 保存原始实验、代码版本与必要的运行环境说明。\n4. 使用 AI 辅助时进行人工核查，并按投稿要求披露使用情况。'),
entry('rule-02','rules','组会与日常沟通','每周交流，每月复盘','团队协作','2026-09-01','1. 每周五 14:00 开展组会，汇报进展、困难与下一步计划。\n2. 汇报材料提前一天整理至团队共享空间。\n3. 鼓励主动提出不同意见，讨论针对问题并尊重彼此。\n4. 请假提前告知指导教师和当周主持人。以上为试行示例安排。'),
entry('rule-03','rules','计算资源与代码管理','共享资源，共同维护','资源使用','2026-09-01','1. GPU 长时间任务提前预约，完成后及时释放资源。\n2. 代码使用版本管理，避免提交密钥、个人信息与大体积原始数据。\n3. 重要实验记录环境、参数、随机种子及运行版本。\n4. 故障与异常及时报告，未经允许不修改他人环境。'),
entry('rule-04','rules','论文署名与成果共享','透明沟通，尊重贡献','成果管理','2026-09-01','1. 项目早期讨论分工，在投稿前共同确认贡献和署名。\n2. 对外提交、公开代码与数据前，由参与者共同复核。\n3. 建立可复现的项目归档，便于后续同学接续研究。'),
entry('news-01','news','从论文到实践：新学期研究分享会','9 月 18 日 14:00 · 团队研讨室','学术交流','2026-09-18','一起交流暑期研究进展与下一阶段的探索方向。\n议程：14:00 暑期研究进展；14:40 论文阅读分享；15:20 新学期计划讨论。\n面向全体团队成员，请每人准备 5 分钟交流材料。'),
entry('news-02','news','新的学期，新的同行者','欢迎新成员加入 Team Gene','团队日常','2026-09-12','欢迎新成员加入 Team Gene，开启一段共同成长的旅程。\n请新同学了解团队管理规则，并在首次组会上介绍自己的兴趣与研究计划。'),
entry('news-03','news','本月计算资源使用登记','9 月 15 日前完成 · 全体成员','团队通知','2026-09-10','请各项目组整理本月算力需求，在组会上统一协调使用时段。\n登记信息包括项目名称、预计使用时长与存储需求。'),
entry('alumni-01','alumni','从团队研究到 AI 产品实践','2022 届校友 · 人工智能工程师','校友动态','2026-09-16','校友分享从研究问题出发、验证想法，再把模型可靠地带入产品的经验。\n\n给学弟学妹的建议：认真记录每一步实验，保持好奇，多和不同背景的伙伴交流。\n\n此为虚构的展示用校友故事。') ,
entry('alumni-02','alumni','重返校园，聊聊多模态研究的新进展','2020 届校友 · 高校青年教师','校友动态','2026-08-29','从在校时的第一次论文复现，到现在独立指导研究生，校友带来一场关于多模态学习与学术成长的交流。\n\n此为虚构的展示用校友故事。')
];
