# 网页邮箱源码 · 2026-10-04

`roundcube/` 包含 Roundcube `1.6.18+dfsg-0+deb13u1` 的网页程序、皮肤、插件、SQL、工具、配置示例及 Debian copyright（含上游许可说明）。Team Gene 的 `team_gene_avatar` 插件位于 `plugins/`。

本轮复用已有安全导出的网页邮箱源码，并于 2026-10-04 通过 SSH 只读逐文件校验：1,192 个文件的 SHA-256 均与当前线上源码一致，没有缺失或差异。校验只读取选定源文件，没有读取生产配置、数据库或邮件。工作区与此副本中的 25 个定制皮肤文件及 4 个头像插件文件也逐字节一致。

## 安全范围与开发环境

不包含真实 `config.inc.php`、数据库连接密码、密钥、私人邮件、账户、会话、日志或临时附件。它是源码，不是已经配置好的邮件服务器。运行需要 PHP、相应扩展与 Roundcube 依赖、开发数据库、IMAP 和 SMTP。原服务器使用 Debian 提供的部分 PHP / JavaScript 依赖；Stalwart 独立运行，Team Gene 对接代码在主项目 `lib/` 和 `app/api/`。

网页邮箱不会随 `npm run dev` 启动。只修改界面时可编辑模板、LESS/CSS、JS 和图片；完整联调请配置自己的开发邮箱环境，不能使用生产密码或私人邮件作为样本。`installer/` 仅保留作源码参考，正式环境不要开放安装向导。

有效的外部 JavaScript 符号链接已展开为普通文件。原服务器失效的开发辅助 `less.min.js` 链接未导出；实际样式为编译后的 CSS。编译 LESS 时请安装开发编译器，不依赖该旧链接。

## Team Gene 定制入口

- 网页邮箱皮肤：`skins/elastic/`，与主项目 `deploy/roundcube-theme/skins/elastic/` 对应。
- 头像、中文补译与账号头像管理：`plugins/team_gene_avatar/`，与 `deploy/roundcube/team_gene_avatar/` 对应。
- 发件人首字头像、线程缩进、阅读区、附件卡片、写信控件、深色模式：皮肤 LESS 和插件 `avatar.js` / `avatar.css`。
- 空阅读区、默认联系人头像、附件拖放图标：`watermark.html`、`images/contactpic.svg`、`images/download.svg`。
- 附件流式下载核心补丁：`program/include/rcmail_attachment_handler.php`；可复现配置与补丁见主项目 `deploy/mail-transfer-setup.py`。
- 共享头像预处理：插件 `avatar-preprocess.js` 与主项目 `lib/avatar-preprocess.js` 保持同步。

修改时保留 Roundcube 表单字段、模板指令与功能钩子。LESS 变更需重新编译 CSS、压缩 CSS、source map 和 gzip，并同步上述部署副本。升级 Roundcube 时不要丢失附件核心补丁；不要直接运行历史发布脚本。

## 隔离回归检查

安装 PHP 后，在主项目根目录执行：

```sh
php tests/roundcube-avatar-transfer.php webmail/roundcube/plugins/team_gene_avatar/team_gene_avatar.php
php -d memory_limit=12M tests/roundcube-attachment-stream.php webmail/roundcube/program/include/rcmail_attachment_handler.php
php tests/roundcube-zh-labels.php webmail/roundcube
```

这些检查使用测试桩读取源码，不登录邮箱或发送邮件。实际检查结果以本包 `EXPORT-METADATA.json` 为准；详见历史 `deploy/20261001-mail-ui.md` 和 `deploy/20261001-transfer-performance.md`。
