/**
 * 微信读书笔记导出 - Background Service Worker
 * 基于原始插件的 API 调用逻辑
 */

// ============ 配置 ============
const API_BASE = 'https://weread.qq.com';
const API_BASE_I = 'https://i.weread.qq.com';

// API 端点
const API = {
  SHELF_PAGE: `${API_BASE}/web/shelf`,           // 书架页面（HTML）
  SHELF_SYNC: `${API_BASE}/web/shelf/syncBook`,  // 书架同步（POST）
  BOOK_INFO: `${API_BASE}/web/book/info`,        // 书籍信息
  REVIEW_LIST: `${API_BASE}/web/review/list`,    // 笔记列表
  BOOKMARK_LIST: `${API_BASE}/web/book/bookmarklist`, // 划线列表
  USER_CONFIG: `${API_BASE_I}/user/config`,      // 用户配置
  USER_PROFILE: `${API_BASE_I}/user/profile`,    // 用户信息
  CHAPTER_INFOS: `${API_BASE_I}/book/chapterInfos`, // 章节信息
  READ_INFO: `${API_BASE_I}/book/readinfo`        // 阅读信息
};

// ============ 工具函数 ============
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function parseCookieString(cookieStr) {
  const result = {};
  const regex = /([^=]+)=([^;]+)/g;
  let match;
  while ((match = regex.exec(cookieStr)) !== null) {
    result[match[1]] = match[2];
  }
  return result;
}

