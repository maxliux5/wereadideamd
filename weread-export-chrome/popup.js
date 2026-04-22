/**
 * 微信读书笔记导出 - Popup Script
 */

document.addEventListener('DOMContentLoaded', init);

let currentMarkdown = '';
let currentBooksData = []; // 包含封面信息的书籍数据
let allBooks = []; // 所有书籍
let currentPage = 0;
let pageSize = 50;
let totalBooks = 0;
let currentSortBy = 'title';
let currentSortOrder = 'asc';
let currentSearch = '';

async function init() {
  const statusIcon = document.getElementById('statusIcon');
  const statusTitle = document.getElementById('statusTitle');
  const statusDesc = document.getElementById('statusDesc');
  const bookList = document.getElementById('bookList');
  const bookCount = document.getElementById('bookCount');
  const refreshBtn = document.getElementById('refreshBtn');
  const exportAllBtn = document.getElementById('exportAllBtn');
  const exportSelectedBtn = document.getElementById('exportSelectedBtn');
  const toggleSelectBtn = document.getElementById('toggleSelectBtn');
  const selectAllBtn = document.getElementById('selectAllBtn');
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');
  const pageInfo = document.getElementById('pageInfo');
  const sortSelect = document.getElementById('sortSelect');
  const sortOrderSelect = document.getElementById('sortOrder');
  const searchInput = document.getElementById('searchInput');
  const progress = document.getElementById('progressSection');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const resultSection = document.getElementById('resultSection');
  const resultText = document.getElementById('resultText');

  function setStatus(type, title, desc) {
    if (statusIcon) statusIcon.textContent = type === 'success' ? '✓' : type === 'error' ? '✗' : '...';
    if (statusIcon && type === 'error') statusIcon.style.background = '#e74c3c';
    if (statusTitle) statusTitle.textContent = title;
    if (statusDesc) statusDesc.textContent = desc;
  }

  function formatTime(date) {
    return date.toLocaleString('zh-CN');
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function getCookieFromWeRead() {
    return new Promise((resolve) => {
      chrome.cookies.getAll({ domain: '.weread.qq.com' }, (cookies) => {
        if (!cookies || cookies.length === 0) {
          resolve(null);
          return;
        }
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        resolve(cookieStr);
      });
    });
  }

  async function loadBooksPage(page = 0) {
    if (refreshBtn) refreshBtn.disabled = true;
    if (bookList) bookList.innerHTML = '<div class="empty"><span class="loading"></span>加载中...</div>';

    try {
      const cookie = await getCookieFromWeRead();

      if (!cookie) {
        setStatus('error', '需要登录', '请在 weread.qq.com 登录后重试');
        if (bookList) bookList.innerHTML = '<div class="empty" style="color: #e74c3c;">未找到 Cookie<br/><small>请刷新页面后重试</small></div>';
        if (refreshBtn) refreshBtn.disabled = false;
        return;
      }

      const offset = page * pageSize;
      const response = await chrome.runtime.sendMessage({
        action: 'getBooks',
        cookie,
        offset,
        limit: pageSize,
        sortBy: currentSortBy,
        sortOrder: currentSortOrder,
        search: currentSearch
      });

      if (response && response.success) {
        allBooks = response.books || [];
        totalBooks = response.total || allBooks.length;
        currentPage = page;

        if (bookCount) bookCount.textContent = `${totalBooks} 本`;
        setStatus('success', '已连接', `${totalBooks} 本书`);

        if (allBooks.length === 0) {
          if (bookList) bookList.innerHTML = '<div class="empty">书架为空</div>';
        } else {
          if (bookList) {
            bookList.innerHTML = allBooks.map(book => `
              <div class="book-item" data-book-id="${escapeHtml(book.bookId)}">
                <input type="checkbox" id="book-${escapeHtml(book.bookId)}" checked />
                <label class="book-title" for="book-${escapeHtml(book.bookId)}" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</label>
                <span class="book-meta">${escapeHtml(book.author || '')}</span>
              </div>
            `).join('');
          }
        }

        // 更新分页信息
        updatePagination();
      } else {
        const errMsg = (response && response.error) ? response.error : '未知错误';
        setStatus('error', '获取失败', errMsg);
        if (bookList) bookList.innerHTML = `<div class="empty" style="color: #e74c3c;">加载失败<br/><small>${escapeHtml(errMsg)}</small></div>`;
      }
    } catch (err) {
      setStatus('error', '加载失败', err.message);
      if (bookList) bookList.innerHTML = '<div class="empty">加载失败</div>';
    }

    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = '刷新';
    }
  }

  function updatePagination() {
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInfo = document.getElementById('pageInfo');

    const totalPages = Math.ceil(totalBooks / pageSize);
    const start = totalBooks > 0 ? currentPage * pageSize + 1 : 0;
    const end = Math.min((currentPage + 1) * pageSize, totalBooks);

    if (pageInfo) pageInfo.textContent = `${start}-${end} / ${totalBooks}`;
    if (prevPageBtn) prevPageBtn.disabled = currentPage === 0;
    if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages - 1;
  }

  // 加载所有书籍（用于导出全部）
  async function loadAllBooks() {
    const cookie = await getCookieFromWeRead();
    if (!cookie) return [];

    let offset = 0;
    let allBooksResult = [];
    const tempPageSize = 100;

    while (true) {
      const response = await chrome.runtime.sendMessage({
        action: 'getBooks',
        cookie,
        offset,
        limit: tempPageSize,
        sortBy: 'title',
        sortOrder: 'asc',
        search: ''
      });

      if (response && response.success && response.books && response.books.length > 0) {
        allBooksResult = allBooksResult.concat(response.books);
        if (response.books.length < tempPageSize) break;
        offset += tempPageSize;
      } else {
        break;
      }
    }

    return allBooksResult;
  }

  // 刷新按钮
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadBooksPage(0));
  }

  // 上一页
  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
      if (currentPage > 0) loadBooksPage(currentPage - 1);
    });
  }

  // 下一页
  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      loadBooksPage(currentPage + 1);
    });
  }

  // 排序变化
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      currentSortBy = sortSelect.value;
      loadBooksPage(0);
    });
  }

  // 排序顺序变化
  if (sortOrderSelect) {
    sortOrderSelect.addEventListener('change', () => {
      currentSortOrder = sortOrderSelect.value;
      loadBooksPage(0);
    });
  }

  // 搜索
  let searchTimeout;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentSearch = searchInput.value.trim();
        loadBooksPage(0);
      }, 300);
    });
  }

  // 全选按钮
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('#bookList input[type="checkbox"]');
      const allChecked = Array.from(checkboxes).every(cb => cb.checked);
      checkboxes.forEach(cb => cb.checked = !allChecked);
    });
  }

  // 反选按钮
  if (toggleSelectBtn) {
    toggleSelectBtn.addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('#bookList input[type="checkbox"]');
      checkboxes.forEach(cb => cb.checked = !cb.checked);
    });
  }

  // 执行导出
  async function doExport(bookIds, isAll) {
    if (bookIds.length === 0) {
      if (resultSection) {
        resultSection.style.display = 'block';
        resultText.innerHTML = '<div style="color: #721c24;">请先选择要导出的书籍</div>';
      }
      return;
    }

    if (exportAllBtn) exportAllBtn.disabled = true;
    if (exportSelectedBtn) exportSelectedBtn.disabled = true;

    if (progress) progress.style.display = 'block';
    if (progressText) progressText.textContent = '正在获取书籍列表...';
    if (progressFill) progressFill.style.width = '10%';
    if (resultSection) resultSection.style.display = 'none';

    try {
      const cookie = await getCookieFromWeRead();

      // 读取导出选项
      const exportNotes = document.getElementById('exportNotes')?.checked ?? true;
      const exportBookmarks = document.getElementById('exportBookmarks')?.checked ?? true;
      const exportBestReviews = document.getElementById('exportBestReviews')?.checked ?? false;

      if (!cookie) {
        setStatus('error', '需要登录', '请在 weread.qq.com 登录后重试');
        if (resultSection) {
          resultSection.style.display = 'block';
          resultText.innerHTML = '<div style="color: #e74c3c;">未找到 Cookie，请先登录</div>';
        }
        if (exportAllBtn) exportAllBtn.disabled = false;
        if (exportSelectedBtn) exportSelectedBtn.disabled = false;
        return;
      }

      const response = await chrome.runtime.sendMessage({
        action: 'exportSelected',
        cookie,
        bookIds: bookIds,
        exportOptions: {
          includeNotes: exportNotes,
          includeBookmarks: exportBookmarks,
          includeBestReviews: exportBestReviews
        }
      });

      if (response && response.success) {
        currentMarkdown = response.markdown || '';
        currentBooksData = response.books || [];
        const totalBooks = currentBooksData.length;
        let totalNotes = 0;
        let totalBookmarks = 0;
        let totalBestReviews = 0;

        for (const b of currentBooksData) {
          totalNotes += (b.notes && Array.isArray(b.notes)) ? b.notes.length : 0;
          totalBookmarks += (b.bookmarks && Array.isArray(b.bookmarks)) ? b.bookmarks.length : 0;
          totalBestReviews += (b.bestReviews && Array.isArray(b.bestReviews)) ? b.bestReviews.length : 0;
        }

        if (resultSection) {
          resultSection.style.display = 'block';
          resultText.innerHTML = `
            <strong>导出成功！</strong><br/>
            共 ${totalBooks} 本书<br/>
            ${totalNotes} 条笔记，${totalBookmarks} 条划线${totalBestReviews > 0 ? `，${totalBestReviews} 条热门评论` : ''}<br/>
            <small style="color: #666;">导出时间: ${formatTime(new Date())}</small>
          `;
        }

        if (progressFill) progressFill.style.width = '100%';
        if (progressText) progressText.textContent = '导出完成';
        setStatus('success', '导出完成', `${totalBooks} 本书已导出`);
      } else {
        const errMsg = (response && response.error) ? response.error : '未知错误';
        if (resultSection) {
          resultSection.style.display = 'block';
          resultText.innerHTML = `
            <div style="color: #721c24;">导出中断: ${escapeHtml(errMsg)}</div>
            <div style="font-size: 11px; margin-top: 8px; color: #666;">可点击下方按钮重试，或刷新页面后重新导出</div>
          `;
        }
        setStatus('error', '导出中断', '点击按钮重试');
      }
    } catch (err) {
      if (resultSection) {
        resultSection.style.display = 'block';
        resultText.innerHTML = `
          <div style="color: #721c24;">导出失败: ${escapeHtml(err.message)}</div>
          <div style="font-size: 11px; margin-top: 8px; color: #666;">可点击下方按钮重试，或刷新页面后重新导出</div>
        `;
      }
      setStatus('error', '导出失败', '点击按钮重试');
    }

    if (exportAllBtn) exportAllBtn.disabled = false;
    if (exportSelectedBtn) exportSelectedBtn.disabled = false;
  }

  // 刷新并重试当前导出选项
  function retryExport() {
    if (progress) progress.style.display = 'none';
    if (resultSection) resultSection.style.display = 'none';
    currentMarkdown = '';
    currentBooksData = [];
  }

  // 导出全部按钮
  if (exportAllBtn) {
    exportAllBtn.addEventListener('click', async () => {
      // 显示进度
      if (progress) progress.style.display = 'block';
      if (progressText) progressText.textContent = '正在获取所有书籍...';
      if (progressFill) progressFill.style.width = '10%';

      // 获取所有书籍
      const books = await loadAllBooks();
      if (books.length === 0) {
        if (resultSection) {
          resultSection.style.display = 'block';
          resultText.innerHTML = '<div style="color: #721c24;">未找到书籍，请刷新重试</div>';
        }
        if (progress) progress.style.display = 'none';
        return;
      }

      const bookIds = books.map(b => b.bookId);
      await doExport(bookIds, true);
    });
  }

  // 导出所选按钮
  if (exportSelectedBtn) {
    exportSelectedBtn.addEventListener('click', async () => {
      const selectedBooks = [];
      document.querySelectorAll('#bookList input[type="checkbox"]:checked').forEach(cb => {
        const bookId = cb.closest('.book-item')?.dataset.bookId;
        if (bookId) selectedBooks.push(bookId);
      });
      await doExport(selectedBooks, false);
    });
  }

  // 下载功能（ZIP 包含 Markdown 和封面图片）
  async function downloadMarkdown() {
    if (!currentMarkdown) return;

    const exportCovers = document.getElementById('exportCovers')?.checked ?? true;
    const timestamp = formatTime(new Date()).replace(/[/:]/g, '-').replace(/ /g, '_');

    // 检查 JSZip 是否可用
    if (typeof JSZip !== 'undefined') {
      const zip = new JSZip();

      // 添加 markdown 文件
      zip.file(`微信读书笔记_${timestamp}.md`, currentMarkdown);

      // 下载封面图片
      if (exportCovers) {
        for (const bookData of currentBooksData) {
          const book = bookData.book || bookData;
          if (book.cover) {
            try {
              const coverResponse = await fetch(book.cover);
              const coverBlob = await coverResponse.blob();
              const ext = book.cover.split('.').pop() || 'jpg';
              const filename = `covers/${book.bookId}_${sanitizeFilename(book.title)}.${ext}`;
              zip.file(filename, coverBlob);
            } catch (e) {
              console.warn(`下载封面失败: ${book.title}`, e);
            }
          }
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `微信读书笔记_${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      // JSZip 不可用时，只下载 Markdown
      const blob = new Blob([currentMarkdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `微信读书笔记_${timestamp}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  function sanitizeFilename(name) {
    if (!name) return 'untitled';
    return name.replace(/[\/\\:*?"<>|]/g, '_').substring(0, 50);
  }

  // 复制功能
  async function copyMarkdown() {
    if (!currentMarkdown) return;

    try {
      await navigator.clipboard.writeText(currentMarkdown);
      const copyBtn = document.getElementById('copyBtn');
      if (copyBtn) {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '已复制!';
        setTimeout(() => copyBtn.textContent = originalText, 2000);
      }
    } catch (err) {
      // ignore
    }
  }

  // 监听进度更新
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'exportProgress') {
      const current = message.current || 0;
      const total = message.total || 1;
      const percent = Math.round((current / total) * 90) + 10;
      if (progressFill) progressFill.style.width = `${percent}%`;
      if (progressText) progressText.textContent = `正在导出: ${message.bookTitle || ''} (${current}/${total})`;
    }
  });

  // 下载按钮
  const downloadBtn = document.getElementById('downloadBtn');
  const copyBtn = document.getElementById('copyBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => downloadMarkdown());
  }
  if (copyBtn) {
    copyBtn.addEventListener('click', copyMarkdown);
  }

  // 初始化：检查 cookie
  const cookie = await getCookieFromWeRead();

  if (cookie) {
    setStatus('success', '已连接', '正在加载书架...');
    loadBooksPage(0);
  } else {
    setStatus('error', '需要登录', '请在 weread.qq.com 登录');
    if (bookList) bookList.innerHTML = '<div class="empty" style="color: #e74c3c;">未找到 Cookie<br/><small>请在 weread.qq.com 登录后使用</small></div>';
  }
}