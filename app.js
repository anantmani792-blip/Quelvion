/* ============================================================
   QUELVION — Frontend App
   Author: Anant Mani Tripathi
   Real chat engine: streaming, voice, files, sidebar, settings
   ============================================================ */

(() => {
  'use strict';

  /* ============ STATE ============ */
  const state = {
    user: null,
    conversations: [],
    currentId: null,
    currentConv: null,
    messages: [],
    attachments: [],
    streaming: false,
    controller: null,
    recognition: null,
    recording: false,
  };

  /* ============ DOM ============ */
  const $ = (id) => document.getElementById(id);
  const els = {
    app: $('app'),
    sidebar: $('sidebar'),
    convList: $('convList'),
    search: $('search'),
    newChat: $('newChat'),
    closeSidebar: $('closeSidebar'),
    openSidebar: $('openSidebar'),
    openSidebarFloat: $('openSidebarFloat'),
    messages: $('messages'),
    welcome: $('welcome'),
    convTitle: $('convTitle'),
    composer: $('composer'),
    input: $('input'),
    sendBtn: $('sendBtn'),
    stopBtn: $('stopBtn'),
    attachBtn: $('attachBtn'),
    fileInput: $('fileInput'),
    voiceBtn: $('voiceBtn'),
    attachments: $('attachments'),
    userMenu: $('userMenu'),
    userMenuBox: $('userMenuBox'),
    avatar: $('avatar'),
    userName: $('userName'),
    themeBtn: $('themeBtn'),
    settingsModal: $('settingsModal'),
    setName: $('setName'),
    setLang: $('setLang'),
    setVoice: $('setVoice'),
    closeSettings: $('closeSettings'),
    saveSettings: $('saveSettings'),
    confirmModal: $('confirmModal'),
    cfText: $('cfText'),
    cfCancel: $('cfCancel'),
    cfOk: $('cfOk'),
    toasts: $('toasts'),
  };

  /* ============ HELPERS ============ */
  const api = async (url, opts = {}) => {
    const res = await fetch(url, {
      credentials: 'include',
      headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (res.status === 401) {
      location.href = '/login';
      throw new Error('unauthorized');
    }
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json().catch(() => ({})) : {};
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };

  const escapeHtml = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const timeAgo = (ts) => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    if (s < 604800) return `${Math.floor(s / 86400)}d`;
    return new Date(ts).toLocaleDateString();
  };

  /* Simple, safe Markdown renderer (no external deps) */
  const renderMarkdown = (text) => {
    let html = escapeHtml(text);

    // Code blocks
    const codeBlocks = [];
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_m, lang, code) => {
      const i = codeBlocks.length;
      codeBlocks.push(`<pre><code class="lang-${lang || 'text'}">${code.replace(/\n$/, '')}</code></pre>`);
      return `\u0000CB${i}\u0000`;
    });

    // Inline code
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Bold, italic
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

    // Headings
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Blockquote
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Lists
    html = html.replace(/(?:^|\n)((?:[-*] .+(?:\n|$))+)/g, (m) => {
      const items = m.trim().split('\n').map((l) => `<li>${l.replace(/^[-*] /, '')}</li>`).join('');
      return `\n<ul>${items}</ul>`;
    });
    html = html.replace(/(?:^|\n)((?:\d+\. .+(?:\n|$))+)/g, (m) => {
      const items = m.trim().split('\n').map((l) => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
      return `\n<ol>${items}</ol>`;
    });

    // Links
    html = html.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Paragraphs
    html = html
      .split(/\n{2,}/)
      .map((chunk) => {
        const t = chunk.trim();
        if (!t) return '';
        if (/^<(h\d|ul|ol|pre|blockquote|table)/.test(t)) return t;
        return `<p>${t.replace(/\n/g, '<br/>')}</p>`;
      })
      .join('\n');

    // Restore code blocks
    html = html.replace(/\u0000CB(\d+)\u0000/g, (_m, i) => codeBlocks[Number(i)] || '');
    return html;
  };

  /* ============ TOAST ============ */
  const toast = (msg, type = '') => {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    els.toasts.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      el.style.transition = '0.25s';
      setTimeout(() => el.remove(), 250);
    }, 3200);
  };

  /* ============ THEME ============ */
  const applyTheme = (t) => {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('quelvion_theme', t);
  };
  const initTheme = () => {
    const saved = localStorage.getItem('quelvion_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefersDark ? 'dark' : 'light'));
  };
  const toggleTheme = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  };
  els.themeBtn?.addEventListener('click', toggleTheme);

  /* ============ SIDEBAR (mobile) ============ */
  const openSidebar = () => {
    els.app.classList.add('sidebar-open');
    if (!document.querySelector('.sidebar-backdrop')) {
      const bd = document.createElement('div');
      bd.className = 'sidebar-backdrop';
      bd.addEventListener('click', closeSidebar);
      document.body.appendChild(bd);
    }
  };
  const closeSidebar = () => {
    els.app.classList.remove('sidebar-open');
    document.querySelector('.sidebar-backdrop')?.remove();
  };
  els.openSidebar?.addEventListener('click', openSidebar);
  els.openSidebarFloat?.addEventListener('click', openSidebar);
  els.closeSidebar?.addEventListener('click', closeSidebar);

  /* ============ USER MENU ============ */
  els.userMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = els.userMenuBox.hasAttribute('hidden');
    if (isHidden) {
      els.userMenuBox.removeAttribute('hidden');
      els.userMenu.setAttribute('aria-expanded', 'true');
    } else {
      els.userMenuBox.setAttribute('hidden', '');
      els.userMenu.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('click', () => {
    els.userMenuBox?.setAttribute('hidden', '');
    els.userMenu?.setAttribute('aria-expanded', 'false');
  });
  els.userMenuBox?.addEventListener('click', async (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (!act) return;
    els.userMenuBox.setAttribute('hidden', '');
    if (act === 'logout') {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      location.href = '/login';
    } else if (act === 'theme') {
      toggleTheme();
    } else if (act === 'settings') {
      openSettings();
    } else if (act === 'admin') {
      location.href = '/admin';
    }
  });

  /* ============ SETTINGS MODAL ============ */
  const openSettings = () => {
    els.setName.value = state.user?.name || '';
    els.setLang.value = state.user?.language || 'auto';
    els.setVoice.checked = !!state.user?.voice_enabled;
    els.settingsModal.removeAttribute('hidden');
  };
  const closeSettings = () => els.settingsModal.setAttribute('hidden', '');
  els.closeSettings?.addEventListener('click', closeSettings);
  els.settingsModal?.addEventListener('click', (e) => {
    if (e.target === els.settingsModal) closeSettings();
  });
  els.saveSettings?.addEventListener('click', async () => {
    try {
      await api('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: els.setName.value.trim() || undefined,
          language: els.setLang.value,
          voice_enabled: els.setVoice.checked,
        }),
      });
      state.user.name = els.setName.value.trim() || state.user.name;
      state.user.language = els.setLang.value;
      state.user.voice_enabled = els.setVoice.checked ? 1 : 0;
      updateUserUI();
      closeSettings();
      toast('Settings saved', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  /* ============ CONFIRM MODAL ============ */
  let confirmResolver = null;
  const confirmDialog = (text, okLabel = 'Delete') => {
    els.cfText.textContent = text;
    els.cfOk.textContent = okLabel;
    els.confirmModal.removeAttribute('hidden');
    return new Promise((resolve) => { confirmResolver = resolve; });
  };
  const closeConfirm = (val) => {
    els.confirmModal.setAttribute('hidden', '');
    if (confirmResolver) { confirmResolver(val); confirmResolver = null; }
  };
  els.cfCancel?.addEventListener('click', () => closeConfirm(false));
  els.cfOk?.addEventListener('click', () => closeConfirm(true));
  els.confirmModal?.addEventListener('click', (e) => {
    if (e.target === els.confirmModal) closeConfirm(false);
  });

  /* ============ USER UI ============ */
  const updateUserUI = () => {
    if (!state.user) return;
    const name = state.user.name || 'User';
    els.userName.textContent = name;
    els.avatar.textContent = name.charAt(0).toUpperCase();
    if (state.user.role === 'admin') {
      const adminBtn = els.userMenuBox.querySelector('[data-act="admin"]');
      adminBtn?.removeAttribute('hidden');
    }
  };

  /* ============ CONVERSATIONS ============ */
  const renderConvList = (list) => {
    state.conversations = list;
    if (!list.length) {
      els.convList.innerHTML = `<div class="conv-empty">No chats yet.<br/>Start a new chat →</div>`;
      return;
    }
    els.convList.innerHTML = '';
    for (const c of list) {
      const el = document.createElement('button');
      el.className = 'conv-item' + (c.id === state.currentId ? ' active' : '');
      el.dataset.id = c.id;
      el.innerHTML = `
        <span class="conv-title">${escapeHtml(c.title || 'New chat')}</span>
        <span class="conv-actions">
          <button data-act="rename" title="Rename" aria-label="Rename">✎</button>
          <button data-act="delete" title="Delete" aria-label="Delete" class="danger">🗑</button>
        </span>
      `;
      el.addEventListener('click', (e) => {
        const act = e.target.closest('button')?.dataset.act;
        if (act === 'rename') { e.stopPropagation(); renameConv(c.id, c.title); return; }
        if (act === 'delete') { e.stopPropagation(); deleteConv(c.id); return; }
        selectConv(c.id);
      });
      els.convList.appendChild(el);
    }
  };

  const loadConversations = async (q = '') => {
    try {
      const url = q ? `/api/conversations?q=${encodeURIComponent(q)}` : '/api/conversations';
      const { conversations } = await api(url);
      renderConvList(conversations || []);
    } catch (e) { toast(e.message, 'error'); }
  };

  const newConversation = async () => {
    try {
      const c = await api('/api/conversations', { method: 'POST' });
      state.currentId = c.id;
      state.currentConv = c;
      state.messages = [];
      els.convTitle.textContent = c.title;
      showWelcome(true);
      await loadConversations(els.search.value.trim());
      closeSidebar();
      els.input.focus();
    } catch (e) { toast(e.message, 'error'); }
  };

  const selectConv = async (id) => {
    state.currentId = id;
    try {
      const { conversation, messages } = await api(`/api/conversations/${id}/messages`);
      state.currentConv = conversation;
      state.messages = messages || [];
      els.convTitle.textContent = conversation.title || 'New chat';
      renderMessages();
      closeSidebar();
      document.querySelectorAll('.conv-item').forEach((el) => {
        el.classList.toggle('active', el.dataset.id === id);
      });
    } catch (e) { toast(e.message, 'error'); }
  };

  const renameConv = async (id, current) => {
    const name = prompt('Rename chat:', current || '');
    if (!name || name.trim() === current) return;
    try {
      await api(`/api/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ title: name.trim() }) });
      if (id === state.currentId) els.convTitle.textContent = name.trim();
      await loadConversations(els.search.value.trim());
      toast('Renamed', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  const deleteConv = async (id) => {
    const ok = await confirmDialog('Delete this conversation? This cannot be undone.');
    if (!ok) return;
    try {
      await api(`/api/conversations/${id}`, { method: 'DELETE' });
      if (id === state.currentId) {
        state.currentId = null;
        state.currentConv = null;
        state.messages = [];
        els.convTitle.textContent = 'Quelvion';
        showWelcome(true);
      }
      await loadConversations(els.search.value.trim());
      toast('Deleted', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };

  els.newChat?.addEventListener('click', newConversation);

  /* search debounced */
  let searchTimer;
  els.search?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadConversations(els.search.value.trim()), 250);
  });

  /* ============ RENDER MESSAGES ============ */
  const showWelcome = (show) => {
    if (show) {
      els.messages.innerHTML = '';
      els.messages.appendChild(els.welcome);
      els.welcome.hidden = false;
    } else {
      els.welcome.hidden = true;
    }
  };

  const ensureInner = () => {
    let inner = els.messages.querySelector('.messages-inner');
    if (!inner) {
      els.messages.innerHTML = '';
      inner = document.createElement('div');
      inner.className = 'messages-inner';
      els.messages.appendChild(inner);
    }
    return inner;
  };

  const messageEl = (m) => {
    const wrap = document.createElement('div');
    wrap.className = `msg ${m.role}`;
    wrap.dataset.id = m.id;
    const initial = m.role === 'assistant' ? 'Q' : (state.user?.name || 'U').charAt(0).toUpperCase();
    wrap.innerHTML = `
      <div class="msg-avatar">${escapeHtml(initial)}</div>
      <div class="msg-body">
        <div class="msg-role">${m.role === 'assistant' ? 'Quelvion' : 'You'}</div>
        <div class="msg-content"></div>
        <div class="msg-actions">
          <button data-act="copy" title="Copy">Copy</button>
          ${m.role === 'assistant' ? '<button data-act="regen" title="Regenerate">Regenerate</button>' : ''}
        </div>
      </div>
    `;
    const content = wrap.querySelector('.msg-content');
    content.innerHTML = renderMarkdown(m.content || '');
    return wrap;
  };

  const renderMessages = () => {
    if (!state.messages.length) { showWelcome(true); return; }
    showWelcome(false);
    const inner = ensureInner();
    inner.innerHTML = '';
    for (const m of state.messages) inner.appendChild(messageEl(m));
    scrollToBottom(true);
  };

  const scrollToBottom = (instant = false) => {
    requestAnimationFrame(() => {
      els.messages.scrollTo({
        top: els.messages.scrollHeight,
        behavior: instant ? 'auto' : 'smooth',
      });
    });
  };

  /* ============ ATTACHMENTS ============ */
  const renderAttachments = () => {
    els.attachments.innerHTML = '';
    for (const a of state.attachments) {
      const chip = document.createElement('div');
      chip.className = 'attach-chip';
      chip.innerHTML = `
        <span class="name">${escapeHtml(a.filename)}</span>
        <button class="x" aria-label="Remove">✕</button>
      `;
      chip.querySelector('.x').addEventListener('click', () => {
        state.attachments = state.attachments.filter((x) => x.id !== a.id);
        renderAttachments();
      });
      els.attachments.appendChild(chip);
    }
  };

  els.attachBtn?.addEventListener('click', () => els.fileInput.click());
  els.fileInput?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const f of files) {
      if (!state.currentId) await newConversation();
      const fd = new FormData();
      fd.append('file', f);
      fd.append('conversation_id', state.currentId);
      try {
        const rec = await api('/api/files', { method: 'POST', body: fd });
        state.attachments.push(rec);
        renderAttachments();
        toast(`Uploaded ${rec.filename}`, 'success');
      } catch (err) { toast(err.message, 'error'); }
    }
  });

  /* ============ VOICE ============ */
  const initVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = state.user?.language === 'hi' ? 'hi-IN' : 'en-IN';
    return r;
  };

  const startVoice = () => {
    if (state.recording) return;
    if (!state.recognition) state.recognition = initVoice();
    if (!state.recognition) { toast('Voice not supported in this browser', 'error'); return; }

    let base = els.input.value;
    state.recording = true;
    els.voiceBtn.style.background = 'var(--danger)';
    els.voiceBtn.style.color = '#fff';

    state.recognition.onresult = (ev) => {
      let interim = '';
      let final = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) final += t; else interim += t;
      }
      els.input.value = (base + ' ' + (final || interim)).trim();
      autoResize();
    };
    state.recognition.onerror = () => { stopVoice(); };
    state.recognition.onend = () => { stopVoice(); };
    try { state.recognition.start(); } catch {}
  };

  const stopVoice = () => {
    state.recording = false;
    els.voiceBtn.style.background = '';
    els.voiceBtn.style.color = '';
    try { state.recognition?.stop(); } catch {}
  };

  els.voiceBtn?.addEventListener('click', () => {
    state.recording ? stopVoice() : startVoice();
  });

  const speak = (text) => {
    if (!state.user?.voice_enabled) return;
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = state.user.language === 'hi' ? 'hi-IN' : 'en-IN';
      u.rate = 1;
      window.speechSynthesis.speak(u);
    } catch {}
  };

  /* ============ COMPOSER ============ */
  const autoResize = () => {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 200) + 'px';
  };
  els.input?.addEventListener('input', autoResize);
  els.input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      els.composer.requestSubmit();
    }
  });

  const setStreaming = (on) => {
    state.streaming = on;
    els.sendBtn.hidden = on;
    els.stopBtn.hidden = !on;
    els.input.disabled = false; // allow typing while streaming (nice UX)
  };

  els.stopBtn?.addEventListener('click', () => {
    state.controller?.abort();
  });

  /* ============ SEND / STREAM ============ */
  const sendMessage = async (text) => {
    if (state.streaming) return;
    text = (text || '').trim();
    if (!text && !state.attachments.length) return;

    if (!state.currentId) await newConversation();
    if (!state.currentId) return;

    showWelcome(false);

    const userMsg = {
      id: 'tmp_' + Date.now(),
      role: 'user',
      content: text,
      attachments: state.attachments.slice(),
    };

    // Push user message in UI
    const inner = ensureInner();
    inner.appendChild(messageEl(userMsg));
    scrollToBottom();

    els.input.value = '';
    autoResize();

    const attachmentsToSend = state.attachments.slice();
    state.attachments = [];
    renderAttachments();

    setStreaming(true);

    // Assistant placeholder
    const aiId = 'ai_' + Date.now();
    const aiWrap = document.createElement('div');
    aiWrap.className = 'msg assistant';
    aiWrap.dataset.id = aiId;
    aiWrap.innerHTML = `
      <div class="msg-avatar">Q</div>
      <div class="msg-body">
        <div class="msg-role">Quelvion</div>
        <div class="msg-content"><div class="typing"><span></span><span></span><span></span></div></div>
        <div class="msg-actions" style="display:none">
          <button data-act="copy">Copy</button>
          <button data-act="regen">Regenerate</button>
        </div>
      </div>
    `;
    inner.appendChild(aiWrap);
    scrollToBottom();

    const contentEl = aiWrap.querySelector('.msg-content');
    const actionsEl = aiWrap.querySelector('.msg-actions');
    let acc = '';

    state.controller = new AbortController();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: state.currentId,
          content: text,
          attachments: attachmentsToSend.map((a) => ({ id: a.id })),
        }),
        signal: state.controller.signal,
      });

      if (res.status === 401) { location.href = '/login'; return; }
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to send');
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();

        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          let ev;
          try { ev = JSON.parse(t.slice(5).trim()); } catch { continue; }

          if (ev.type === 'text') {
            acc += ev.delta;
            contentEl.innerHTML = renderMarkdown(acc);
            scrollToBottom();
          } else if (ev.type === 'tool_call') {
            const note = document.createElement('div');
            note.className = 'msg-error';
            note.style.background = 'var(--accent-soft)';
            note.style.color = 'var(--text)';
            note.textContent = `Using tool: ${ev.name}…`;
            contentEl.appendChild(note);
            scrollToBottom();
          } else if (ev.type === 'tool_result') {
            // silent — final answer will include it
          } else if (ev.type === 'error') {
            throw new Error('Generation failed');
          }
        }
      }

      if (!acc) contentEl.innerHTML = '<p class="muted">(no response)</p>';
      actionsEl.style.display = '';
      scrollToBottom();

      if (state.user?.voice_enabled) speak(acc.replace(/```[\s\S]*?```/g, '').replace(/[#*_`]/g, ''));

      // Update local messages & reload conversation title
      state.messages.push({ id: userMsg.id, role: 'user', content: text });
      state.messages.push({ id: aiId, role: 'assistant', content: acc });
      loadConversations(els.search.value.trim());
    } catch (e) {
      if (e.name === 'AbortError') {
        contentEl.innerHTML = renderMarkdown(acc || '_(stopped)_');
        actionsEl.style.display = '';
      } else {
        contentEl.innerHTML = `<div class="msg-error">${escapeHtml(e.message || 'Something went wrong')}</div>`;
      }
    } finally {
      setStreaming(false);
      state.controller = null;
    }
  };

  els.composer?.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(els.input.value);
  });

  /* Message actions: copy & regenerate (event delegation) */
  els.messages?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.msg-actions button');
    if (!btn) return;
    const msg = btn.closest('.msg');
    const act = btn.dataset.act;

    if (act === 'copy') {
      const text = msg.querySelector('.msg-content')?.innerText || '';
      try {
        await navigator.clipboard.writeText(text);
        toast('Copied', 'success');
      } catch { toast('Copy failed', 'error'); }
    } else if (act === 'regen') {
      if (state.streaming) return;
      try {
        const { messages } = await api(`/api/conversations/${state.currentId}/messages`);
        const last = messages[messages.length - 1];
        if (last && last.role === 'assistant') {
          // ask server to regenerate by re-sending last user message
          const lastUser = [...messages].reverse().find((m) => m.role === 'user');
          if (lastUser) {
            // remove last assistant from UI
            msg.remove();
            await fetch('/api/chat/regenerate', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ conversation_id: state.currentId }),
            });
            // Reload the conversation
            await selectConv(state.currentId);
          }
        }
      } catch (err) { toast(err.message, 'error'); }
    }
  });

  /* Suggestion buttons on welcome */
  els.welcome?.addEventListener('click', (e) => {
    const s = e.target.closest('.suggestion');
    if (!s) return;
    const p = s.dataset.prompt;
    if (p) sendMessage(p);
  });

  /* ============ BOOT ============ */
  const boot = async () => {
    initTheme();
    try {
      const me = await fetch('/api/auth/me', { credentials: 'include' });
      if (!me.ok) { location.href = '/login'; return; }
      const { user } = await me.json();
      state.user = user;
    } catch {
      location.href = '/login';
      return;
    }
    updateUserUI();
    els.app.removeAttribute('hidden');
    await loadConversations();
    // If there are existing conversations, open the most recent
    if (state.conversations.length) {
      await selectConv(state.conversations[0].id);
    } else {
      els.messages.appendChild(els.welcome);
    }
    els.input.focus();
  };

  boot();
})();
