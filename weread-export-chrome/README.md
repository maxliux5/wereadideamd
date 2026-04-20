# 微信读书笔记导出 Chrome 插件

将微信读书笔记导出为 Markdown 格式的 Chrome 扩展（Manifest V3）。

## 安装步骤

1. 打开 Chrome，进入 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `weread-export-chrome` 文件夹

## 使用方法

### 方式一：自动获取 Cookie（推荐）

1. 在 Chrome 中打开 weread.qq.com 并登录
2. 点击插件图标
3. Cookie 会自动获取并保存

### 方式二：手动输入 Cookie

1. 在 weread.qq.com 按 F12 打开开发者工具 → Network
2. 刷新页面，找任意 weread.qq.com 请求，复制请求头 Cookie
3. 粘贴到插件输入框并保存

### 导出笔记

1. 点击「刷新列表」获取书架
2. 点击「导出全部」导出所有书籍的笔记
3. 导出完成后可「下载 Markdown」或「复制内容」

## Markdown 格式

```markdown
# 《书籍标题》

> 作者：xxx
> 书籍ID：xxx

## 章节标题

### 划线
> 划线内容

*2024-01-01 12:00:00*

---

### 笔记
笔记内容

*2024-01-01 12:00:00*

---
```

## 项目结构

```
weread-export-chrome/
├── manifest.json        # 扩展配置 (Manifest V3)
├── background.js        # Service Worker
├── content-script.js    # Content Script (自动获取 Cookie)
├── popup.html           # 弹出窗口
├── popup.js             # 弹出窗口逻辑
├── icons/               # 图标
└── README.md
```

## API 端点

- `GET /web/shelf` - 获取书架
- `GET /web/book/info?bookId=` - 书籍信息
- `GET /web/review/list?bookId=&listType=1` - 笔记
- `GET /web/book/bookmarklist?bookId=` - 划线
- `POST /book/chapterInfos` - 章节信息

## 数据存储

使用 Chrome Storage API：
- `wereadCookie` - 认证 Cookie（29天过期）
- `syncedBookIds` - 已同步书籍 ID
- `book_last_sync_time_${bookId}` - 每本书最后同步时间