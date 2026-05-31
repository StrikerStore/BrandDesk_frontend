import { useState, useEffect, useRef } from 'react';
import { useThread } from '../../hooks/useThread.js';
import { fetchTemplates, trackTemplateUse, updateThread, resolveThread, improveText } from '../../utils/api.js';
import { formatFullTime, resolveTemplate, STATUS_CONFIG, PRIORITY_CONFIG, getBrandColor, statusSince } from '../../utils/helpers.js';
import TemplateEditor from '../Templates/TemplateEditor.jsx';
import ActionModal from './ActionModal.jsx';
import ActionPanel from './ActionPanel.jsx';
import styles from './ThreadPanel.module.css';

export default function ThreadPanel({ threadId, brands, onThreadUpdate }) {
  const { thread, messages, loading, sending, reply, patchStatus, setThread, reload } = useThread(threadId);

  const [replyText, setReplyText]           = useState('');
  const [isNote, setIsNote]                 = useState(false);
  const [showTemplates, setShowTemplates]   = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [templates, setTemplates]           = useState({});
  const [tplSearch, setTplSearch]           = useState('');
  const [showTagInput, setShowTagInput]     = useState(false);
  const [tagInput, setTagInput]             = useState('');
  const [activeTab, setActiveTab]               = useState('messages'); // 'messages' | 'actions'
  const [actionCount, setActionCount]           = useState(0);
  const [showActionModal, setShowActionModal]   = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveForm, setResolveForm]       = useState({ resolved_by: '', resolution_note: '' });
  const [resolving, setResolving]           = useState(false);
  const [grammarMatches, setGrammarMatches] = useState([]);
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [aiLoading, setAiLoading]           = useState(null); // 'grammar' | 'professional' | null
  const [aiOriginal, setAiOriginal]         = useState(null); // for undo
  const [attachments, setAttachments]       = useState([]); // File[]
  const [isExpanded, setIsExpanded]         = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl]               = useState('');
  const savedRangeRef                       = useRef(null); // saved selection for link insert

  // Pre-fill resolver name from last used
  const openResolveModal = () => {
    const savedName = localStorage.getItem('branddesk_resolver_name') || '';
    setResolveForm({ resolved_by: savedName, resolution_note: '' });
    setShowResolveModal(true);
  };

  const handleGrammarCheck = async () => {
    if (!replyText.trim() || replyText.trim().length < 10) return;
    setGrammarLoading(true);
    setGrammarMatches([]);
    try {
      const params = new URLSearchParams({
        text:              replyText,
        language:          'en-GB',
        enabledOnly:       'false',
        // Enable extra rule categories for deeper checking
        enabledCategories: 'GRAMMAR,TYPOS,CONFUSED_WORDS,REDUNDANCY,SEMANTICS,COLLOQUIALISMS,STYLE,PUNCTUATION',
        // Disable overly nitpicky style-only rules
        disabledRules:     'WHITESPACE_RULE,COMMA_PARENTHESIS_WHITESPACE,EN_QUOTES',
        level:             'picky', // picky catches more issues than default
      });
      const res = await fetch('https://api.languagetool.org/v2/check', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    params.toString(),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`LanguageTool error ${res.status}: ${text}`);
      }
      const data = await res.json();
      // Show all matches with replacements — don't filter out style anymore
      const filtered = (data.matches || []).filter(m => m.replacements?.length > 0);
      setGrammarMatches(filtered);
    } catch (err) {
      console.error('LanguageTool error:', err);
    } finally {
      setGrammarLoading(false);
    }
  };

  const handleApplyFix = (match) => {
    const replacement = match.replacements[0].value;
    const newText = replyText.slice(0, match.offset) + replacement + replyText.slice(match.offset + match.length);
    setReplyText(newText);
    const diff = replacement.length - match.length;
    setGrammarMatches(prev =>
      prev.filter(m => m.offset !== match.offset)
          .map(m => m.offset > match.offset ? { ...m, offset: m.offset + diff } : m)
    );
  };

  const handleDismissFix = (match) => {
    setGrammarMatches(prev => prev.filter(m => m.offset !== match.offset));
  };

  const handleAiImprove = async (mode) => {
    if (!replyText.trim() || aiLoading) return;
    setAiLoading(mode);
    // Save original HTML so undo restores formatting too
    setAiOriginal(textareaRef.current?.innerHTML || replyText);
    setGrammarMatches([]);
    try {
      const { data } = await improveText(replyText, mode);
      const clean = data.improved
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/_{1,2}(.*?)_{1,2}/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\n/g, '<br>')
        .trim();
      setEditorContent(clean);
    } catch (err) {
      setAiOriginal(null);
      console.error('AI improve failed:', err.message);
    } finally {
      setAiLoading(null);
    }
  };
  // ── Editor helpers ───────────────────────────────────────────────────────────
  // Programmatically set the contentEditable HTML and sync shadow state
  const setEditorContent = (html) => {
    const el = textareaRef.current;
    if (!el) return;
    el.innerHTML = html;
    setReplyText(el.innerText);
    setGrammarMatches([]);
  };

  // ── Formatting (execCommand works natively with contentEditable) ─────────────
  const handleFormatBold      = () => { textareaRef.current?.focus(); document.execCommand('bold',      false); };
  const handleFormatItalic    = () => { textareaRef.current?.focus(); document.execCommand('italic',    false); };
  const handleFormatUnderline = () => { textareaRef.current?.focus(); document.execCommand('underline', false); };

  const handleFormatLink = () => {
    // Save the current selection so we can restore it after the dialog opens
    const sel = window.getSelection();
    savedRangeRef.current = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    setLinkUrl('');
    setShowLinkDialog(true);
  };

  const confirmLink = () => {
    const url = linkUrl.trim();
    if (!url) { setShowLinkDialog(false); return; }
    const href = url.startsWith('http') ? url : `https://${url}`;
    setShowLinkDialog(false);
    textareaRef.current?.focus();
    // Restore saved selection then insert link
    if (savedRangeRef.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
    document.execCommand('createLink', false, href);
    // Make links open in new tab
    textareaRef.current?.querySelectorAll('a').forEach(a => a.setAttribute('target', '_blank'));
    setReplyText(textareaRef.current?.innerText || '');
  };

  // ── Attachment helpers ───────────────────────────────────────────────────────
  const handleAttachFiles = (e) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const removeAttachment = (idx) => setAttachments(prev => prev.filter((_, i) => i !== idx));

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const messagesEndRef  = useRef(null);
  const textareaRef     = useRef(null);
  const tplRef          = useRef(null);
  const attachInputRef  = useRef(null);

  const threadTags = (() => {
    const raw = thread?.tags;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;              // MySQL returned parsed JSON array
    try { return JSON.parse(raw); } catch { return []; } // stored as string
  })();

  // Update local thread state AND push update to sidebar list immediately
  const applyUpdate = (updates) => {
    setThread(p => ({ ...p, ...updates }));
    if (thread?.id) onThreadUpdate?.(thread.id, updates);
  };

  const handlePriorityChange = async (priority) => {
    applyUpdate({ priority });
    await updateThread(thread.id, { priority });
  };

  const handleAddTag = async () => {
    const tag = tagInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!tag || threadTags.includes(tag)) { setTagInput(''); setShowTagInput(false); return; }
    const newTags = [...threadTags, tag];
    applyUpdate({ tags: newTags });  // store as array — threadTags parser handles both
    await updateThread(thread.id, { tags: newTags });
    setTagInput('');
    setShowTagInput(false);
  };

  const handleRemoveTag = async (tag) => {
    const newTags = threadTags.filter(t => t !== tag);
    applyUpdate({ tags: newTags });
    await updateThread(thread.id, { tags: newTags });
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset compose on thread change
  useEffect(() => {
    if (textareaRef.current) textareaRef.current.innerHTML = '';
    setReplyText('');
    setIsNote(false);
    setShowTemplates(false);
    setAttachments([]);
    setIsExpanded(false);
    setActiveTab('messages');
    setActionCount(0);
  }, [threadId]);

  // Load templates once
  useEffect(() => {
    fetchTemplates().then(({ data }) => setTemplates(data.grouped || {})).catch(() => {});
  }, []);

  // Close template picker on outside click
  useEffect(() => {
    const handler = (e) => {
      if (tplRef.current && !tplRef.current.contains(e.target)) setShowTemplates(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
    if (e.key === '/' && textareaRef.current?.innerText.trim() === '') {
      e.preventDefault();
      setShowTemplates(true);
    }
  };

  const handleSend = async () => {
    const htmlBody = textareaRef.current?.innerHTML || '';
    if (!replyText.trim() || sending) return;
    const ok = await reply({
      body: htmlBody,
      isNote,
      brandName: thread?.brand,
      gmailThreadId: thread?.gmail_thread_id,
      attachments,
    });
    if (ok) {
      setEditorContent('');
      setIsNote(false);
      setAttachments([]);
      // Auto advance: open → in_progress on first real reply
      if (!isNote && thread?.status === 'open') {
        applyUpdate({ status: 'in_progress' });
      }
    }
  };

  const handleUseTemplate = async (tpl) => {
    const firstName = thread?.customer_name?.split(' ')[0] || 'there';

    // Try to get tracking URL from order data if order_number exists
    let trackingUrl = '[tracking URL]';
    if (thread?.order_number) {
      try {
        const { fetchOrder } = await import('../../utils/api.js');
        const { data } = await fetchOrder(thread.order_number);
        // Get tracking_url from first order that has one
        const withTracking = data?.orders?.find(o => o.tracking?.tracking_url);
        if (withTracking?.tracking?.tracking_url) trackingUrl = withTracking.tracking.tracking_url;
      } catch {}
    }

    const vars = {
      customerName: firstName,
      brand:        thread?.brand || '',
      orderId:      thread?.order_number || '[order ID]',
      ticketId:     thread?.ticket_id    || '[ticket ID]',
      amount:       '[amount]',
      trackingUrl,
      trackingLink: trackingUrl,
    };
    // Convert plain text template to HTML (preserve line breaks)
    const resolved = resolveTemplate(tpl.body, vars);
    const html = resolved.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    setEditorContent(html);
    setShowTemplates(false);
    await trackTemplateUse(tpl.id);
    textareaRef.current?.focus();
  };

  const handleStatusChange = async (e) => {
    const status = e.target.value;
    if (status === 'resolved') {
      openResolveModal();
      return;
    }
    applyUpdate({ status, status_changed_at: new Date().toISOString() });
    await patchStatus(status);
  };

  const handleResolve = async () => {
    if (!resolveForm.resolved_by.trim() || !resolveForm.resolution_note.trim()) return;
    setResolving(true);
    try {
      const { data } = await resolveThread(thread.id, resolveForm);
      applyUpdate({
        status: 'resolved',
        status_changed_at: data.status_changed_at,
        resolved_by: data.resolved_by,
        resolution_note: data.resolution_note,
        resolved_at: data.resolved_at,
      });
      setShowResolveModal(false);
      // Save resolver name for next time
      localStorage.setItem('branddesk_resolver_name', resolveForm.resolved_by.trim());
      // Reload thread messages so the resolution system bubble appears
      await reload();
    } finally {
      setResolving(false);
    }
  };

  const filteredTemplates = Object.entries(templates).reduce((acc, [cat, items]) => {
    const filtered = items.filter(t =>
      t.title.toLowerCase().includes(tplSearch.toLowerCase()) ||
      t.body.toLowerCase().includes(tplSearch.toLowerCase())
    );
    if (filtered.length) acc[cat] = filtered;
    return acc;
  }, {});

  if (loading && !thread) {
    return <div className={styles.root}><div className={styles.loadingMsg}>Loading thread…</div></div>;
  }

  if (!thread) return null;

  const statusCfg   = STATUS_CONFIG[thread.status]   || STATUS_CONFIG.open;
  const priorityCfg = PRIORITY_CONFIG[thread.priority] || PRIORITY_CONFIG.normal;
  const brandColor  = getBrandColor(thread.brand);
  const rawName     = thread.customer_name || '';
  const isStoreName = rawName.toLowerCase().includes('shopify') || rawName.toLowerCase().includes(' store');
  const displayName = (!rawName || isStoreName) ? 'Customer' : rawName;
  const sinceLabel  = statusSince(thread.status, thread.status_changed_at);

  return (
    <div className={styles.root}>
      {/* Thread header */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.headerCustomer}>
            <span className={styles.headerName}>{displayName}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className={styles.headerEmail}>{thread.customer_email}</span>
              {sinceLabel && (
                <span className={styles.statusSince} style={{ color: statusCfg.color, background: statusCfg.bg }}>
                  {sinceLabel}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {/* Priority selector */}
            <select
              className={styles.prioritySelect}
              value={thread.priority || 'normal'}
              onChange={e => handlePriorityChange(e.target.value)}
              style={{ color: priorityCfg.color }}
              title="Set priority"
            >
              <option value="urgent">🔴 Urgent</option>
              <option value="normal">⚪ Normal</option>
              <option value="low">🔵 Low</option>
            </select>

            {/* Status selector — intercepts "resolved" to show modal */}
            <select
              className={styles.statusSelect}
              value={thread.status}
              onChange={handleStatusChange}
              style={{ color: statusCfg.color, borderColor: statusCfg.border, background: statusCfg.bg }}
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>

        {/* Meta row */}
        <div className={styles.headerMeta}>
          <span className={styles.brandBadge} style={{ background: brandColor.bg, color: brandColor.text }}>
            {thread.brand}
          </span>
          {thread.ticket_id && (
            <><span className={styles.metaSep}>·</span>
            <span className={styles.ticketIdBadge}>{thread.ticket_id}</span></>
          )}
          <span className={styles.metaSep}>·</span>
          <span className={styles.metaTime}>{formatFullTime(thread.created_at)}</span>
        </div>

        {/* Tags row */}
        <div className={styles.tagsRow}>
          {threadTags.map(tag => (
            <span key={tag} className={styles.tagChip}>
              #{tag}
              <button className={styles.tagRemove} onClick={() => handleRemoveTag(tag)}>✕</button>
            </span>
          ))}
          {showTagInput ? (
            <div className={styles.tagInputWrap}>
              <input
                autoFocus
                className={styles.tagInput}
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddTag(); if (e.key === 'Escape') setShowTagInput(false); }}
                placeholder="tag name"
              />
              <button className={styles.tagSave} onClick={handleAddTag}>Add</button>
            </div>
          ) : (
            <button className={styles.addTagBtn} onClick={() => setShowTagInput(true)}>+ tag</button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className={styles.tabBar}>
        <button
          className={`${styles.tab} ${activeTab === 'messages' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('messages')}
        >
          Messages
          {messages.length > 0 && (
            <span className={styles.tabBadge}>{messages.length}</span>
          )}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'actions' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('actions')}
        >
          Actions
          {actionCount > 0 && (
            <span className={`${styles.tabBadge} ${styles.tabBadgeAction}`}>{actionCount}</span>
          )}
        </button>
      </div>

      {/* Messages */}
      {activeTab === 'messages' && (
        <div className={styles.messages}>
          {messages.map((msg, i) => (
            <MessageBubble key={msg.id || i} message={msg} thread={thread} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Actions tab */}
      {activeTab === 'actions' && (
        <ActionPanel
          threadId={threadId}
          onCountChange={setActionCount}
        />
      )}

      {/* Reply area */}
      <div className={styles.replyArea}>
        {/* Manual ticket notice */}
        {thread?.gmail_thread_id?.startsWith('manual_') && (
          <div style={{
            fontSize: 12, color: '#1d4ed8', background: '#eff6ff',
            borderBottom: '1px solid #bfdbfe', padding: '7px 14px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
            </svg>
            Manual ticket — replies are saved internally and not sent via email.
          </div>
        )}
        {/* Template picker */}
        {showTemplates && (
          <div className={styles.tplPicker} ref={tplRef}>
            <div className={styles.tplSearch}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                autoFocus
                value={tplSearch}
                onChange={e => setTplSearch(e.target.value)}
                placeholder="Search templates…"
                className={styles.tplSearchInput}
              />
              <button className={styles.tplClose} onClick={() => setShowTemplates(false)}>✕</button>
            </div>
            <div className={styles.tplList}>
              {Object.keys(filteredTemplates).length === 0 ? (
                <p className={styles.tplEmpty}>No templates found</p>
              ) : (
                Object.entries(filteredTemplates).map(([cat, items]) => (
                  <div key={cat}>
                    <div className={styles.tplCat}>{cat}</div>
                    {items.map(tpl => (
                      <button key={tpl.id} className={styles.tplItem} onClick={() => handleUseTemplate(tpl)}>
                        <span className={styles.tplTitle}>{tpl.title}</span>
                        <span className={styles.tplPreview}>
                          {tpl.body.slice(0, 80).replace(/\n/g, ' ')}…
                        </span>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <button
            className={`${styles.toolBtn} ${showTemplates ? styles.toolBtnActive : ''}`}
            onClick={() => setShowTemplates(v => !v)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            Templates
          </button>
          <button
            className={`${styles.toolBtn} ${isNote ? styles.toolBtnNote : ''}`}
            onClick={() => setIsNote(v => !v)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            {isNote ? 'Internal note' : 'Add note'}
          </button>
          <button
            className={`${styles.toolBtn} ${styles.toolBtnAction}`}
            onClick={() => setShowActionModal(true)}
            title="Log exchange, return, or alternate product action"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <path d="M12 12v4m-2-2h4"/>
            </svg>
            Action
          </button>
          <button
            className={styles.toolBtn}
            onClick={() => setShowTemplateEditor(true)}
            title="Edit templates"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            Edit templates
          </button>
          <span className={styles.replyingAs}>Replying as {thread.brand_email}</span>
        </div>

        {/* Formatting + attachment toolbar */}
        <div className={styles.formatBar}>
          <button className={styles.fmtBtn} title="Bold" onMouseDown={e => { e.preventDefault(); handleFormatBold(); }}>
            <strong>B</strong>
          </button>
          <button className={styles.fmtBtn} title="Italic" onMouseDown={e => { e.preventDefault(); handleFormatItalic(); }}>
            <em>I</em>
          </button>
          <button className={styles.fmtBtn} title="Underline" onMouseDown={e => { e.preventDefault(); handleFormatUnderline(); }}>
            <u>U</u>
          </button>
          <button className={styles.fmtBtn} title="Hyperlink" onMouseDown={e => { e.preventDefault(); handleFormatLink(); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
            </svg>
          </button>
          <div className={styles.fmtSep} />
          <button
            className={styles.fmtBtn}
            title="Attach file"
            onClick={() => attachInputRef.current?.click()}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
            </svg>
            Attach
          </button>
          <input
            ref={attachInputRef}
            type="file"
            multiple
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
            style={{ display: 'none' }}
            onChange={handleAttachFiles}
          />
        </div>

        {/* Link dialog */}
        {showLinkDialog && (
          <div className={styles.linkDialog}>
            <span className={styles.linkDialogLabel}>URL</span>
            <input
              className={styles.linkDialogInput}
              autoFocus
              placeholder="https://example.com"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmLink(); if (e.key === 'Escape') setShowLinkDialog(false); }}
            />
            <button className={styles.linkDialogOk} onClick={confirmLink}>Insert</button>
            <button className={styles.linkDialogCancel} onClick={() => setShowLinkDialog(false)}>✕</button>
          </div>
        )}

        {showTemplateEditor && (
          <TemplateEditor
            onClose={() => {
              setShowTemplateEditor(false);
              fetchTemplates().then(({ data }) => setTemplates(data.grouped || {})).catch(() => {});
            }}
          />
        )}

        <div className={styles.textareaWrap}>
          <div
            ref={textareaRef}
            contentEditable
            suppressContentEditableWarning
            className={`${styles.textarea} ${styles.textareaEditor} ${isNote ? styles.textareaNote : ''} ${isExpanded ? styles.textareaExpanded : ''}`}
            onInput={e => { setReplyText(e.currentTarget.innerText); setGrammarMatches([]); }}
            onKeyDown={handleKeyDown}
            data-placeholder={isNote ? 'Add an internal note — not sent to customer…' : 'Type your reply… (press / for templates, ⌘↵ to send)'}
            spellCheck={true}
          />
          <button
            className={styles.expandBtn}
            title={isExpanded ? 'Collapse' : 'Expand'}
            onClick={() => setIsExpanded(v => !v)}
          >
            {isExpanded
              ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 14l6-6 6 6"/></svg>
              : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 10l6 6 6-6"/></svg>
            }
          </button>
        </div>

        {/* Attachment list */}
        {attachments.length > 0 && (
          <div className={styles.attachList}>
            {attachments.map((file, idx) => (
              <div key={idx} className={styles.attachItem}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
                <span className={styles.attachName}>{file.name}</span>
                <span className={styles.attachSize}>{formatFileSize(file.size)}</span>
                <button className={styles.attachRemove} onClick={() => removeAttachment(idx)}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Grammar suggestions */}
        {grammarMatches.length > 0 && (
          <div className={styles.grammarPanel}>
            <div className={styles.grammarHeader}>
              <span className={styles.grammarTitle}>
                {grammarMatches.length} suggestion{grammarMatches.length > 1 ? 's' : ''}
              </span>
              <button className={styles.grammarDismissAll} onClick={() => setGrammarMatches([])}>
                Dismiss all
              </button>
            </div>
            {grammarMatches.map((match, i) => (
              <div key={i} className={styles.grammarMatch}>
                <div className={styles.grammarMatchTop}>
                  <span className={styles.grammarError}>
                    "{replyText.slice(match.offset, match.offset + match.length)}"
                  </span>
                  <span className={styles.grammarArrow}>→</span>
                  <span className={styles.grammarFix}>
                    "{match.replacements[0]?.value}"
                  </span>
                  {match.replacements.length > 1 && (
                    <span className={styles.grammarMore}>
                      +{match.replacements.length - 1} more
                    </span>
                  )}
                </div>
                <div className={styles.grammarMatchBottom}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                    <span className={styles.grammarMsg}>{match.message}</span>
                    <span className={styles.grammarCategory}>{match.rule?.category?.name}</span>
                  </div>
                  <div className={styles.grammarActions}>
                    <button className={styles.grammarApply} onClick={() => handleApplyFix(match)}>
                      Apply
                    </button>
                    <button className={styles.grammarIgnore} onClick={() => handleDismissFix(match)}>
                      Ignore
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.replyBottom}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span className={styles.hint}>
              {isNote ? '⚠ Internal note' : '⌘↵ to send'}
            </span>
            {!isNote && replyText.trim().length >= 10 && (
              <>
                <button
                  className={`${styles.aiBtn} ${aiLoading === 'grammar' ? styles.aiBtnLoading : ''}`}
                  onClick={() => handleAiImprove('grammar')}
                  disabled={!!aiLoading}
                  title="Fix grammar and spelling"
                >
                  {aiLoading === 'grammar' ? '…' : '✓ Fix grammar'}
                </button>
                <button
                  className={`${styles.aiBtn} ${styles.aiBtnPro} ${aiLoading === 'professional' ? styles.aiBtnLoading : ''}`}
                  onClick={() => handleAiImprove('professional')}
                  disabled={!!aiLoading}
                  title="Rewrite as professional customer support reply"
                >
                  {aiLoading === 'professional' ? '…' : '✨ Make professional'}
                </button>
                {aiOriginal && (
                  <button
                    className={styles.aiUndoBtn}
                    onClick={() => { setEditorContent(aiOriginal); setAiOriginal(null); }}
                    title="Undo AI change"
                  >
                    ↩ Undo
                  </button>
                )}
                {replyText.trim().length >= 10 && (
                  <button
                    className={`${styles.grammarBtn} ${grammarLoading ? styles.grammarBtnLoading : ''} ${grammarMatches.length > 0 ? styles.grammarBtnActive : ''}`}
                    onClick={handleGrammarCheck}
                    disabled={grammarLoading || !!aiLoading}
                    title="Detailed grammar check with LanguageTool"
                  >
                    {grammarLoading ? '…' : grammarMatches.length > 0 ? `${grammarMatches.length} issues` : '⚙ Grammar check'}
                  </button>
                )}
              </>
            )}
          </div>
          <button
            className={`${styles.sendBtn} ${isNote ? styles.sendBtnNote : ''}`}
            onClick={handleSend}
            disabled={!replyText.trim() || sending}
          >
            {sending ? 'Sending…' : isNote ? 'Save note' : 'Send reply'}
          </button>
        </div>
      </div>

      {/* Action modal */}
      {showActionModal && (
        <ActionModal
          threadId={thread.id}
          onClose={() => setShowActionModal(false)}
          onActionCreated={() => {
            setActionCount(c => c + 1);
            setActiveTab('actions');
            setShowActionModal(false);
          }}
        />
      )}

      {/* Resolution modal */}
      {showResolveModal && (
        <div className={styles.resolveOverlay}>
          <div className={styles.resolveModal}>
            <div className={styles.resolveHeader}>
              <span className={styles.resolveTitle}>Resolve ticket</span>
              <button className={styles.resolveClose} onClick={() => setShowResolveModal(false)}>✕</button>
            </div>
            <div className={styles.resolveBody}>
              <p className={styles.resolveHint}>
                Both fields are required before marking as resolved.
              </p>
              <label className={styles.resolveLabel}>Your name</label>
              <input
                className={styles.resolveInput}
                placeholder="e.g. Keval"
                value={resolveForm.resolved_by}
                onChange={e => setResolveForm(f => ({ ...f, resolved_by: e.target.value }))}
                autoFocus
              />
              <label className={styles.resolveLabel}>Resolution note</label>
              <textarea
                className={styles.resolveTextarea}
                rows={3}
                placeholder="What was done to resolve this? e.g. Refund processed, order reshipped, tracking shared…"
                value={resolveForm.resolution_note}
                onChange={e => setResolveForm(f => ({ ...f, resolution_note: e.target.value }))}
              />
            </div>
            <div className={styles.resolveActions}>
              <button className={styles.resolveCancelBtn} onClick={() => setShowResolveModal(false)}>
                Cancel
              </button>
              <button
                className={styles.resolveConfirmBtn}
                onClick={handleResolve}
                disabled={resolving || !resolveForm.resolved_by.trim() || !resolveForm.resolution_note.trim()}
              >
                {resolving ? 'Resolving…' : 'Mark as resolved'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, thread }) {
  const isOutbound = message.direction === 'outbound';
  const isNote     = !!message.is_note;
  const isSystem   = message.from_email === 'system';

  // System message — resolution event
  if (isSystem) {
    const lines = message.body.split('\n\n');
    return (
      <div className={styles.systemMsg}>
        <div className={styles.systemLine} />
        <div className={styles.systemBubble}>
          <span className={styles.systemText}>{lines[0]}</span>
          {lines[1] && <p className={styles.systemNote}>{lines[1]}</p>}
          <span className={styles.bubbleTime}>{formatFullTime(message.sent_at)}</span>
        </div>
        <div className={styles.systemLine} />
      </div>
    );
  }

  // Detect structured Shopify form body
  const isStructured = message.body && (
    message.body.includes('🎫 Ticket:') ||
    message.body.includes('📦 Order:') ||
    message.body.includes('🏷 Issue:')
  );

  if (isStructured && !isOutbound) {
    return <StructuredMessage message={message} thread={thread} />;
  }

  return (
    <div className={`${styles.msgWrap} ${isOutbound ? styles.msgOutbound : styles.msgInbound}`}>
      <div className={`${styles.bubble} ${isOutbound ? styles.bubbleOut : styles.bubbleIn} ${isNote ? styles.bubbleNote : ''}`}>
        {message.body && (
          isOutbound
            ? <p className={styles.bubbleText} dangerouslySetInnerHTML={{ __html: message.body }} />
            : <p className={styles.bubbleText}>{message.body}</p>
        )}
        {message.attachments?.length > 0 && (
          <div className={styles.attachmentGrid}>
            {message.attachments.map(att => (
              <MessageImage key={att.id} attachment={att} />
            ))}
          </div>
        )}
        {message._attachmentNames?.length > 0 && (
          <div className={styles.sentAttachList}>
            {message._attachmentNames.map((f, i) => (
              <div key={i} className={styles.sentAttachItem}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
                <span>{f.name}</span>
                <span className={styles.sentAttachSize}>{f.size < 1024*1024 ? `${(f.size/1024).toFixed(1)} KB` : `${(f.size/1024/1024).toFixed(1)} MB`}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={styles.bubbleMeta}>
        {isNote && <span className={styles.noteTag}>Internal note</span>}
        <span className={styles.bubbleTime}>{formatFullTime(message.sent_at)}</span>
        {isOutbound && !isNote && <span className={styles.bubbleTime}>· You</span>}
      </div>
    </div>
  );
}

function MessageImage({ attachment }) {
  const [lightbox, setLightbox] = useState(false);
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const src = `${apiBase}/api/threads/attachment/${encodeURIComponent(attachment.attachment_id)}?gmailMessageId=${encodeURIComponent(attachment.gmail_message_id)}`;

  return (
    <>
      <img
        src={src}
        alt={attachment.filename}
        className={styles.attachmentThumb}
        onClick={() => setLightbox(true)}
        title={`${attachment.filename} — click to view full size`}
      />
      {lightbox && (
        <div className={styles.lightbox} onClick={() => setLightbox(false)}>
          <div className={styles.lightboxInner} onClick={e => e.stopPropagation()}>
            <button className={styles.lightboxClose} onClick={() => setLightbox(false)}>✕</button>
            <img src={src} alt={attachment.filename} className={styles.lightboxImg} />
            <div className={styles.lightboxName}>{attachment.filename}</div>
          </div>
        </div>
      )}
    </>
  );
}

// Renders the parsed Shopify ticket form as a clean structured card
function StructuredMessage({ message, thread }) {
  // Split at blank line to separate metadata from actual message
  const lines = message.body.split('\n');
  const metaLines = lines.filter(l => l.match(/^[🎫📦🏷📞🌍]/));
  const bodyStart = lines.findIndex(l => l === '');
  const customerMsg = bodyStart >= 0 ? lines.slice(bodyStart + 1).join('\n').trim() : '';

  return (
    <div className={`${styles.msgWrap} ${styles.msgInbound}`}>
      <div className={styles.structuredCard}>
        {/* Meta info row */}
        <div className={styles.structuredMeta}>
          {metaLines.map((line, i) => {
            const [icon, ...rest] = line.split(' ');
            const content = rest.join(' ');
            return (
              <span key={i} className={styles.structuredTag}>
                <span className={styles.structuredIcon}>{icon}</span>
                {content}
              </span>
            );
          })}
        </div>
        {/* Actual customer message */}
        {customerMsg && (
          <div className={styles.structuredBody}>
            <p className={styles.bubbleText}>{customerMsg}</p>
          </div>
        )}
      </div>
      <div className={styles.bubbleMeta}>
        <span className={styles.bubbleTime}>{formatFullTime(message.sent_at)}</span>
      </div>
    </div>
  );
}