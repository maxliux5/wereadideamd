# 微信读书笔记导出 Chrome 插件

微信读书笔记导出工具，通过 Chrome 扩展实现，支持将书架中的书籍笔记导出为 Markdown 格式。

## 功能特性

- **书架浏览**：分页展示书架书籍
- **搜索过滤**：按书名搜索
- **排序功能**：支持按书名、笔记数量等维度排序
- **批量导出**：选中多本书籍，批量导出笔记
- **ZIP 打包**：支持将多个笔记文件打包为 ZIP 下载

## 文件结构

```
weread-export-chrome/
├── manifest.json       # Chrome 扩展配置
├── background.js       # 后台脚本
├── popup.html/js       # 弹窗页面
├── sidepanel.html      # 侧边栏面板
├── content.js         # 内容脚本
├── icons/             # 扩展图标
└── README.md
```

## 安装使用

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `weread-export-chrome` 目录
5. 访问微信读书网页版，打开扩展侧边栏即可使用

## 技术说明

- **Manifest V3**：采用最新的 Chrome 扩展清单版本
- **自动 Cookie**：自动处理微信读书认证，无需手动登录