// ============ API 调用 ============
const WeReadAPI = {
  // 先访问 weread 主页（建立会话）
  async visitWeRead(cookie) {
    await fetch(API_BASE, {
      method: 'GET',
      headers: { 'Cookie': cookie }
    });
  },

  // 获取用户配置
  async getUserConfig(cookie) {
    try {
      await this.visitWeRead(cookie);
      const response = await fetch(API.USER_CONFIG, {
        method: 'GET',
        headers: { 'Cookie': cookie }
      });
      if (!response.ok) {
        const data = await response.json();
        const errcode = data.errcode || 0;
        if (errcode === -2012 || errcode === -2010) {
          console.error('微信读书Cookie过期了，请重新设置');
        }
        return null;
      }
      return await response.json();
    } catch (err) {
      console.error('获取用户配置失败:', err);
      return null;
    }
  },

  // 获取书架基本信息（从 HTML 页面提取）
  async getShelfInfo(cookie) {
    try {
      await this.visitWeRead(cookie);

      const response = await fetch(API.SHELF_PAGE, {
        method: 'GET',
        headers: { 'Cookie': cookie }
      });

      if (!response.ok) {
        throw new Error(`获取书架页面失败: ${response.status}`);
      }

      const html = await response.text();
      const jsonStr = html.split('window.__INITIAL_STATE__=')[1]?.split(';(function()')[0];

      if (!jsonStr) {
        console.warn('无法从页面中提取 __INITIAL_STATE__，尝试其他方式');
        // 尝试直接从 HTML 中提取书籍信息
        const bookIdMatches = html.match(/"bookId":"([^"]+)"/g);
        const titleMatches = html.match(/"title":"([^"]+)"/g);
        if (bookIdMatches && titleMatches) {
          const books = [];
          for (let i = 0; i < Math.min(bookIdMatches.length, 1000); i++) {
            const bookId = bookIdMatches[i]?.match(/"bookId":"([^"]+)"/)?.[1];
            const title = titleMatches[i]?.match(/"title":"([^"]+)"/)?.[1];
            if (bookId && title) {
              books.push({ bookId, title, author: '' });
            }
          }
          return books;
        }
        return [];
      }

      const data = JSON.parse(jsonStr);
      const rawIndexes = data.shelf?.rawIndexes || [];

      return rawIndexes.map(item => ({
        bookId: item.bookId,
        title: item.title || '',
        author: item.author || ''
      }));
    } catch (err) {
      console.error('获取书架信息失败:', err);
      throw err;
    }
  },

  // 获取书籍想法数量
  async getNoteCount(cookie, bookId) {
    try {
      await this.visitWeRead(cookie);
      const params = new URLSearchParams({
        bookId: bookId,
        listType: '11',
        mine: '1'
      });
      const response = await fetch(`${API.REVIEW_LIST}?${params}`, {
        method: 'GET',
        headers: { 'Cookie': cookie }
      });
      if (!response.ok) return 0;
      const data = await response.json();
      return (data.reviews || []).length;
    } catch (err) {
      return 0;
    }
  },

  // 分页获取书架（带排序和搜索）
  async getBookshelfPaged(cookie, options = {}) {
    const { offset = 0, limit = 50, sortBy = 'title', sortOrder = 'asc', search = '' } = options;

    try {
      // 获取基本信息用于搜索/排序/分页
      let allBooks = await this.getShelfInfo(cookie);

      // 搜索过滤
      if (search) {
        const s = search.toLowerCase();
        allBooks = allBooks.filter(b =>
          (b.title && b.title.toLowerCase().includes(s)) ||
          (b.author && b.author.toLowerCase().includes(s))
        );
      }

      // 如果需要想法数量排序，先获取
      if (sortBy === 'noteCount') {
        for (let i = 0; i < allBooks.length; i++) {
          allBooks[i].noteCount = await this.getNoteCount(cookie, allBooks[i].bookId);
          await delay(30);
        }
      }

      // 排序
      allBooks.sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'title') {
          cmp = (a.title || '').localeCompare(b.title || '', 'zh-CN');
        } else if (sortBy === 'author') {
          cmp = (a.author || '').localeCompare(b.author || '', 'zh-CN');
        } else if (sortBy === 'noteCount') {
          cmp = (a.noteCount || 0) - (b.noteCount || 0);
        }
        return sortOrder === 'desc' ? -cmp : cmp;
      });

      const total = allBooks.length;
      const pageBooks = allBooks.slice(offset, offset + limit);

      // 获取当前页书籍的完整详情
      if (pageBooks.length > 0) {
        await delay(100);
        const detailed = await this.syncBookIds(pageBooks.map(b => ({ bookId: b.bookId })), cookie);
        // 合并详情到 pageBooks
        for (const d of detailed) {
          const pb = pageBooks.find(p => p.bookId === d.bookId);
          if (pb) {
            pb.title = d.title || pb.title;
            pb.author = d.author || pb.author;
            pb.cover = d.cover;
            pb.category = d.category;
          }
        }
      }

      return {
        books: pageBooks,
        total,
        hasMore: offset + limit < total
      };
    } catch (err) {
      console.error('获取书架失败:', err);
      throw err;
    }
  },

  // 获取书架（从 HTML 页面提取 JSON）
  async getBookshelf(cookie, limit = 500) {
    try {
      await this.visitWeRead(cookie);

      const response = await fetch(API.SHELF_PAGE, {
        method: 'GET',
        headers: { 'Cookie': cookie }
      });

      if (!response.ok) {
        throw new Error(`获取书架页面失败: ${response.status}`);
      }

      const html = await response.text();
      const jsonStr = html.split('window.__INITIAL_STATE__=')[1]?.split(';(function()')[0];

      if (!jsonStr) {
        throw new Error('无法从页面中提取书架数据');
      }

      const data = JSON.parse(jsonStr);
      const rawIndexes = data.shelf?.rawIndexes || [];

      if (!rawIndexes || !rawIndexes.length) {
        return [];
      }

      // 分批获取书籍信息
      const booksToFetch = rawIndexes.slice(0, limit);
      const batches = [];
      for (let i = 0; i < booksToFetch.length; i += 100) {
        batches.push(booksToFetch.slice(i, i + 100));
      }

      const allBooks = [];
      for (const batch of batches) {
        await delay(100);
        const books = await this.syncBookIds(batch, cookie);
        allBooks.push(...books);
      }

      return allBooks;
    } catch (err) {
      console.error('获取书架失败:', err);
      throw err;
    }
  },

  // 同步获取书籍详情
  async syncBookIds(bookIds, cookie) {
    try {
      const body = {
        bookIds: bookIds.map(b => b.bookId),
        count: bookIds.length,
        isArchive: null,
        currentArchiveId: null,
        loadMore: true
      };

      const response = await fetch(API.SHELF_SYNC, {
        method: 'POST',
        headers: {
          'Cookie': cookie,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`分页获取书架失败: ${response.status}`);
      }

      const data = await response.json();
      if (!data || !data.books) return [];

      return data.books.map(book => ({
        bookId: book.bookId,
        title: book.title,
        author: book.author,
        cover: book.cover,
        category: this.getCategory(book.categories)
      }));
    } catch (err) {
      console.error('同步书籍失败:', err);
      return [];
    }
  },

  getCategory(categories) {
    if (!categories || !categories.length) return '';
    return categories.map(c => c.title).join('|');
  },

  // 获取书籍信息
  async getBookInfo(cookie, bookId) {
    try {
      await this.visitWeRead(cookie);
      const response = await fetch(`${API.BOOK_INFO}?bookId=${bookId}`, {
        method: 'GET',
        headers: { 'Cookie': cookie }
      });

      if (!response.ok) {
        console.error(`获取书籍信息失败: ${response.status}`);
        return null;
      }

      const data = await response.json();
      return {
        bookId: data.bookId,
        title: data.title,
        author: data.author,
        cover: data.cover,
        category: this.getCategory(data.categories)
      };
    } catch (err) {
      console.error('获取书籍信息失败:', err);
      return null;
    }
  },

  // 获取笔记列表
  async getReviews(cookie, bookId) {
    try {
      await this.visitWeRead(cookie);

      const params = new URLSearchParams({
        bookId: bookId,
        listType: '11',
        mine: '1'
      });

      const response = await fetch(`${API.REVIEW_LIST}?${params}`, {
        method: 'GET',
        headers: { 'Cookie': cookie }
      });

      if (!response.ok) {
        const data = await response.json();
        const errcode = data.errcode || 0;
        if (errcode === -2012 || errcode === -2010) {
          console.error('微信读书Cookie过期了');
        }
        throw new Error(`获取笔记列表失败: ${JSON.stringify(data)}`);
      }

      const data = await response.json();
      const reviews = data.reviews || [];

      if (!reviews || !reviews.length) return [];

      return reviews.map(r => r.review)
        .map(r => {
          // 处理不同类型的笔记
          if (r.type === 4) {
            return { chapterUid: 1000000, ...r };
          }
          if (r.refMpInfo) {
            return {
              refMpReviewId: r.refMpInfo.reviewId,
              refMpReviewTitle: r.refMpInfo.title,
              createTime: r.refMpInfo.createTime,
              ...r
            };
          }
          return r;
        })
        .map(r => ({
          bookId,
          chapterUid: r.chapterUid,
          chapterTitle: r.chapterTitle,
          createTime: r.createTime,
          markText: r.abstract || '',
          content: r.content || '',
          noteId: r.reviewId,
          refMpReviewId: r.refMpReviewId,
          refMpReviewTitle: r.refMpReviewTitle
        }));
    } catch (err) {
      console.error('获取笔记列表失败:', err);
      return [];
    }
  },

  // 获取划线列表
  async getBookmarks(cookie, bookId) {
    try {
      await this.visitWeRead(cookie);

      const params = new URLSearchParams({ bookId });
      const response = await fetch(`${API.BOOKMARK_LIST}?${params}`, {
        method: 'GET',
        headers: { 'Cookie': cookie }
      });

      if (!response.ok) {
        const data = await response.json();
        const errcode = data.errcode || 0;
        if (errcode === -2012 || errcode === -2010) {
          console.error('微信读书Cookie过期了');
        }
        throw new Error(`获取划线列表失败: ${JSON.stringify(data)}`);
      }

      const data = await response.json();
      if (!data.updated || !data.updated.length) return [];

      let chapters = {};
      if (data.chapters && data.chapters.length) {
        chapters = data.chapters.reduce((acc, ch) => {
          acc[ch.chapterUid] = ch;
          return acc;
        }, {});
      }

      return data.updated.map(bm => ({
        bookId,
        chapterUid: bm.chapterUid,
        chapterTitle: chapters[bm.chapterUid]?.title || '未知章节',
        createTime: bm.createTime,
        markText: bm.markText,
        bookmarkId: bm.bookmarkId
      }));
    } catch (err) {
      console.error('获取划线列表失败:', err);
      return [];
    }
  }
};

