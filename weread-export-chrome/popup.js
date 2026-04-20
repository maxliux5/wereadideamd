/**
 * 微信读书笔记导出 - Popup Script
 */

document.addEventListener('DOMContentLoaded', init);

let currentMarkdown = '';

async function init() {
  const statusIcon = document.getElementById('statusIcon');
  const statusTitle = document.getElementById('statusTitle');
  const statusDesc = document.getElementById('statusDesc');
  const bookList = document.getElementById('bookList');
  const bookCount = document.getElementById('bookCount');
  const refreshBtn = document.getElementById('refreshBtn');
  const exportAllBtn = document.getElementById('exportSelectedBtn');
  const toggleSelectBtn = document.getElementById('toggleSelectBtn');
  const exportResult = document.getElementById('exportResult');
  const progress = document.getElementById('progress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');

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

  async function loadBooks() {
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

      const response = await chrome.runtime.sendMessage({ action: 'getBooks', cookie });

      if (response && response.success) {
        const books = response.books || [];
        if (bookCount) bookCount.textContent = `(${books.length} 本)`;
        setStatus('success', '已连接', `${books.length} 本书`);

        if (books.length === 0) {
          if (bookList) bookList.innerHTML = '<div class="empty">书架为空</div>';
        } else {
          if (bookList) {
            bookList.innerHTML = books.map(book => `
              <div class="book-item" data-book-id="${escapeHtml(book.bookId)}">
                <input type="checkbox" id="book-${escapeHtml(book.bookId)}" checked />
                <label class="book-title" for="book-${escapeHtml(book.bookId)}" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</label>
                <span class="book-count">${escapeHtml(book.author || '')}</span>
              </div>
            `).join('');
          }
        }
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
      refreshBtn.textContent = '刷新列表';
    }
  }

  // 刷新按钮
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadBooks);
  }

  // 反选按钮
  if (toggleSelectBtn) {
    toggleSelectBtn.addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('#bookList input[type="checkbox"]');
      checkboxes.forEach(cb => cb.checked = !cb.checked);
    });
  }

  // 导出按钮
  if (exportAllBtn) {
    exportAllBtn.addEventListener('click', async () => {
      const selectedBooks = [];
      document.querySelectorAll('#bookList input[type="checkbox"]:checked').forEach(cb => {
        const bookId = cb.closest('.book-item')?.dataset.bookId;
        const bookTitle = cb.closest('.book-item')?.querySelector('.book-title')?.textContent;
        if (bookId) selectedBooks.push({ bookId, title: bookTitle });
      });

      if (selectedBooks.length === 0) {
        if (exportResult) exportResult.innerHTML = '<div class="empty">请先选择要导出的书籍</div>';
        return;
      }

      exportAllBtn.disabled = true;
      exportAllBtn.textContent = '导出中...';

      if (progress) progress.style.display = 'block';
      if (progressText) progressText.textContent = '正在获取书籍列表...';
      if (progressFill) progressFill.style.width = '10%';
      if (exportResult) exportResult.innerHTML = '';

      try {
        const cookie = await getCookieFromWeRead();

        if (!cookie) {
          setStatus('error', '需要登录', '请在 weread.qq.com 登录后重试');
          if (exportResult) exportResult.innerHTML = '<div class="empty" style="color: #e74c3c;">未找到 Cookie，请先登录</div>';
          exportAllBtn.disabled = false;
          exportAllBtn.textContent = '导出全部';
          return;
        }

        const response = await chrome.runtime.sendMessage({
            action: 'exportSelected',
            cookie,
            bookIds: selectedBooks.map(b => b.bookId)
          });

        if (response && response.success) {
          currentMarkdown = response.markdown || '';

          const booksData = response.books || [];
          const totalBooks = booksData.length;
          let totalNotes = 0;
          let totalBookmarks = 0;

          for (const b of booksData) {
            totalNotes += (b.notes && Array.isArray(b.notes)) ? b.notes.length : 0;
            totalBookmarks += (b.bookmarks && Array.isArray(b.bookmarks)) ? b.bookmarks.length : 0;
          }

          const summaryHtml = `
            <div class="result-summary">
              <strong>导出成功！</strong><br/>
              共 ${totalBooks} 本书<br/>
              ${totalNotes} 条笔记，${totalBookmarks} 条划线<br/>
              导出时间: ${formatTime(new Date())}
            </div>
            <div class="result-actions">
              <button class="btn btn-primary" id="downloadBtn">下载 Markdown</button>
              <button class="btn btn-secondary" id="copyBtn">复制内容</button>
            </div>
          `;
          if (exportResult) exportResult.innerHTML = summaryHtml;

          // 绑定按钮
          const downloadBtn = document.getElementById('downloadBtn');
          const copyBtn = document.getElementById('copyBtn');
          if (downloadBtn) downloadBtn.addEventListener('click', downloadMarkdown);
          if (copyBtn) copyBtn.addEventListener('click', copyMarkdown);

          if (progressFill) progressFill.style.width = '100%';
          if (progressText) progressText.textContent = '导出完成';
          setStatus('success', '导出完成', `${totalBooks} 本书已导出`);
        } else {
          const errMsg = (response && response.error) ? response.error : '未知错误';
          if (exportResult) exportResult.innerHTML = `<div class="empty" style="color: #721c24;">导出失败: ${escapeHtml(errMsg)}</div>`;
          setStatus('error', '导出失败', errMsg);
        }
      } catch (err) {
        if (exportResult) exportResult.innerHTML = `<div class="empty" style="color: #721c24;">导出失败: ${escapeHtml(err.message)}</div>`;
        setStatus('error', '导出失败', err.message);
      }

      exportAllBtn.disabled = false;
      exportAllBtn.textContent = '导出所选';
    });
  }

  // 下载功能
  function downloadMarkdown() {
    if (!currentMarkdown) return;

    const blob = new Blob([currentMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = formatTime(new Date()).replace(/[/:]/g, '-').replace(/ /g, '_');
    a.href = url;
    a.download = `微信读书笔记_${timestamp}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  // 初始化：检查 cookie
  const cookie = await getCookieFromWeRead();

  if (cookie) {
    setStatus('success', '已连接', '正在加载书架...');
    loadBooks();
  } else {
    setStatus('error', '需要登录', '请在 weread.qq.com 登录');
    if (bookList) bookList.innerHTML = '<div class="empty" style="color: #e74c3c;">未找到 Cookie<br/><small>请在 weread.qq.com 登录后使用</small></div>';
  }
}