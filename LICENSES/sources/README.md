# 第三方对应源码

这里保存与捆绑组件版本对应的官方源码归档，供查看、修改和重建第三方组件使用；它们不是网站运行所需的数据或配置。

| 文件 | 版本与来源 | 许可 |
| --- | --- | --- |
| `roundcubemail-1.6.18.tar.gz` | [Roundcube 官方 1.6.18 标签](https://github.com/roundcube/roundcubemail/tree/1.6.18) | GPL-3.0-or-later，皮肤、插件和内含第三方文件按上游声明 |
| `tinymce-5.10.9.tar.gz` | [TinyMCE 官方 5.10.9 标签](https://github.com/tinymce/tinymce/tree/5.10.9) | LGPL-2.1，内含第三方文件按上游声明 |

`provenance.json` 记录下载来源与 SHA-256；`SHA256SUMS` 可用于校验。归档保持上游原样。Team Gene 修改后的 Roundcube、主题及插件源码位于仓库的 `webmail/roundcube/` 和 `deploy/`，不在这些上游归档内。
