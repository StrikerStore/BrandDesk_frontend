import { useState, useEffect, useRef, useCallback, Fragment, lazy, Suspense } from 'react';
import { useThread } from '../../hooks/useThread.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import { fetchTemplates, trackTemplateUse, updateThread, resolveThread, improveText, fetchThreadActions, fetchUsers, errorMessage } from '../../utils/api.js';
import { useToast } from '../../ui/ToastProvider.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import Icon from '../../ui/Icon.jsx';
import Menu from '../../ui/Menu.jsx';
import { TYPE_COLORS, actionLabel } from '../../utils/actionTypes.js';
import MaskedValue from '../../ui/MaskedValue.jsx';
import { formatFullTime, formatClock, formatDayLabel, resolveTemplate, STATUS_CONFIG, getBrandColor, getInitials, statusSince, displayOrderId } from '../../utils/helpers.js';
// ProseMirror is the app's heaviest dependency and is only needed once a
// thread is open, so it loads on demand rather than in the first paint.
const RichEditor = lazy(() => import('../../ui/RichEditor.jsx'));
import { sanitizeEmailHtml, escapeHtml } from '../../utils/sanitize.js';
// Hints used to hard-code ⌘, which is wrong on the Windows machines this team
// actually uses. formatShortcut renders for the reader's keyboard.
import { formatShortcut } from '../../utils/shortcuts.js';
import ActionModal from './ActionModal.jsx';
import ActionPanel from './ActionPanel.jsx';
import styles from './ThreadPanel.module.css';

// Colour + text carry priority now. It used to be an emoji inside a native
// <select> (🔴 Urgent / ⚪ Normal), which renders per-OS and is announced as
// "red circle" rather than "urgent".
const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgent', dot: '#dc2626' },
  { value: 'normal', label: 'Normal', dot: '#9e9d99' },
  { value: 'low',    label: 'Low',    dot: '#60a5fa' },
];

const STATUS_OPTIONS = [
  { value: 'open',        label: 'Open',        dot: '#d97706' },
  { value: 'in_progress', label: 'In progress', dot: '#2563eb' },
  { value: 'resolved',    label: 'Resolved',    dot: '#16a34a', hint: 'needs a note' },
];

// `snoozed_until` has been in the schema, the PATCH handler, the list query
// and InboxPage's update path all along — there was simply no control anywhere
// in the UI to set it.
const SNOOZE_PRESETS = [
  { value: 'none',     label: 'Not snoozed' },
  { value: '3h',       label: 'For 3 hours' },
  { value: 'tomorrow', label: 'Until tomorrow, 9am' },
  { value: 'monday',   label: 'Until Monday, 9am' },
  { value: 'week',     label: 'For a week' },
];

function snoozeUntil(preset) {
  const d = new Date();
  switch (preset) {
    case '3h':       d.setHours(d.getHours() + 3); return d;
    case 'tomorrow': d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d;
    case 'monday': {
      // 8 keeps "next Monday" a week away when today is already Monday.
      const delta = (8 - d.getDay()) % 7 || 7;
      d.setDate(d.getDate() + delta); d.setHours(9, 0, 0, 0); return d;
    }
    case 'week':     d.setDate(d.getDate() + 7); return d;
    default:         return null;
  }
}

/** Header identity: a button that opens contact info on mobile, plain text on desktop. */
function IdentityBlock({ as: Tag, onOpen, children }) {
  return (
    <Tag
      className={styles.headerCustomer}
      {...(Tag === 'button'
        ? { type: 'button', onClick: onOpen, 'aria-label': 'Customer and ticket details' }
        : {})}
    >
      {children}
    </Tag>
  );
}

/**
 * Mobile tools tray — WhatsApp's attachment sheet, holding the things that
 * live in the composer toolbar on desktop.
 *
 * The toolbar itself was a horizontally-scrolling strip on phones, so "Log
 * action" and "Improve" sat off-screen behind the `+` with nothing indicating
 * they were there.
 */