// ============ Markdown 转换 ============
const MarkdownExporter = {
  formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('zh-CN');
  },

  escapeMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');
  },

  formatBook(book, notes, bookmarks) {
    let md = `# 《${book.title}》\n\n`;
    md += `> 作者：${book.author || '未知'}\n\n`;

    // 按章节分组
    const byChapter = {};

    (notes || []).forEach(note => {
      const chapter = note.chapterTitle || '未分类';
      if (!byChapter[chapter]) byChapter[chapter] = { notes: [], bookmarks: [] };
      byChapter[chapter].notes.push(note);
    });

    (bookmarks || []).forEach(bm => {
      const chapter = bm.chapterTitle || '未分类';
      if (!byChapter[chapter]) byChapter[chapter] = { notes: [], bookmarks: [] };
      byChapter[chapter].bookmarks.push(bm);
    });

    // 生成 Markdown
    for (const [chapterTitle, { notes, bookmarks }] of Object.entries(byChapter)) {
      md += `## ${chapterTitle}\n\n`;

      bookmarks.forEach(bm => {
        md += `### 划线\n`;
        md += `> ${this.escapeMarkdown(bm.markText || '')}\n\n`;
        md += `*${this.formatTime(bm.createTime)}*\n\n`;
        md += `---\n\n`;
      });

      notes.forEach(note => {
        md += `### 笔记\n`;
        md += `${note.markText || ''}\n\n`;
        if (note.content) {
          md += `${note.content}\n\n`;
        }
        md += `*${this.formatTime(note.createTime)}*\n\n`;
        md += `---\n\n`;
      });
    }

    return md;
  },

  formatAllBooks(booksData) {
    return booksData
      .map(({ book, notes, bookmarks }) => this.formatBook(book, notes, bookmarks))
      .join('\n\n---\n\n');
  }
};

