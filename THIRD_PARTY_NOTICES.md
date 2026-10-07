# 许可证与第三方署名

根目录的 [MIT 许可证](LICENSE) 适用于 Team Gene 原创的官网、管理后台、论坛、邮箱集成代码和配套文档。第三方组件、由第三方作品改编的文件及字体继续采用各自的许可证，根目录许可证不替代它们的许可或版权声明。

## 随仓库分发的组件

| 路径或组件 | 版权归属与许可 | 随附文本 |
| --- | --- | --- |
| `webmail/roundcube/`，另列组件除外 | Roundcube Dev Team、Kolab Systems AG 及原文件作者；GPL-3.0-or-later，保留上游对皮肤和插件的例外 | [Roundcube README](webmail/roundcube/README.md)、[GPL](webmail/roundcube/LICENSE)、[逐文件版权清单](webmail/roundcube/copyright) |
| `webmail/roundcube/skins/elastic/` 与 `deploy/roundcube-theme/skins/elastic/`，另列字体和依赖除外 | Aleksander Machniak、Roundcube Dev Team；Team Gene 对配色、布局、模板和交互的改编继续采用 CC-BY-SA-3.0 | [Elastic README](webmail/roundcube/skins/elastic/README.md)、[主题声明](deploy/roundcube-theme/LICENSE.md)、[CC-BY-SA-3.0](LICENSES/CC-BY-SA-3.0.txt) |
| `webmail/roundcube/plugins/team_gene_avatar/` 与 `deploy/roundcube/team_gene_avatar/` | Team Gene contributors；MIT；独立插件通过 Roundcube 插件接口调用 | 各插件目录的 `LICENSE` |
| `webmail/roundcube/program/js/tinymce/` | Tiny Technologies, Inc. 与原文件作者；TinyMCE 5.10.9，LGPL-2.1 | [TinyMCE 许可证](webmail/roundcube/program/js/tinymce/LICENSE.TXT)、[完整上游源码](LICENSES/sources/tinymce-5.10.9.tar.gz) |
| `webmail/roundcube/program/js/jquery*` | OpenJS Foundation、JS Foundation 及其他贡献者；jQuery 3.6.1，MIT | [jQuery MIT](LICENSES/jquery-MIT.txt) |
| `webmail/roundcube/plugins/jqueryui/` 中的 jQuery UI 库 | jQuery Foundation、OpenJS Foundation 及其他贡献者；jQuery UI 1.13.2，MIT；Roundcube 插件封装本身为 GPL-3.0-or-later | [jQuery UI MIT](LICENSES/jquery-ui-MIT.txt)、原文件头和插件 `composer.json` |
| 同目录的 `jquery-ui-accessible-datepicker*` | Kolab Systems AG；GPL-3.0-or-later，含源文件头中的额外许可 | 原文件头、[GPL](LICENSES/GPL-3.0.txt) |
| 同目录的 `jquery.tagedit*` | Oliver Albrecht、Thomas Brüderli；MIT | 非压缩源文件中的完整许可 |
| 同目录的 `jquery.minicolors*` 与配套样式、图片 | Cory LaViska；MIT | [MiniColors MIT](LICENSES/jquery-minicolors-MIT.txt) |
| `webmail/roundcube/program/js/jstz*` | Jon Nylander；MIT | [jsTimezoneDetect MIT](LICENSES/jstimezonedetect-MIT.txt)、原文件头 |
| `webmail/roundcube/program/js/publickey*` | Daniel Roesler；PublicKey.js，GPL-3.0 | [GPL](LICENSES/GPL-3.0.txt)、[上游依赖声明](https://github.com/roundcube/roundcubemail/blob/1.6.18/jsdeps.json) |
| `webmail/roundcube/skins/elastic/deps/bootstrap*` | Bootstrap Authors、Twitter, Inc.；Bootstrap 4.6.2，MIT；bundle 中的 Popper.js 同为 MIT | [Bootstrap MIT](LICENSES/bootstrap-MIT.txt)、[Popper MIT](LICENSES/popper-MIT.txt) |
| `public/redesign/fonts/` | Inter Project Authors、Instrument Serif Project Authors、JetBrains Mono Project Authors、Google；SIL OFL-1.1 | 目录内 `inter-OFL.txt`、`instrumentserif-OFL.txt`、`jetbrainsmono-OFL.txt`、`notoserifsc-OFL.txt` |
| 两个 Elastic 主题目录中的 `fonts/inter-*` | Inter Project Authors；SIL OFL-1.1 | 各目录内 `inter-OFL.txt` |
| `webmail/roundcube/skins/elastic/fonts/fa-*` | Fonticons, Inc.；Font Awesome 字体，SIL OFL-1.1 | [Roundcube 版权清单](webmail/roundcube/copyright)、[OFL](LICENSES/OFL-1.1.txt) |
| `webmail/roundcube/skins/elastic/fonts/roboto-*` | Google；Roboto，Apache-2.0 | [Roundcube 版权清单](webmail/roundcube/copyright)、[Apache 许可证](LICENSES/Apache-2.0.txt) |
| `vendor/shadcn-tailwind-4.13.0.css` 及 `components/ui/` 中基于 shadcn/ui 的组件 | shadcn；MIT；项目定制修改的版权归相应贡献者 | [原始许可](vendor/shadcn-tailwind-4.13.0.LICENSE.md) |
| `build/sites-vite-plugin.*` | OpenAI；MIT | [原始许可](build/sites-vite-plugin.LICENSE) |

## 源码与依赖

仓库保留 Roundcube、主题和插件的可编辑源码；现有 `.min.js`、压缩样式等文件不替代对应源码。额外附带 [Roundcube 1.6.18](LICENSES/sources/roundcubemail-1.6.18.tar.gz) 和 [TinyMCE 5.10.9](LICENSES/sources/tinymce-5.10.9.tar.gz) 的官方源码归档，包含上游构建材料。来源与校验值见 [源码归档说明](LICENSES/sources/README.md)。Team Gene 修改后的实际文件保存在仓库正常目录中。

`package.json`、`package-lock.json` 和 Roundcube 的 `composer.json` 指定由包管理器安装的其他依赖；这些依赖不因主项目采用 MIT 而更改许可证。仓库不捆绑 `node_modules` 或 Composer `vendor`，安装及再分发依赖时请保留各依赖随附的声明。

本目录结构的许可证范围以组件自身的许可和原文件声明为准。
