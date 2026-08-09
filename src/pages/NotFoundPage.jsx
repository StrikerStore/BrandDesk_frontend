import { Link } from 'react-router-dom';
import styles from './NotFoundPage.module.css';

export default function NotFoundPage({
  title = 'Page not found',
  message = 'That link doesn’t point anywhere in BrandDesk.',
}) {
  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <p className={styles.title}>{title}</p>
        <p className={styles.sub}>{message}</p>
        <Link className={styles.link} to="/inbox">Back to inbox</Link>
      </div>
    </div>
  );
}
