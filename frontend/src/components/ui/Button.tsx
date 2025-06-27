import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export default function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={styles.button} {...props} />;
}
