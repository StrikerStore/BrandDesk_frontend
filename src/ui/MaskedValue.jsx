import { useAuth } from '../auth/AuthContext.jsx';
import styles from './MaskedValue.module.css';

/**
 * Customer contact details are masked for agents and shown in full to admins.
 *
 * There is deliberately no reveal control: the point is to keep contact
 * details away from agents, so a button that hands them over would defeat it.
 * Admins get the raw value as plain selectable text.
 */
export function maskPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 4) return '••••';
  return '•'.repeat(Math.max(2, digits.length - 4)) + digits.slice(-4);
}

export function maskEmail(email) {
  if (!email) return null;
  const raw = String(email);
  const at = raw.lastIndexOf('@');
  if (at < 1) return '•'.repeat(Math.max(4, raw.length));
  const local  = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  // Keep enough to recognise the customer, not enough to reuse the address.
  const head = local.slice(0, Math.min(2, local.length));
  const dot  = domain.lastIndexOf('.');
  const tld  = dot > 0 ? domain.slice(dot) : '';
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  return `${head}${'•'.repeat(Math.max(3, local.length - 2))}@${host.slice(0, 1)}${'•'.repeat(Math.max(2, host.length - 1))}${tld}`;
}

/** Role-aware masking, for use outside JSX (accordion summaries, titles). */
export function maskFor(isAdmin, value, type) {
  if (!value) return null;
  if (isAdmin) return String(value);
  return type === 'email' ? maskEmail(value) : maskPhone(value);
}

export default function MaskedValue({
  value,
  type = 'text',          // 'email' | 'phone' | 'text'
  className = '',
  mono = false,
}) {
  const { isAdmin } = useAuth();
  if (!value) return null;

  if (isAdmin) {
    return <span className={`${styles.wrap} ${className}`}>{value}</span>;
  }

  const masked = type === 'email' ? maskEmail(value)
    : type === 'phone' ? maskPhone(value)
    : '•'.repeat(String(value).length);

  return (
    <span className={`${styles.wrap} ${className}`}>
      <span className={`${styles.value} ${mono ? styles.mono : ''}`}>{masked}</span>
      <span className="sr-only"> (contact details hidden)</span>
    </span>
  );
}
