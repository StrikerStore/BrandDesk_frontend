import { useId } from 'react';
import Icon from './Icon.jsx';
import styles from './Accordion.module.css';

/**
 * Disclosure section for the context drawer.
 *
 * `summary` is what the closed state shows, so a collapsed section still
 * answers its own question ("Order — #DS4334 · Delivered") instead of being an
 * opaque label you have to open to evaluate. Empty sections collapse to a
 * single muted line rather than rendering an empty card.
 */
export default function AccordionSection({
  title,
  summary,
  count,
  open,
  onToggle,
  empty = false,
  emptyText = 'Nothing here',
  children,
}) {
  const id = useId();

  return (
    <section className={`${styles.section} ${open ? styles.sectionOpen : ''}`}>
      <h3 className={styles.heading}>
        <button
          type="button"
          className={styles.trigger}
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={id}
          data-focus-inset
        >
          <Icon name="chevron" size={13} className={open ? styles.chevOpen : styles.chev} />
          <span className={styles.title}>{title}</span>
          {count > 0 && <span className={styles.count}>{count}</span>}
          {!open && summary && <span className={styles.summary}>{summary}</span>}
        </button>
      </h3>
      <div id={id} className={styles.panel} hidden={!open}>
        {empty ? <p className={styles.empty}>{emptyText}</p> : children}
      </div>
    </section>
  );
}