// ============ 导出状态管理 ============
let exportState = {
  isExporting: false,
  current: 0,
  total: 0,
  bookTitle: '',
  results: [],
  markdown: '',
  error: null
};

async function saveExportState() {
  await chrome.storage.local.set({ exportState });
}

async function loadExportState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['exportState'], (result) => {
      if (result.exportState) {
        exportState = result.exportState;
      }
      resolve();
    });
  });
}

function clearExportState() {
  exportState = {
    isExporting: false,
    current: 0,
    total: 0,
    bookTitle: '',
    results: [],
    markdown: '',
    error: null
  };
  chrome.storage.local.set({ exportState });
}

// ============ 消息处理 ============
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const { action, cookie } = message;

    try {
      switch (action) {
        case 'getBooks': {
          if (!cookie) {
            sendResponse({ success: false, error: '未提供 Cookie' });
            return;
          }
          const { offset = 0, limit = 50, sortBy = 'title', sortOrder = 'asc', search = '' } = message;
          const result = await WeReadAPI.getBookshelfPaged(cookie, { offset, limit, sortBy, sortOrder, search });
          sendResponse({ success: true, ...result });
          break;
        }

        case 'exportBook': {
          if (!cookie) {
            sendResponse({ success: false, error: '未提供 Cookie' });
            return;
          }
          const { bookId } = message;
          await delay(100);
          const book = await WeReadAPI.getBookInfo(cookie, bookId);
          if (!book) {
            sendResponse({ success: false, error: '获取书籍信息失败' });
            return;
          }
          await delay(100);
          const [notes, bookmarks] = await Promise.all([
            WeReadAPI.getReviews(cookie, bookId),
            WeReadAPI.getBookmarks(cookie, bookId)
          ]);
          const markdown = MarkdownExporter.formatBook(book, notes, bookmarks);
          sendResponse({
            success: true,
            markdown,
            book,
            notesCount: notes.length,
            bookmarksCount: bookmarks.length
          });
          break;
        }

        case 'exportAll': {
          if (!cookie) {
            sendResponse({ success: false, error: '未提供 Cookie' });
            return;
          }
          const books = await WeReadAPI.getBookshelf(cookie);
          if (!books || books.length === 0) {
            sendResponse({ success: true, markdown: '', books: [], message: '书架为空' });
            return;
          }

          const results = [];

          for (const book of books) {
            await delay(150);
            try {
              const [notes, bookmarks] = await Promise.all([
                WeReadAPI.getReviews(cookie, book.bookId),
                WeReadAPI.getBookmarks(cookie, book.bookId)
              ]);
              results.push({ book, notes, bookmarks });
            } catch (e) {
              console.error(`导出《${book.title}》失败:`, e);
            }

            chrome.runtime.sendMessage({
              action: 'exportProgress',
              current: results.length,
              total: books.length,
              bookTitle: book.title
            });
          }

          const markdown = MarkdownExporter.formatAllBooks(results);
          sendResponse({ success: true, markdown, books: results });
          break;
        }

        case 'exportSelected': {
          if (!cookie) {
            sendResponse({ success: false, error: '未提供 Cookie' });
            return;
          }
          const { bookIds, exportOptions } = message;
          const { includeNotes = true, includeBookmarks = true } = exportOptions || {};
          if (!bookIds || bookIds.length === 0) {
            sendResponse({ success: true, markdown: '', books: [], message: '未选择书籍' });
            return;
          }

          // 初始化导出状态
          exportState = {
            isExporting: true,
            current: 0,
            total: bookIds.length,
            bookTitle: '',
            results: [],
            markdown: '',
            error: null
          };
          await saveExportState();

          // 在后台处理导出
          for (let i = 0; i < bookIds.length; i++) {
            const bookId = bookIds[i];
            await delay(150);
            try {
              const book = await WeReadAPI.getBookInfo(cookie, bookId);
              if (!book) continue;
              const [notes, bookmarks] = await Promise.all([
                includeNotes ? WeReadAPI.getReviews(cookie, bookId) : Promise.resolve([]),
                includeBookmarks ? WeReadAPI.getBookmarks(cookie, bookId) : Promise.resolve([])
              ]);
              exportState.results.push({ book, notes, bookmarks });
              exportState.bookTitle = book.title;
            } catch (e) {
              console.error(`导出书籍 ${bookId} 失败:`, e);
            }
            exportState.current = i + 1;
            await saveExportState();

            // 发送进度更新
            chrome.runtime.sendMessage({
              action: 'exportProgress',
              current: exportState.current,
              total: exportState.total,
              bookTitle: exportState.bookTitle
            });
          }

          exportState.markdown = MarkdownExporter.formatAllBooks(exportState.results);
          exportState.isExporting = false;
          await saveExportState();

          sendResponse({
            success: true,
            markdown: exportState.markdown,
            books: exportState.results
          });
          break;
        }

        case 'getExportStatus': {
          await loadExportState();
          sendResponse({
            isExporting: exportState.isExporting,
            current: exportState.current,
            total: exportState.total,
            bookTitle: exportState.bookTitle,
            results: exportState.results,
            markdown: exportState.markdown,
            error: exportState.error
          });
          break;
        }

        case 'clearExport': {
          clearExportState();
          sendResponse({ success: true });
          break;
        }

        case 'ping':
          sendResponse({ success: true, timestamp: Date.now() });
          break;

        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (err) {
      console.error('Message handler error:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();
  return true;
});

// 点击扩展图标时打开侧边栏
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.setOptions({ path: 'sidepanel.html' });
    await chrome.sidePanel.open();
  } catch (err) {
    console.error('打开侧边栏失败:', err);
  }
});

// 默认启用侧边栏
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});