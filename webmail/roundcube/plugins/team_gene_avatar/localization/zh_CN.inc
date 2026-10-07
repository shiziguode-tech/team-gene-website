<?php
/*
 * Simplified Chinese for Roundcube 1.6 texts that its zh_CN translation lacks
 * (they showed in English: “Dark mode”, “Details”, “Keep formatting”, the
 * logout notice…). team_gene_avatar.php merges them over the English fallback
 * for zh_CN sessions only; core localization files stay untouched.
 */

$labels = [];
$labels['oauthlogin'] = '使用 $provider 登录';
$labels['darkmode'] = '深色模式';
$labels['lightmode'] = '浅色模式';
$labels['markundeleted'] = '未删除';
$labels['selection'] = '选择';
$labels['showunread'] = '显示未读邮件';
$labels['mailimportdesc'] = '可以上传 <a href="https://en.wikipedia.org/wiki/Email#Message_format">MIME</a> 或 <a href="https://en.wikipedia.org/wiki/Mbox">Mbox</a> 格式的邮件文件。';
$labels['mailimportzip'] = '多个文件可以压缩成 zip 文件一起上传。';
$labels['keepformatting'] = '保留格式';
$labels['insertcontact'] = '插入联系人';
$labels['details'] = '详情';
$labels['summary'] = '摘要';
$labels['allheaders'] = '全部信头…';
$labels['sendreceipt'] = '发送已读回执？';
$labels['sendalwaysto'] = '总是发送给 $email';
$labels['choosefile'] = '选择文件…';
$labels['choosefiles'] = '选择文件…';
$labels['browse'] = '浏览';
$labels['importdesc'] = '可以从现有通讯录上传联系人。<br/>目前支持 <a href="https://en.wikipedia.org/wiki/VCard">vCard</a> 和 CSV（逗号分隔）格式。';
$labels['importmapdesc'] = '请先确认下面的字段对应关系无误，再继续导入。';
$labels['fieldnotmapped'] = '未对应字段（不导入）';
$labels['skipheader'] = '不导入第一行（表头）';
$labels['autosendtrusted'] = '可信发件人自动发送，其他询问我';
$labels['autosendtrustedignore'] = '可信发件人自动发送，其他忽略';
$labels['fromtrustedsenders'] = '来自可信发件人';
$labels['frommycontacts'] = '来自我的联系人';
$labels['displaynext'] = '删除或移动后显示下一封';
$labels['contactformmode'] = '联系人表单模式';
$labels['privatemode'] = '个人（家庭）';
$labels['businessmode'] = '工作（单位）';
$labels['collectedaddresses'] = '自动收集的地址';
$labels['collectedrecipients'] = '最近收件人';
$labels['collectedrecipientsopt'] = '发信时将收件人保存到';
$labels['collectedsendersopt'] = '将可信发件人保存到';
$labels['trustedsenders'] = '可信发件人';
$labels['olderxdays'] = '早于 $x 天';
$labels['mailvelopeoptions'] = 'Mailvelope 选项';
$labels['mailvelopemainkeyring'] = '使用 Mailvelope 主密钥环';
$labels['mailvelopenotfound'] = '浏览器未启用或未安装 Mailvelope 扩展。';
$labels['destination'] = '目标位置';
$labels['arialabellistnav'] = '列表导航';

$messages = [];
$messages['cookiesmismatch'] = '检测到 Cookie 不一致，请清除浏览器 Cookie 后重试。';
$messages['dbconnerror'] = '无法连接数据库！';
$messages['loggedout'] = '已安全退出，再见！';
$messages['suspiciousemail'] = '这封邮件包含可疑的邮件地址，可能是欺诈邮件。';
$messages['bccemail'] = '转发的邮件中含有密送（Bcc）收件人。';
$messages['bouncehint'] = '邮件将原样发出，即保留原始正文、信头和收件人。';
$messages['keyservererror'] = '无法从密钥服务器获取密钥。';
$messages['keyimportsuccess'] = '公钥 $key 已导入密钥环。';
$messages['contactsearchonly'] = '请使用搜索来查看所选通讯录中的联系人。';
$messages['movefolderconfirm'] = '确定要移动这个文件夹吗？';
$messages['folderpurged'] = '文件夹已清空。';
$messages['folderexpunged'] = '文件夹已压缩。';
$messages['csvfilemismatch'] = '不支持一次导入字段不同的多个 CSV 文件。';
$messages['msgsizeerrorfwd'] = '超过邮件大小上限（$size），有 $num 封邮件未能添加为附件。';
$messages['noresponsesavailable'] = '没有可用的回复模板';
$messages['emptyattachment'] = '这个附件似乎是空的。<br>请与发件人确认。';
$messages['oauthloginfailed'] = 'OAuth 登录失败，请重试。';