function ToolSheet({ isNote, aiBusy, onClose, onTemplates, onAction, onImprove, onAttach, fmt }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = (fn) => () => { fn(); onClose(); };

  return (
    <div className={styles.toolSheetOverlay} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.toolSheet} role="dialog" aria-modal="true" aria-label="Composer tools">
        <div className={styles.toolSheetGrab} />

        <div className={styles.fmtRow}>
          <button className={styles.fmtTile} onClick={fmt.bold}      aria-label="Bold"><strong>B</strong></button>
          <button className={styles.fmtTile} onClick={fmt.italic}    aria-label="Italic"><em>I</em></button>
          <button className={styles.fmtTile} onClick={fmt.underline} aria-label="Underline"><u>U</u></button>
          <button className={styles.fmtTile} onClick={fmt.link}      aria-label="Insert link"><Icon name="link" size={15} /></button>
          <button className={styles.fmtTile} onClick={fmt.bullet}    aria-label="Bullet list"><Icon name="note" size={15} /></button>
        </div>

        <div className={styles.toolGrid}>
          <ToolTile icon="note"     label="Templates"  tone="blue"   onClick={run(onTemplates)} />
          <ToolTile icon="plus"     label="Log action" tone="amber"  onClick={run(onAction)} />
          <ToolTile icon="paperclip" label="Attach"    tone="grey"   onClick={run(onAttach)} />
          {!isNote && (
            <>
              <ToolTile icon="checkCircle" label="Fix grammar" tone="green"
                disabled={aiBusy} onClick={run(() => onImprove('grammar'))} />
              <ToolTile icon="sparkles" label="Make professional" tone="purple"
                disabled={aiBusy} onClick={run(() => onImprove('professional'))} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolTile({ icon, label, tone, onClick, disabled }) {
  return (
    <button className={styles.toolTile} onClick={onClick} disabled={disabled} type="button">
      <span className={`${styles.toolTileIcon} ${styles[`tone_${tone}`]}`}>
        <Icon name={icon} size={20} />
      </span>
      <span className={styles.toolTileLabel}>{label}</span>
    </button>
  );
}

function SlaChip({ status, label, banner = false }) {
  if (!status || status === 'on_track') return null;
  const breached = status === 'breached';
  const tone = breached ? styles.slaChipBreached : styles.slaChipRisk;
  return (
    <div className={banner ? styles.slaBanner : undefined}>
      <span className={tone} title={label || (breached ? 'SLA breached' : 'SLA at risk')}>
        <Icon name={breached ? 'alert' : 'clock'} size={11} />
        {label || (breached ? 'SLA breached' : 'At risk')}
      </span>
      {banner && <span className={styles.slaBannerNote}>Visible to admins only</span>}
    </div>
  );
}

export default function ThreadPanel({ threadId, brands, onThreadUpdate, onBack, onOpenCustomer, onThreadDeleted, contextOpen, onToggleContext }) {
  const toast = useToast();
  const { user, isAdmin } = useAuth();
  const isMobile = useIsMobile();
  const {
    thread, messages, pending, loading, sending, reply, patchStatus, setThread, reload,
    undoSend, retrySend, discardSend,
  } = useThread(threadId);

  const [replyText, setReplyText]           = useState('');
  const [isNote, setIsNote]                 = useState(false);
  const [showTemplates, setShowTemplates]   = useState(false);
  const [templates, setTemplates]           = useState({});
  const [tplSearch, setTplSearch]           = useState('');
  const [showTagInput, setShowTagInput]     = useState(false);
  const [tagInput, setTagInput]             = useState('');
  const [showActionModal, setShowActionModal]   = useState(false);
  const [actionSummary, setActionSummary]       = useState({ total: 0, open: 0 });
  const [showActions, setShowActions]           = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveForm, setResolveForm]       = useState({ resolved_by: '', resolution_note: '' });
  const [resolving, setResolving]           = useState(false);
  const [overrideResolver, setOverrideResolver] = useState(false);
  const [team, setTeam]                     = useState([]);
  const [aiLoading, setAiLoading]           = useState(null); // 'grammar' | 'professional' | null
  const [aiOriginal, setAiOriginal]         = useState(null); // for undo
  const [attachments, setAttachments]       = useState([]); // File[]
  const [isExpanded, setIsExpanded]         = useState(false);
  const [showComposeTools, setShowComposeTools] = useState(false); // mobile: collapse toolbar
  const [headerDetailsOpen, setHeaderDetailsOpen] = useState(false); // mobile: WhatsApp-style collapsed header
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl]               = useState('');

  // Keep the header badge in sync with actions logged on this thread
  const applyActionList = (list) => {
    setActionSummary({ total: list.length, open: list.filter(a => !a.is_closed).length });
  };

  /**
   * Any action write moves the ticket to In progress server-side, and reopens
   * it if it had been resolved. The endpoints return the resulting status so
   * the header chip, the sidebar row and the timeline can catch up without a
   * full reload.
   */
  const applyThreadProgress = useCallback((data) => {
    if (!data?.thread_status) return;
    if (data.thread_status !== thread?.status) {
      applyUpdate({ status: data.thread_status, status_changed_at: new Date().toISOString() });
    }
    if (data.reopened) {
      toast.info('Ticket reopened', { detail: 'Action progress was recorded on a resolved ticket.' });
    }
    // Pull the new timeline entries in. Silent, so the panel doesn't flash a
    // loading state over a thread that's already on screen.
    reload(true);
  }, [thread?.status, reload, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadActionSummary = useCallback(async () => {
    if (!threadId) return;
    try {
      const { data } = await fetchThreadActions(threadId);
      const list = data.actions || [];
      setActionSummary({ total: list.length, open: list.filter(a => !a.is_closed).length });
    } catch {
      setActionSummary({ total: 0, open: 0 });
    }
  }, [threadId]);

  useEffect(() => {
    setShowActions(false);
    loadActionSummary();
  }, [loadActionSummary]);

  // Resolver identity comes from the session, not a free-text box prefilled
  // from localStorage. That box is why Insights carries a "3 spellings of this
  // name were merged" badge.
  const openResolveModal = () => {
    setResolveForm({ resolved_by: user?.name || '', resolution_note: '' });
    setOverrideResolver(false);
    setShowResolveModal(true);
  };

  // Team list for the assignee menu — admins and agents alike need to be able
  // to hand a ticket over.
  useEffect(() => {
    fetchUsers()
      .then(({ data }) => setTeam((data || []).filter(u => u.is_active)))
      // Non-admins may not be allowed to list users; assignment then falls
      // back to "just me", which still prevents the duplicate-reply case.
      .catch(() => setTeam(user ? [user] : []));
  }, [user]);

  const assigneeOptions = [
    { value: 'unassigned', label: 'Unassigned', dot: '' },
    ...(team.some(u => u.id === user?.id) ? [] : user ? [{ value: user.id, label: `${user.name} (you)`, dot: '#2563eb' }] : []),
    ...team.map(u => ({
      value: u.id,
      label: u.id === user?.id ? `${u.name} (you)` : u.name,
      dot: u.id === user?.id ? '#2563eb' : '#9e9d99',
    })),
  ];

  const handleSnooze = async (preset) => {
    const until = snoozeUntil(preset);
    const iso = until ? until.toISOString().slice(0, 19).replace('T', ' ') : null;
    const previous = { snoozed_until: thread.snoozed_until ?? null };
    try {
      await updateThread(thread.id, { snoozed_until: iso });
      // Telling the parent drops the row out of the list, so do it only once
      // the write has actually landed.
      applyUpdate({ snoozed_until: iso });
      toast.success(
        until
          ? `Snoozed until ${until.toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}`
          : 'Snooze cleared',
      );
    } catch (err) {
      applyUpdate(previous);
      toast.error("Couldn't snooze this ticket", { detail: errorMessage(err) });
    }
  };

  const handleAssigneeChange = async (value) => {
    const assignee_id = value === 'unassigned' ? null : value;
    const previous = { assignee_id: thread.assignee_id ?? null, assignee_name: thread.assignee_name ?? null };
    const name = assigneeOptions.find(o => o.value === value)?.label;
    applyUpdate({ assignee_id, assignee_name: assignee_id ? name?.replace(' (you)', '') : null });
    try {
      await updateThread(thread.id, { assignee_id });
      toast.success(assignee_id ? `Assigned to ${name}` : 'Assignment cleared');
    } catch (err) {
      applyUpdate(previous);
      toast.error("Couldn't change the assignee", { detail: errorMessage(err) });
    }
  };

  // The LanguageTool integration that used to live here has been removed. It
  // was a second, competing grammar system with a different UI to the server
  // rewrite below, and it POSTed the draft reply — customer names, order
  // details — straight from the browser to a third-party public API.
  const handleAiImprove = async (mode) => {
    if (!replyText.trim() || aiLoading) return;
    const startedThread = threadIdRef.current;
    // A second improve on top of an undone-able one keeps the true original,
    // so undo always returns to what the agent actually typed.
    const prevOriginal = aiOriginal;
    setAiLoading(mode);
    // Save original HTML so undo restores formatting too
    const currentHtml = editorRef.current?.getHTML() || '';
    try {
      const { data } = await improveText(replyText, mode);
      if (threadIdRef.current !== startedThread) return; // agent moved on
      const clean = data.improved
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/_{1,2}(.*?)_{1,2}/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\n/g, '<br>')
        .trim();
      setEditorContent(clean);
      aiRewrittenTextRef.current = editorRef.current?.getText() ?? '';
      setAiOriginal(prevOriginal ?? currentHtml);
    } catch (err) {
      if (threadIdRef.current !== startedThread) return;
      toast.error(
        mode === 'grammar' ? "Couldn't fix grammar" : "Couldn't rewrite the reply",
        { detail: errorMessage(err) },
      );
    } finally {
      setAiLoading(null);
    }
  };

  // "Undo rewrite" is only meaningful while the draft still IS the rewrite.
  // The first real edit dismisses it and brings the Improve menu back.
  useEffect(() => {
    if (aiOriginal && replyText !== aiRewrittenTextRef.current) setAiOriginal(null);
  }, [replyText, aiOriginal]);
  // ── Editor ───────────────────────────────────────────────────────────────────
  // The editor owns its document; `replyText` is only a plain-text mirror used
  // for enable/disable checks. Formatting goes through ProseMirror commands —
  // document.execCommand is deprecated and behaved differently per browser.
  const setEditorContent = (html) => editorRef.current?.setHTML(html || '');

  const handleFormatBold      = () => editorRef.current?.toggleBold();
  const handleFormatItalic    = () => editorRef.current?.toggleItalic();
  const handleFormatUnderline = () => editorRef.current?.toggleUnderline();
  const handleFormatBullet    = () => editorRef.current?.toggleBullet();

  const handleFormatLink = () => {
    // No manual selection bookkeeping: extendMarkRange re-derives the range
    // from the stored selection when the command runs.
    setLinkUrl('');
    setShowLinkDialog(true);
  };

  const confirmLink = () => {
    setShowLinkDialog(false);
    editorRef.current?.setLink(linkUrl.trim());
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
  const messagesBoxRef  = useRef(null);
  const scrollStateRef  = useRef({ threadId: null });
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Single source of truth for both jump buttons
  const measureScroll = useCallback(() => {
    const box = messagesBoxRef.current;
    if (!box) return;
    const top = box.scrollTop > 300;
    const bottom = box.scrollHeight - box.scrollTop - box.clientHeight > 300;
    setShowScrollTop(prev => (prev === top ? prev : top));
    setShowScrollBottom(prev => (prev === bottom ? prev : bottom));
  }, []);

  const scrollToTop = () => {
    messagesBoxRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    const box = messagesBoxRef.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  };
  const editorRef       = useRef(null);
  const tplRef          = useRef(null);
  const attachInputRef  = useRef(null);
  // Plain-text snapshot of the last AI rewrite. While the draft still matches
  // it, "Undo rewrite" is offered; the first real edit brings back "Improve".
  const aiRewrittenTextRef = useRef('');
  // Current thread for async guards — a slow rewrite response must not land in
  // whichever ticket the agent has switched to meanwhile.
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

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

  // Optimistic writes must be able to undo themselves. Previously these
  // awaited the request with no catch, so a rejection left the UI showing a
  // change that never reached the server.
  const applyWithRollback = async (updates, previous, failureMessage) => {
    applyUpdate(updates);
    try {
      await updateThread(thread.id, updates);
      return true;
    } catch (err) {
      applyUpdate(previous);
      toast.error(failureMessage, { detail: errorMessage(err) });
      return false;
    }
  };

  const handlePriorityChange = (priority) => {
    applyWithRollback(
      { priority },
      { priority: thread.priority || 'normal' },
      "Couldn't change priority",
    );
  };

  const handleAddTag = async () => {
    const tag = tagInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!tag || threadTags.includes(tag)) { setTagInput(''); setShowTagInput(false); return; }
    setTagInput('');
    setShowTagInput(false);
    // store as array — the threadTags parser handles both shapes
    await applyWithRollback({ tags: [...threadTags, tag] }, { tags: threadTags }, `Couldn't add #${tag}`);
  };

  const handleRemoveTag = async (tag) => {
    await applyWithRollback(
      { tags: threadTags.filter(t => t !== tag) },
      { tags: threadTags },
      `Couldn't remove #${tag}`,
    );
  };

  // Land on the newest message when a thread is first opened — and never move
  // the view again. New messages, polls and sends leave scroll position alone;
  // use the jump buttons instead.
  useEffect(() => {
    if (scrollStateRef.current.threadId === threadId) return;
    if (messages.length === 0) return;
    scrollStateRef.current = { threadId };
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    // Measure after the jump so the "to top" button shows straight away
    requestAnimationFrame(measureScroll);
  }, [messages, threadId, measureScroll]);

  // Reset compose on thread change
  useEffect(() => {
    editorRef.current?.clear();
    setReplyText('');
    setIsNote(false);
    setShowTemplates(false);
    setAttachments([]);
    // Stale undo here would paste the previous ticket's draft into this one.
    setAiOriginal(null);
    aiRewrittenTextRef.current = '';
    setIsExpanded(false);
    setShowComposeTools(false);
    setHeaderDetailsOpen(false);
    setShowScrollTop(false);
    setShowScrollBottom(false);
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
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  // ⌘↵ and `/` now live in RichEditor, which knows whether the document is
  // empty without reaching into a DOM node's innerText.

  const handleSend = async () => {
    const htmlBody = editorRef.current?.getHTML() || '';
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
      // The rewritten draft is gone — offering to "undo" into an empty
      // composer would resurrect it.
      setAiOriginal(null);
      aiRewrittenTextRef.current = '';
      // Auto advance: open → in_progress on first real reply
      if (!isNote && thread?.status === 'open') {
        applyUpdate({ status: 'in_progress' });
      }
    }
  };

  // ── Recall window ───────────────────────────────────────────
  const queuedPending = pending.filter(p => p.status === 'queued');
  const manualPending = queuedPending.find(p => p.kind === 'manual');
  const hasQueued     = queuedPending.length > 0;

  // Drives the countdown. Only runs while something is actually queued.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hasQueued) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasQueued]);

  const handleUndoSend = async (pendingSendId) => {
    const res = await undoSend(pendingSendId);
    if (!res.ok) return;
    if (res.kind === 'manual') {
      // The ticket only existed because of that first email — it's gone now.
      onThreadDeleted?.(threadId);
      return;
    }
    // Put the recalled text back so the agent can fix and re-send.
    setEditorContent(res.body || '');
    editorRef.current?.focus();
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
    // Template bodies are plain text with variables already substituted —
    // escape before turning newlines into markup, so a customer name
    // containing "<" can't inject anything.
    const html = escapeHtml(resolved).replace(/\n/g, '<br>');
    setEditorContent(html);
    setShowTemplates(false);
    await trackTemplateUse(tpl.id);
    editorRef.current?.focus();
  };

  const handleStatusMenuChange = async (status) => {
    if (status === thread.status) return;
    if (status === 'resolved') {
      openResolveModal();
      return;
    }
    // applyUpdate writes the thread AND the sidebar row; patchStatus only
    // rolls the thread back, so the revert has to go through applyUpdate.
    const previous = { status: thread.status, status_changed_at: thread.status_changed_at };
    applyUpdate({ status, status_changed_at: new Date().toISOString() });

    const res = await patchStatus(status);
    if (!res?.ok) {
      applyUpdate(previous);
      toast.error("Couldn't change status", { detail: errorMessage(res?.error) });
    }
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
      // Reload thread messages so the resolution system bubble appears
      await reload();
      toast.success('Ticket resolved');
    } catch (err) {
      // Without this the modal just sat there with the spinner cleared and no
      // explanation — the agent had no way to tell it had failed.
      toast.error("Couldn't resolve this ticket", { detail: errorMessage(err) });
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

  const brandColor  = getBrandColor(thread.brand);
  const rawName     = thread.customer_name || '';
  const isStoreName = rawName.toLowerCase().includes('shopify') || rawName.toLowerCase().includes(' store');
  const displayName = (!rawName || isStoreName) ? 'Customer' : rawName;
  const sinceLabel  = statusSince(thread.status, thread.status_changed_at);

  return (
    <div className={styles.root}>
      {/* Thread header — three rows with distinct jobs:
          1. who this is + how urgent it is (SLA was previously nowhere in the
             thread view at all, only in the list row)
          2. the pinned ticket facts an agent re-reads constantly
          3. the controls, with Resolve promoted out of the status dropdown */}
      <div className={`${styles.header} ${onBack && !headerDetailsOpen ? styles.headerCollapsed : ''}`}>
        <div className={styles.headerTop}>
          {onBack && (
            <button className={styles.backBtn} onClick={onBack} aria-label="Back to inbox">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          <div className={styles.headerAvatar} style={{ background: brandColor.bg, color: brandColor.text }}>
            {getInitials(displayName) || '?'}
          </div>
          {/* On mobile the whole identity block opens the customer sheet, the
              way tapping a WhatsApp header opens contact info. Desktop keeps
              it as static text — the panel is already on screen there. */}
          <IdentityBlock as={onOpenCustomer ? 'button' : 'div'} onOpen={onOpenCustomer}>
            <div className={styles.headerNameRow}>
              <span className={styles.headerName}>{displayName}</span>
            </div>
            <div className={styles.headerSubRow}>
              <MaskedValue className={styles.headerEmail} value={thread.customer_email} type="email" />
              <span className={styles.brandBadge} style={{ background: brandColor.bg, color: brandColor.text }}>
                {thread.brand}
              </span>
              {/* The ids are the "customer info" an agent scans for, and the
                  facts strip they used to live in is collapsed by default on
                  mobile — so a compact copy rides in the subtitle. */}
              <span className={styles.headerFacts}>
                {thread.ticket_id}
                {thread.order_number ? ` · #${displayOrderId(thread.order_id_resolved || thread.order_number)}` : ''}
              </span>
              {sinceLabel && (
                <span className={styles.statusSince} style={{ color: statusCfg.color, background: statusCfg.bg }}>
                  {sinceLabel}
                </span>
              )}
            </div>
          </IdentityBlock>

          <div className={styles.headerRight}>
            {onOpenCustomer && (
              <button className={styles.customerBtn} onClick={onOpenCustomer} aria-label="Customer details">
                <Icon name="user" size={18} />
              </button>
            )}
            {onBack && (
              <button
                className={`${styles.detailsToggle} ${headerDetailsOpen ? styles.detailsToggleOpen : ''}`}
                onClick={() => setHeaderDetailsOpen(v => !v)}
                aria-expanded={headerDetailsOpen}
                aria-label={headerDetailsOpen ? 'Hide ticket details' : 'Show ticket details'}
              >
                <Icon name="chevron" size={16} />
                {!headerDetailsOpen && actionSummary.open > 0 && <span className={styles.toggleDot} />}
              </button>
            )}
            {/* Context drawer toggle — the third column used to be a fixed
                320–480px cost with no way to reclaim it on desktop. */}
            {onToggleContext && (
              <button
                className={styles.iconToggle}
                onClick={onToggleContext}
                aria-pressed={contextOpen}
                aria-label={contextOpen ? 'Hide customer panel' : 'Show customer panel'}
                title={`${contextOpen ? 'Hide' : 'Show'} customer panel (${formatShortcut('Mod+\\')})`}
              >
                <Icon name="panel" size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Facts strip — ids, issue and age on one scannable line. These used
            to require opening the third column to read. */}
        <div className={styles.factsStrip}>
          {thread.ticket_id && <span className={styles.factId}>{thread.ticket_id}</span>}
          {thread.order_number && (
            <span className={styles.factId}>#{displayOrderId(thread.order_id_resolved || thread.order_number)}</span>
          )}
          {/* Issue and sub-issue live in the ticket's own facts card in the
              context panel; repeating them here made the strip wrap. */}
          <span className={styles.factMuted} title={formatFullTime(thread.created_at)}>
            Created {formatFullTime(thread.created_at)}
          </span>

          {threadTags.map(tag => (
            <span key={tag} className={styles.tagChip}>
              #{tag}
              <button className={styles.tagRemove} onClick={() => handleRemoveTag(tag)} aria-label={`Remove tag ${tag}`}>✕</button>
            </span>
          ))}
          {showTagInput ? (
            <span className={styles.tagInputWrap}>
              <input
                autoFocus
                className={styles.tagInput}
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddTag(); if (e.key === 'Escape') setShowTagInput(false); }}
                placeholder="tag name"
                aria-label="New tag"
              />
              <button className={styles.tagSave} onClick={handleAddTag}>Add</button>
            </span>
          ) : (
            <button className={styles.addTagBtn} onClick={() => setShowTagInput(true)}>
              <Icon name="tag" size={11} /> tag
            </button>
          )}

          {actionSummary.total > 0 && (
            <button
              className={`${styles.actionBadge} ${actionSummary.open > 0 ? styles.actionBadgeOpen : ''} ${showActions ? styles.actionBadgeActive : ''}`}
              onClick={() => setShowActions(v => !v)}
              aria-expanded={showActions}
            >
              {actionSummary.total} action{actionSummary.total > 1 ? 's' : ''}
              {actionSummary.open > 0 ? ` · ${actionSummary.open} open` : ' · closed'}
              <Icon name="chevron" size={9} className={showActions ? styles.badgeChevOpen : undefined} />
            </button>
          )}
        </div>

        {/* Controls — Resolve is a destination state with its own form, so it
            is a button, not an option hidden inside a dropdown that snapped
            back when you cancelled. */}
        <div className={styles.headerControls}>
          <Menu
            label="Assignee"
            value={thread.assignee_id ?? 'unassigned'}
            options={assigneeOptions}
            onChange={handleAssigneeChange}
            compact
          />
          <Menu
            label="Priority"
            value={thread.priority || 'normal'}
            options={PRIORITY_OPTIONS}
            onChange={handlePriorityChange}
            compact
          />
          <Menu
            label="Status"
            value={thread.status}
            options={STATUS_OPTIONS}
            onChange={handleStatusMenuChange}
            tone={{ color: statusCfg.color, bg: statusCfg.bg, border: statusCfg.border }}
            compact
          />
          <Menu
            label="Snooze"
            value={thread.snoozed_until ? 'snoozed' : 'none'}
            options={
              thread.snoozed_until
                ? [{ value: 'snoozed', label: 'Snoozed', dot: '#7c3aed' }, ...SNOOZE_PRESETS]
                : SNOOZE_PRESETS
            }
            onChange={handleSnooze}
            compact
          />
          {thread.status !== 'resolved' && (
            <button className={styles.resolveBtn} onClick={openResolveModal}>
              <Icon name="checkCircle" size={14} />
              Resolve
            </button>
          )}
        </div>
      </div>

      {/* Actions logged on this thread — expanded from header badge */}
      {showActions && (
        <div className={styles.actionsSection}>
          <ActionPanel
            threadId={thread.id}
            onActionsChange={applyActionList}
            onThreadProgress={applyThreadProgress}
          />
        </div>
      )}

      {/* Ticket itself is still in its recall window — no Gmail thread to reply into yet */}
      {manualPending && (
        <div className={styles.recallBanner}>
          <span>
            Ticket email sends in <strong>{formatCountdown(manualPending.scheduled_for, now)}</strong>
          </span>
          <button
            className={styles.recallBannerUndo}
            onClick={() => handleUndoSend(manualPending.id)}
            type="button"
          >
            Undo &amp; delete ticket
          </button>
        </div>
      )}

      {/* Messages */}
      {/* SLA is a management metric, so it sits with the conversation and only
          admins see it — agents shouldn't be reading a countdown while they
          write to a customer. */}
      {isAdmin && <SlaChip status={thread.sla_status} label={thread.sla_label} banner />}

      <div className={styles.messagesWrap}>
      <div className={styles.messages} ref={messagesBoxRef} onScroll={measureScroll}>
        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || new Date(prev.sent_at).toDateString() !== new Date(msg.sent_at).toDateString();
          const grouped = !newDay && prev
            && prev.direction === msg.direction
            && !!prev.is_note === !!msg.is_note
            && !prev._event && !msg._event
            && prev.from_email !== 'system' && msg.from_email !== 'system';

          // Action progress shares the stream with messages, so it needs the
          // same day separator treatment.
          if (msg._event) {
            return (
              <Fragment key={msg.id}>
                {newDay && (
                  <div className={styles.dateSep}>
                    <span className={styles.dateSepChip}>{formatDayLabel(msg.sent_at)}</span>
                  </div>
                )}
                <ActionEventEntry entry={msg._event} />
              </Fragment>
            );
          }

          return (
            <Fragment key={msg.id || i}>
              {newDay && (
                <div className={styles.dateSep}>
                  <span className={styles.dateSepChip}>{formatDayLabel(msg.sent_at)}</span>
                </div>
              )}
              <MessageBubble
                message={msg}
                thread={thread}
                grouped={grouped}
                now={now}
                onUndoSend={handleUndoSend}
                onRetrySend={retrySend}
                onDiscardSend={discardSend}
              />
            </Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      {showScrollTop && (
        <button className={styles.scrollTopBtn} onClick={scrollToTop} title="Scroll to top" aria-label="Scroll to top">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7"/>
          </svg>
        </button>
      )}
      {showScrollBottom && (
        <button className={styles.scrollBottomBtn} onClick={scrollToBottom} title="Scroll to bottom" aria-label="Scroll to bottom">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M19 12l-7 7-7-7"/>
          </svg>
        </button>
      )}
      </div>

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

        {/* Reply vs note is the highest-consequence choice in the app — a
            candid internal note sent to a customer. It was a toggle button
            guarded by a 1px amber border; it's now a segmented control and
            the whole composer changes colour with it. */}
        <div className={styles.modeSwitch} role="radiogroup" aria-label="Reply mode">
          <button
            type="button"
            role="radio"
            aria-checked={!isNote}
            className={`${styles.modeBtn} ${!isNote ? styles.modeBtnActiveReply : ''}`}
            onClick={() => setIsNote(false)}
          >
            <Icon name="send" size={13} />
            Reply to customer
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={isNote}
            className={`${styles.modeBtn} ${isNote ? styles.modeBtnActiveNote : ''}`}
            onClick={() => setIsNote(true)}
          >
            <Icon name="lock" size={13} active={isNote} />
            Internal note
          </button>
        </div>

        {/* One toolbar. Was two rows plus a five-button bottom strip. */}
        <div className={`${styles.composeTools} ${showComposeTools ? styles.composeToolsOpen : ''}`}>
          <div className={styles.toolbar}>
            <button
              className={`${styles.toolBtn} ${showTemplates ? styles.toolBtnActive : ''}`}
              onClick={() => setShowTemplates(v => !v)}
              aria-expanded={showTemplates}
            >
              <Icon name="note" size={13} />
              Templates
            </button>

            <span className={styles.fmtSep} />

            <button className={styles.fmtBtn} title={`Bold (${formatShortcut('Mod+B')})`} aria-label="Bold"
              onMouseDown={e => { e.preventDefault(); handleFormatBold(); }}><strong>B</strong></button>
            <button className={styles.fmtBtn} title={`Italic (${formatShortcut('Mod+I')})`} aria-label="Italic"
              onMouseDown={e => { e.preventDefault(); handleFormatItalic(); }}><em>I</em></button>
            <button className={styles.fmtBtn} title={`Underline (${formatShortcut('Mod+U')})`} aria-label="Underline"
              onMouseDown={e => { e.preventDefault(); handleFormatUnderline(); }}><u>U</u></button>
            <button className={styles.fmtBtn} title="Insert link" aria-label="Insert link"
              onMouseDown={e => { e.preventDefault(); handleFormatLink(); }}><Icon name="link" size={13} /></button>

            <button className={styles.fmtBtn} title="Attach file" aria-label="Attach file"
              onClick={() => attachInputRef.current?.click()}><Icon name="paperclip" size={13} /></button>

            {/* Holds the right-hand group in place. The gap used to come from
                `margin-left: auto` on the AI control, which only renders in
                reply mode — so Log action jumped left in note mode. */}
            <span className={styles.toolSpacer} aria-hidden="true" />

            {/* One AI control. There were two competing grammar systems: a
                server rewrite and a direct browser call to LanguageTool's
                public API, with different UIs and no stated difference. */}
            {!isNote && (
              <div className={styles.aiWrap}>
                {aiOriginal ? (
                  <button
                    className={styles.toolBtn}
                    onClick={() => { setEditorContent(aiOriginal); setAiOriginal(null); }}
                  >
                    <Icon name="history" size={13} /> Undo rewrite
                  </button>
                ) : (
                  <Menu
                    label="Improve"
                    value=""
                    compact
                    align="end"
                    options={[
                      { value: 'grammar',      label: 'Fix grammar & spelling' },
                      { value: 'professional', label: 'Rewrite as professional' },
                    ]}
                    onChange={handleAiImprove}
                  />
                )}
              </div>
            )}

            <button
              className={`${styles.toolBtn} ${styles.toolBtnAction}`}
              onClick={() => setShowActionModal(true)}
              title="Log exchange, return, or alternate product action"
            >
              <Icon name="plus" size={13} />
              Log action
            </button>
          </div>
        </div>{/* /composeTools */}

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

        {/* Lives outside the toolbar because that toolbar is display:none on
            mobile, and a programmatic .click() on an input with a hidden
            ancestor is unreliable on iOS Safari. Kept off-screen rather than
            display:none for the same reason. */}
        <input
          ref={attachInputRef}
          type="file"
          multiple
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleAttachFiles}
        />

        <div className={styles.textareaWrap}>
          {/* On mobile this becomes one rounded pill holding the tools trigger,
              the editor and the expand control — WhatsApp's single input
              capsule. `display: contents` on desktop, so that layout is
              completely unaffected. */}
          <div className={`${styles.inputPill} ${isNote ? styles.inputPillNote : ''}`}>
          <button
            className={`${styles.composeToggle} ${showComposeTools ? styles.composeToggleOpen : ''}`}
            onClick={() => setShowComposeTools(v => !v)}
            aria-label={showComposeTools ? 'Hide tools' : 'Show tools'}
            type="button"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <Suspense fallback={<div className={styles.editorLoading} aria-busy="true">Loading editor…</div>}>
          <RichEditor
            ref={editorRef}
            isNote={isNote}
            expanded={isExpanded}
            // The desktop hint names two keyboard shortcuts that don't exist
            // on a phone, and it was long enough to be clipped mid-word.
            placeholder={isMobile
              ? (isNote ? 'Internal note…' : 'Type your reply…')
              : (isNote
                  ? 'Add an internal note — not sent to the customer…'
                  : `Type your reply… (press / for templates, ${formatShortcut('Mod+Enter')} to send)`)}
            onChange={setReplyText}
            onSubmit={handleSend}
            onSlash={() => setShowTemplates(true)}
          />
          </Suspense>
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
          </div>{/* /inputPill */}

          {/* Phones get the tray instead of the inline toolbar. */}
          {isMobile && showComposeTools && (
            <ToolSheet
              isNote={isNote}
              aiBusy={!!aiLoading}
              onClose={() => setShowComposeTools(false)}
              onTemplates={() => setShowTemplates(true)}
              onAction={() => setShowActionModal(true)}
              onImprove={handleAiImprove}
              onAttach={() => attachInputRef.current?.click()}
              fmt={{
                bold: handleFormatBold,
                italic: handleFormatItalic,
                underline: handleFormatUnderline,
                link: handleFormatLink,
                bullet: handleFormatBullet,
              }}
            />
          )}
          {/* Mobile send column: quick rewrite above send. Emoji swapped for
              the shared icon set so they inherit colour, size and weight. */}
          <div className={styles.mobileSendCol}>
            {!isNote && (replyText.trim().length >= 10 || aiOriginal) && (
              <button
                className={`${styles.mobileAiBtn} ${aiLoading === 'professional' ? styles.aiBtnLoading : ''}`}
                onClick={() => {
                  if (aiOriginal) { setEditorContent(aiOriginal); setAiOriginal(null); }
                  else handleAiImprove('professional');
                }}
                disabled={!!aiLoading || sending}
                aria-label={aiOriginal ? 'Undo AI rewrite' : 'Rewrite as professional reply'}
                title={aiOriginal ? 'Undo AI rewrite' : 'Rewrite as professional reply'}
                type="button"
              >
                {aiLoading === 'professional'
                  ? <span className={styles.mobileSendDots}>…</span>
                  : <Icon name={aiOriginal ? 'history' : 'sparkles'} size={18} />}
              </button>
            )}
            <button
              className={`${styles.mobileSend} ${isNote ? styles.mobileSendNote : ''}`}
              onClick={handleSend}
              disabled={!replyText.trim() || sending || !!manualPending}
              aria-label={isNote ? 'Save note' : 'Send reply'}
              title={manualPending ? 'Waiting for the ticket email to send' : undefined}
              type="button"
            >
              {sending
                ? <span className={styles.mobileSendDots}>…</span>
                : <Icon name={isNote ? 'lock' : 'send'} size={20} strokeWidth={2.2} />}
            </button>
          </div>
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

        <div className={styles.replyBottom}>
          <div className={styles.replyBottomLeft}>
            {isNote ? (
              <span className={styles.noteHint}>
                <Icon name="lock" size={12} active />
                Internal only — the customer never sees this
              </span>
            ) : (
              <span className={styles.hint}>
                Replying as <strong>{thread.brand_email}</strong> · {formatShortcut('Mod+Enter')} to send
              </span>
            )}
            {aiLoading && <span className={styles.aiWorking}>Rewriting…</span>}
          </div>
          <button
            className={`${styles.sendBtn} ${isNote ? styles.sendBtnNote : ''}`}
            onClick={handleSend}
            disabled={!replyText.trim() || sending || !!manualPending}
            title={manualPending ? 'Waiting for the ticket email to send' : undefined}
          >
            {!sending && <Icon name={isNote ? 'lock' : 'send'} size={14} />}
            {sending ? 'Sending…' : isNote ? 'Save note' : 'Send reply'}
          </button>
        </div>
      </div>

      {/* Action modal */}
      {showActionModal && (
        <ActionModal
          threadId={thread.id}
          onClose={() => setShowActionModal(false)}
          onActionCreated={(_action, meta) => {
            setShowActionModal(false);
            loadActionSummary();
            setShowActions(true);
            applyThreadProgress(meta);
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
              {/* Resolver identity is the signed-in user. Typing it by hand is
                  what produced the "N spellings merged" mess in Insights. */}
              <label className={styles.resolveLabel} htmlFor="resolve-by">Resolved by</label>
              {overrideResolver ? (
                <input
                  id="resolve-by"
                  className={styles.resolveInput}
                  placeholder="Who resolved this?"
                  value={resolveForm.resolved_by}
                  onChange={e => setResolveForm(f => ({ ...f, resolved_by: e.target.value }))}
                  autoFocus
                />
              ) : (
                <div className={styles.resolverRow}>
                  <span className={styles.resolverAvatar} aria-hidden="true">
                    {(user?.name || '?')[0].toUpperCase()}
                  </span>
                  <span className={styles.resolverName}>{user?.name}</span>
                  <button
                    type="button"
                    className={styles.resolverSwap}
                    onClick={() => { setResolveForm(f => ({ ...f, resolved_by: '' })); setOverrideResolver(true); }}
                  >
                    Someone else?
                  </button>
                </div>
              )}

              <label className={styles.resolveLabel} htmlFor="resolve-note">
                Resolution note <span className={styles.reqMark}>required</span>
              </label>
              <textarea
                id="resolve-note"
                className={styles.resolveTextarea}
                rows={3}
                placeholder="What was done to resolve this? e.g. Refund processed, order reshipped, tracking shared…"
                value={resolveForm.resolution_note}
                onChange={e => setResolveForm(f => ({ ...f, resolution_note: e.target.value }))}
                autoFocus={!overrideResolver}
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

// Seconds left in a recall window, as m:ss. Clamped at zero — once it hits
// zero the email is in Gmail's hands.
function formatCountdown(scheduledFor, now) {
  const ms = new Date(scheduledFor).getTime() - now;
  const secs = Math.max(Math.ceil(ms / 1000), 0);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

/**
 * One coalesced run of action progress, placed in the timeline where it
 * happened. Reuses the system-message rails so it reads as part of the
 * conversation rather than a separate log.
 */
function ActionEventEntry({ entry }) {
  const color = TYPE_COLORS[entry.action_type] || {};
  const isReopen = entry.standalone;

  return (
    <div className={styles.systemMsg}>
      <div className={styles.systemLine} />
      <div
        className={`${styles.eventBubble} ${isReopen ? styles.eventBubbleReopen : ''}`}
        style={!isReopen && color.bg ? { background: color.bg, borderColor: color.border } : undefined}
      >
        <div className={styles.eventHead}>
          <Icon name={isReopen ? 'history' : 'checkCircle'} size={12} />
          <span className={styles.eventTitle} style={!isReopen && color.color ? { color: color.color } : undefined}>
            {isReopen ? 'Reopened' : actionLabel(entry.action_type)}
          </span>
          {entry.user_name && <span className={styles.eventWho}>· {entry.user_name}</span>}
          <span className={styles.eventTime}>{formatFullTime(entry.created_at)}</span>
        </div>
        <ul className={styles.eventLines}>
          {entry.lines.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      </div>
      <div className={styles.systemLine} />
    </div>
  );
}

function MessageBubble({ message, thread, grouped, now, onUndoSend, onRetrySend, onDiscardSend }) {
  const isOutbound = message.direction === 'outbound';
  const isNote     = !!message.is_note;
  const isSystem   = message.from_email === 'system';
  const pending    = message._pending;

  // System message — resolution event
  if (isSystem) {
    // Body is "✅ Resolved by X\n\n<note>". The note itself can contain blank
    // lines, so everything after the first separator belongs to it.
    const [head, ...rest] = message.body.split('\n\n');
    const note = rest.join('\n\n');
    return (
      <div className={styles.systemMsg}>
        <div className={styles.systemLine} />
        <div className={styles.systemBubble}>
          <span className={styles.systemText}>{head}</span>
          {note && <p className={styles.systemNote}>{note}</p>}
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
    return <StructuredMessage message={message} thread={thread} grouped={grouped} />;
  }

  return (
    <div className={`${styles.msgWrap} ${isOutbound ? styles.msgOutbound : styles.msgInbound} ${grouped ? styles.msgGrouped : ''}`}>
      <div className={`${styles.bubble} ${isOutbound ? styles.bubbleOut : styles.bubbleIn} ${isNote ? styles.bubbleNote : ''} ${pending && pending.status !== 'failed' ? styles.bubblePending : ''} ${pending?.status === 'failed' ? styles.bubbleFailed : ''}`}>
        {message.body && (
          isOutbound
            ? <p className={styles.bubbleText} dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(message.body) }} />
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
        {pending?.attachment_count > 0 && (
          <div className={styles.sentAttachList}>
            <div className={styles.sentAttachItem}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
              </svg>
              <span>{pending.attachment_count} attachment{pending.attachment_count > 1 ? 's' : ''}</span>
            </div>
          </div>
        )}
        {/* Mobile-only WhatsApp-style timestamp inside the bubble */}
        {!pending && <span className={styles.bubbleTimeIn}>{isNote ? 'Note · ' : ''}{formatClock(message.sent_at)}</span>}
      </div>

      {pending ? (
        <div className={styles.bubbleMeta}>
          {pending.status === 'failed' ? (
            <>
              <span className={styles.recallFailed}>⚠ Not sent — {pending.error || 'send failed'}</span>
              <button className={styles.recallAction} onClick={() => onRetrySend?.(pending.id)} type="button">Retry</button>
              <button className={styles.recallAction} onClick={() => onDiscardSend?.(pending.id)} type="button">Discard</button>
            </>
          ) : pending.status === 'sending' ? (
            <span className={styles.bubbleTime}>Sending…</span>
          ) : (
            <>
              <span className={styles.bubbleTime}>
                Sending in {formatCountdown(pending.scheduled_for, now)}
              </span>
              <button className={styles.recallAction} onClick={() => onUndoSend?.(pending.id)} type="button">Undo</button>
            </>
          )}
        </div>
      ) : (
        <div className={styles.bubbleMeta}>
          {isNote && <span className={styles.noteTag}>Internal note</span>}
          <span className={styles.bubbleTime}>{formatFullTime(message.sent_at)}</span>
          {isOutbound && !isNote && <span className={styles.bubbleTime}>· You</span>}
        </div>
      )}
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
function StructuredMessage({ message, thread, grouped }) {
  // Split at blank line to separate metadata from actual message.
  // `└` catches the indented sub-issue continuation line buildChatBody emits —
  // without it the sub-issue is neither a tag nor part of the body, and vanishes.
  const lines = message.body.split('\n');
  const metaLines = lines.filter(l => l.match(/^\s*[🎫📦🏷📞🌍└]/)).map(l => l.trim());
  const bodyStart = lines.findIndex(l => l === '');
  const customerMsg = bodyStart >= 0 ? lines.slice(bodyStart + 1).join('\n').trim() : '';

  return (
    <div className={`${styles.msgWrap} ${styles.msgInbound} ${grouped ? styles.msgGrouped : ''}`}>
      <div className={styles.structuredCard}>
        {/* Meta info row */}
        <div className={styles.structuredMeta}>
          {metaLines.map((line, i) => {
            const [icon, ...rest] = line.split(' ');
            const content = rest.join(' ');
            // The parsed form card printed the customer's phone in clear.
            // Split "Phone: 9220525933" so only the value is masked.
            const contact = content.match(/^(Phone|Email|Mobile|Contact)\s*:\s*(.+)$/i);
            return (
              <span key={i} className={styles.structuredTag}>
                <span className={styles.structuredIcon}>{icon}</span>
                {contact ? (
                  <>
                    {contact[1]}:{' '}
                    <MaskedValue
                      value={contact[2].trim()}
                      type={/email/i.test(contact[1]) ? 'email' : 'phone'}
                    />
                  </>
                ) : content}
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
        <span className={`${styles.bubbleTimeIn} ${styles.structuredTimeIn}`}>{formatClock(message.sent_at)}</span>
      </div>
      <div className={styles.bubbleMeta}>
        <span className={styles.bubbleTime}>{formatFullTime(message.sent_at)}</span>
      </div>
    </div>
  );
}