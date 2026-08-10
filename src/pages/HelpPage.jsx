import { useState, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import AccordionSection from '../ui/Accordion.jsx';
import Icon from '../ui/Icon.jsx';
import { SHORTCUT_GROUPS, formatShortcut, modKey } from '../utils/shortcuts.js';
import styles from './HelpPage.module.css';

/**
 * The guide.
 *
 * The redesign added a keyboard layer and several concepts (reply vs note, the
 * recall window, what closing an action means, why progress reopens a resolved
 * ticket) that are fast once known and invisible until then. Nothing in the
 * product explained any of it.
 *
 * Deliberately a static reference rather than a tour: an agent looking
 * something up mid-ticket wants to scan, not be walked through. Sections start
 * collapsed except the first, so the page opens as a table of contents.
 *
 * Every shortcut shown comes from utils/shortcuts.js, which a test keeps
 * honest against the real handlers — see shortcuts.test.mjs.
 */

/** One key rendered as a <kbd>, per the reader's actual platform. */
function Keys({ combo }) {
  return <kbd className={styles.kbd}>{formatShortcut(combo)}</kbd>;
}

function ShortcutRow({ item }) {
  return (
    <div className={styles.scRow}>
      <div className={styles.scKeys}>
        {item.keys.map((k, i) => (
          <span key={k} className={styles.scKeyWrap}>
            {i > 0 && <span className={styles.scOr}>or</span>}
            <Keys combo={k} />
          </span>
        ))}
      </div>
      <div className={styles.scWhat}>
        <span className={styles.scLabel}>{item.label}</span>
        {item.note && <span className={styles.scNote}>{item.note}</span>}
      </div>
    </div>
  );
}

const SECTIONS = [
  { id: 'around',    title: 'Getting around',        icon: 'package' },
  { id: 'ticket',    title: 'Working a ticket',      icon: 'checkCircle' },
  { id: 'reply',     title: 'Replying',              icon: 'send' },
  { id: 'actions',   title: 'Actions',               icon: 'check' },
  { id: 'filters',   title: 'Filters & saved views', icon: 'tag' },
  { id: 'sla',       title: 'SLA & Insights',        icon: 'clock' },
  { id: 'keys',      title: 'Keyboard shortcuts',    icon: 'note' },
  { id: 'roles',     title: 'Admin vs agent',        icon: 'lock' },
];

export default function HelpPage() {
  const { isAdmin } = useAuth();
  // Multiple sections can be open at once — this is a reference, and comparing
  // two topics shouldn't cost a click.
  const [open, setOpen] = useState(() => new Set(['around']));

  const toggle = useCallback((id) => {
    setOpen(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const expandAll   = () => setOpen(new Set(SECTIONS.map(s => s.id)));
  const collapseAll = () => setOpen(new Set());

  const section = (id) => {
    const meta = SECTIONS.find(s => s.id === id);
    return {
      title: (
        <span className={styles.secTitle}>
          <Icon name={meta.icon} size={14} className={styles.secIcon} />
          {meta.title}
        </span>
      ),
      open: open.has(id),
      onToggle: () => toggle(id),
    };
  };

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.pageHead}>
          <h1 className={styles.pageTitle}>Help &amp; shortcuts</h1>
          <p className={styles.lede}>
            How BrandDesk works, and every key it listens for. Shortcuts are shown
            for this computer — you are on a <strong>{modKey()}</strong> keyboard.
          </p>
          <div className={styles.headActions}>
            <button type="button" className={styles.linkBtn} onClick={expandAll}>Expand all</button>
            <span className={styles.dot} aria-hidden="true">·</span>
            <button type="button" className={styles.linkBtn} onClick={collapseAll}>Collapse all</button>
          </div>
        </header>

        <div className={styles.panel}>

          {/* ── Getting around ─────────────────────────────────────────── */}
          <AccordionSection {...section('around')} summary={`The five destinations, and ${formatShortcut('Mod+K')}`}>
            <div className={styles.prose}>
              <dl className={styles.defs}>
                <dt>Inbox</dt>
                <dd>Every ticket, with the thread and the customer's context side by side. This is where the work happens.</dd>
                <dt>Actions</dt>
                <dd>Every open action across all tickets, so nothing waiting on you is buried inside a conversation you haven't opened.</dd>
                <dt>Insights</dt>
                <dd>Volume, response times and SLA performance over a date range.</dd>
                <dt>Templates</dt>
                <dd>Saved replies with variables. Edit them here; use them from the composer.</dd>
                <dt>Settings</dt>
                <dd>Your account, and — for admins — automation and the team.</dd>
              </dl>
              <p className={styles.tip}>
                <Icon name="sparkles" size={13} className={styles.tipIcon} />
                <span>
                  <Keys combo="Mod+K" /> opens the command palette from anywhere. It jumps to a page,
                  a filtered view, or straight to a ticket by customer name, ticket id or order number.
                  It is almost always faster than navigating.
                </span>
              </p>
            </div>
          </AccordionSection>

          {/* ── Working a ticket ───────────────────────────────────────── */}
          <AccordionSection {...section('ticket')} summary="List → thread → context">
            <div className={styles.prose}>
              <p>
                The Inbox is three columns: the ticket list, the conversation, and the
                customer panel. On a phone they stack — tap a ticket to open it, and
                the customer button in the header brings up the context as a sheet.
              </p>
              <p><strong>Order of the list.</strong> Urgent tickets sit at the top of
                every tab — Open, In progress and Resolved alike — and everything below
                that is newest activity first. A ticket jumps to the top when a customer
                replies, so the list reflects what moved most recently, not when the
                ticket was created.</p>
              <dl className={styles.defs}>
                <dt>Assignee</dt>
                <dd>Who owns it. Unassigned tickets belong to nobody, which is why the palette has a shortcut to them.</dd>
                <dt>Priority</dt>
                <dd>Low, Normal or Urgent. Urgent is the only one that changes the list order, so use it for what genuinely needs jumping the queue.</dd>
                <dt>Status</dt>
                <dd>Open → In progress → Resolved. You rarely set In progress by hand: replying or recording action progress moves it there.</dd>
                <dt>Snooze</dt>
                <dd>Hides a ticket until a date you pick. It comes back to Open on its own — use it for "waiting on the courier", not to clear a backlog.</dd>
              </dl>
              <p className={styles.tip}>
                <Icon name="alert" size={13} className={styles.tipIcon} />
                <span>Resolving asks for a resolution note. It is the only record of
                  <em> why </em> a ticket ended, and it is what you will want when the
                  same customer writes back in a fortnight.</span>
              </p>
            </div>
          </AccordionSection>

          {/* ── Replying ───────────────────────────────────────────────── */}
          <AccordionSection {...section('reply')} summary="Reply vs note, templates, recall">
            <div className={styles.prose}>
              <p>
                The composer has two modes and the difference matters more than any
                other control in the product:
              </p>
              <dl className={styles.defs}>
                <dt>Reply to customer</dt>
                <dd>Sends an email. The customer reads it.</dd>
                <dt>Internal note</dt>
                <dd>Stays in BrandDesk. Only the team sees it. Notes are tinted differently and labelled in the timeline so a note is never mistaken for something the customer received.</dd>
              </dl>
              <p>
                The mode is deliberately loud — a coloured composer and a differently
                coloured send button — because the cost of getting it wrong is
                asymmetric: an internal note sent to a customer cannot be taken back.
              </p>
              <h4 className={styles.h4}>Templates</h4>
              <p>
                Press <Keys combo="/" /> on an empty composer, or use the template
                button. Variables like <code className={styles.code}>{'{{customer_name}}'}</code> and{' '}
                <code className={styles.code}>{'{{order_id}}'}</code> are filled from the ticket
                as the template is inserted — check the result before sending, since a
                variable with nothing behind it stays visible.
              </p>
              <h4 className={styles.h4}>Improve</h4>
              <p>
                Rewrites your draft for grammar and tone without changing what it says.
                It edits the draft in place; undo (<Keys combo="Mod+Z" />) brings back
                what you wrote.
              </p>
              <h4 className={styles.h4}>The recall window</h4>
              <p>
                A sent reply is held briefly before it actually goes to Gmail, and an
                Undo appears while it waits. Gmail has no unsend, so this is a genuine
                delay rather than a retraction — once the window closes the email is
                gone. The delay is <strong>30 seconds</strong> by default and is set in{' '}
                {isAdmin ? <>Settings → Automation.</> : <>Settings → Automation by an admin.</>}
              </p>
              <p>
                Attachments go up with the reply. <Keys combo="Mod+Enter" /> sends;{' '}
                <Keys combo="Shift+Enter" /> is a line break.
              </p>
            </div>
          </AccordionSection>

          {/* ── Actions ────────────────────────────────────────────────── */}
          <AccordionSection {...section('actions')} summary="Checklists that live in the timeline">
            <div className={styles.prose}>
              <p>
                An <strong>action</strong> is the work a ticket actually requires —
                a refund to process, a replacement to dispatch, a pickup to arrange.
                It is separate from the conversation because the conversation ends
                long before the work does.
              </p>
              <p>
                Each action carries a checklist and detail fields appropriate to its
                type. Ticking an item or filling a field is <em>progress</em>, and
                progress is recorded: it appears in the thread timeline with a
                timestamp and who did it, in the same stream as the messages. Anyone
                opening the ticket can see what has happened without asking.
              </p>
              <p className={styles.tip}>
                <Icon name="refresh" size={13} className={styles.tipIcon} />
                <span>
                  <strong>Any progress moves the ticket to In progress</strong> — and
                  if the ticket was already Resolved, it reopens, with a "reopened"
                  entry in the timeline. This is intentional: work happening on a
                  closed ticket means it was not closed.
                </span>
              </p>
              <p>
                <strong>Closing an action is permanent.</strong> A closed action cannot
                be reopened or edited; you would raise a new one. You will be asked to
                confirm, and that confirmation is the last chance.
              </p>
              <p>
                The Actions page is every open action across every ticket, which is the
                view to work from when you are catching up rather than responding.
              </p>
            </div>
          </AccordionSection>

          {/* ── Filters ────────────────────────────────────────────────── */}
          <AccordionSection {...section('filters')} summary="Tabs, brand, search, saved views">
            <div className={styles.prose}>
              <p>
                The list narrows in four independent ways, and they combine: the
                status tabs, the brand picker, the search field, and assignee filters
                from the command palette.
              </p>
              <p>
                Whatever is active shows as a <strong>chip</strong> above the list, each
                with its own ✕. This exists because a filtered list and an empty inbox
                look identical — if the list is emptier than you expect, read the chips.
              </p>
              <p>
                A combination you keep rebuilding can be saved as a <strong>view</strong>.
                Saved views appear under the tabs and restore every filter at once.
              </p>
              <p>
                Search matches customer name, email, subject, ticket id and order
                number. <Keys combo="/" /> focuses it from anywhere in the list;{' '}
                <Keys combo="Esc" /> clears it.
              </p>
            </div>
          </AccordionSection>

          {/* ── SLA ────────────────────────────────────────────────────── */}
          <AccordionSection {...section('sla')} summary="4 business hours, Mon–Sat 10–8 IST">
            <div className={styles.prose}>
              <p>
                The SLA is <strong>first response within 4 business hours</strong>.
                Business hours are <strong>Monday to Saturday, 10 AM – 8 PM IST</strong>.
              </p>
              <p>
                Time only counts during those hours, so a ticket arriving at 7 PM has
                three hours left the next morning, not a breach overnight. A ticket
                arriving outside business hours is due at <strong>12 PM the next
                business day</strong>.
              </p>
              <dl className={styles.defs}>
                <dt>On track</dt>
                <dd>Under 75% of the window used.</dd>
                <dt>At risk</dt>
                <dd>75% or more used, deadline not yet passed. Worth picking up now.</dd>
                <dt>Breached</dt>
                <dd>Past the deadline with no first response.</dd>
              </dl>
              <p>
                {isAdmin
                  ? 'SLA pills in the ticket list, the thread banner and the row tinting are visible to admins only — agents see the tickets without the pressure indicator.'
                  : 'SLA indicators in the ticket list and thread header are shown to admins. Insights shows the same SLA numbers to everyone, so you can always see how the team is tracking.'}
              </p>
              <p>
                <strong>Insights</strong> covers a date range you choose and reports
                volume, resolution counts, response times, backlog by age and SLA
                attainment. {isAdmin
                  ? 'You can break it down per agent and export it to Excel.'
                  : 'It shows your own numbers; admins can additionally break it down per agent.'}
              </p>
            </div>
          </AccordionSection>

          {/* ── Shortcuts ──────────────────────────────────────────────── */}
          <AccordionSection
            {...section('keys')}
            summary={`Shown for ${modKey()} keyboards`}
          >
            <div className={styles.prose}>
              {SHORTCUT_GROUPS.map(group => (
                <div key={group.group} className={styles.scGroup}>
                  <h4 className={styles.h4}>{group.group}</h4>
                  {group.note && <p className={styles.scGroupNote}>{group.note}</p>}
                  <div className={styles.scTable}>
                    {group.items.map(item => (
                      <ShortcutRow key={`${group.group}-${item.keys.join('+')}`} item={item} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </AccordionSection>

          {/* ── Roles ──────────────────────────────────────────────────── */}
          <AccordionSection
            {...section('roles')}
            summary={isAdmin ? 'You are an admin' : 'You are an agent'}
          >
            <div className={styles.prose}>
              <p>
                Some controls are admin-only. They are hidden rather than disabled, so
                if a colleague describes something you cannot find, this is usually why
                — not a bug.
              </p>
              <dl className={styles.defs}>
                <dt>Workspace automation</dt>
                <dd>Auto-acknowledge, auto-resolve and the recall window. Agents can see the settings but not change them.</dd>
                <dt>Team</dt>
                <dd>Adding and deactivating users. Admins only.</dd>
                <dt>Per-agent Insights and Excel export</dt>
                <dd>Admins only. Agents see their own numbers.</dd>
                <dt>SLA indicators</dt>
                <dd>The pills, row tinting and thread banner are admin-only. The SLA figures in Insights are visible to everyone.</dd>
                <dt>Customer contact details</dt>
                <dd>Email and phone are masked for agents throughout the app; admins see them in full. Customer names are never masked.</dd>
              </dl>
              {!isAdmin && (
                <p className={styles.tip}>
                  <Icon name="lock" size={13} className={styles.tipIcon} />
                  <span>You are signed in as an agent. If you need one of the above,
                    an admin can either do it or change your role in Settings → Team.</span>
                </p>
              )}
            </div>
          </AccordionSection>

        </div>
      </div>
    </div>
  );
}
