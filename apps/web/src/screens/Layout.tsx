import type { ReactNode } from 'react';
import { href } from '../router.js';

export function Screen({ title, back = true, children }: { title: string; back?: boolean; children: ReactNode }) {
  return (
    <div className="screen">
      <header className="topbar">
        {back ? (
          <a className="topbar__back" href={href({ name: 'home' })} aria-label="Back to home">
            ←
          </a>
        ) : null}
        <h1 className="topbar__title">{title}</h1>
      </header>
      <main className="screen__body">{children}</main>
    </div>
  );
}
