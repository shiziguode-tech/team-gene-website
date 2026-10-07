# Team Gene

科研团队网站，包含团队展示、内容管理、媒体论坛和网页邮箱集成。界面采用墨绿与土棕配色，支持桌面和手机。

## 功能

- 成员与校友个人资料、按年份浏览、学术成果、活动与通知。
- 内容管理后台、图片和视频上传、可读链接、SEO 与分享图片。
- 邮箱账户管理、配额设置、头像，以及基于邮箱认证的论坛。
- 论坛发帖、评论和媒体附件，流式上传下载、断点范围请求。
- Roundcube 网页邮箱、定制皮肤、头像插件和附件处理补丁。

主站使用 Next.js 16.3.4、React 19、TypeScript 和 SQLite。网页邮箱使用 PHP / Roundcube，邮件服务对接 Stalwart。

## 本地启动

需要 Node.js 24.x 和 npm。

```sh
npm ci
npm run setup
npm run dev -- --hostname 127.0.0.1 --port 3000
```

打开 <http://127.0.0.1:3000>；管理后台为 `/admin`。初始化时生成独立的随机管理密码，显示在终端，并写入本机 `.env.local`。本地演示数据库位于 `data/local-preview/`，重复初始化不会覆盖已有密码或编辑内容。

演示数据全部为虚构内容。初始化不连接生产网站，也不下载真实成员照片或创建真实邮箱。

## 构建与测试

```sh
npm run build
npm test
node .next/standalone/server.js
```

最后一个命令启动 standalone 服务，默认端口为 3000。生产运行时需另外通过进程管理器或容器加载环境变量；standalone 不会读取项目根目录的开发 `.env.local`。部分传输测试使用临时大文件，请预留至少 1 GB 空间。

## 配置与部署

`.env.example` 列出本地设置及可选邮件服务参数。网站可独立运行；真实邮箱注册、邮箱收发和论坛邮箱认证需要单独配置 Stalwart、IMAP、SMTP、DNS 与 TLS。邮箱注册在演示环境默认关闭。

`webmail/roundcube/` 是独立 PHP 应用，不会随 Next.js 启动。需要相应 PHP 扩展、Roundcube 依赖、开发数据库和邮件服务；参考该目录的上游 README。配置样例不能直接作为生产密钥使用。

这是 Team Gene 网站的源码发布，仍保留品牌和域名约定。部署到自己的域名前，应调整 `lib/seo.ts`、`lib/redesign/config.mjs`、邮箱注册和认证中的 `team-gene.com` 域名、网页邮箱入口，以及后台允许的主机名。邮件配置必须指向自己的服务。

`deploy/` 仅保留构建需要的上传超时文件、容器反向代理示例和网页邮箱定制文件。源码不附生产配置、服务器凭据、数据库、私人邮件、真实人员资料快照或旧 Git 历史。

## 目录

| 目录 | 内容 |
| --- | --- |
| `app/` | 页面、管理后台、论坛和 HTTP API |
| `lib/`、`db/` | 数据模型、认证、模板、邮件对接 |
| `public/redesign/` | 公共页面样式、脚本和字体 |
| `webmail/roundcube/` | 网页邮箱、皮肤及插件 |
| `tests/` | 自动化检查 |
| `preview/` | 本地虚构演示数据初始化 |

## 许可证

自有主站、论坛和管理代码使用 [MIT](LICENSE)。Roundcube、Elastic 皮肤、字体和其他第三方组件继续使用各自原许可证，详见 [第三方许可说明](THIRD_PARTY_NOTICES.md)。Team Gene 名称与标识不表示对衍生站点的认可。
