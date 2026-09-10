'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, ArrowUpRight } from 'lucide-react';
import { NAV, NAV_GROUPS } from './app-nav';

export function WorkspaceSearch({ geoEnabled = true }: { geoEnabled?: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = NAV.filter(item => (!item.geo || geoEnabled) && item.href !== '/admin').filter(item => {
    const group = NAV_GROUPS.find(group => (group.items as readonly string[]).includes(item.href));
    return `${item.label} ${group?.title ?? ''} ${group?.description ?? ''}`.toLowerCase().includes(query.toLowerCase().trim());
  });

  function open() {
    if (dialog.current?.open) return;
    setQuery(''); setActive(0);
    dialog.current?.showModal();
    input.current?.focus();
  }
  function close() { dialog.current?.close(); trigger.current?.focus(); }
  function navigate(href: string) { close(); router.push(href); }

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (dialog.current?.open) dialog.current.close(); else open();
      }
    }
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);

  useEffect(() => {
    dialog.current?.querySelector(`#workspace-result-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return <>
    <button ref={trigger} type="button" className="workspace-search-trigger" onClick={open} aria-label="Search workspace" aria-haspopup="dialog"><Search size={16} /><span>Search workspace</span><kbd>⌘ / Ctrl K</kbd></button>
    <dialog ref={dialog} className="workspace-search-dialog" aria-labelledby="workspace-search-title" onClick={event => { if (event.target === event.currentTarget) close(); }} onClose={() => trigger.current?.focus()}>
      <div className="workspace-search-heading"><h2 id="workspace-search-title">Where would you like to go?</h2><button type="button" aria-label="Close search" onClick={close}><X size={18} /></button></div>
      <div className="workspace-search-field"><Search size={18} aria-hidden="true" /><input ref={input} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} placeholder="Search reports, campaigns, settings…" aria-label="Search pages" role="combobox" aria-expanded="true" aria-controls="workspace-search-results" aria-autocomplete="list" aria-activedescendant={results.length ? `workspace-result-${active}` : undefined} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setActive(index => results.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0);
        }
        if (event.key === 'Enter' && results[active]) { event.preventDefault(); navigate(results[active].href); }
      }} /></div>
      <ul id="workspace-search-results" role="listbox" aria-label="Workspace pages">
        {results.map((item, index) => <li key={item.href} id={`workspace-result-${index}`} role="option" aria-selected={active === index} onMouseMove={() => setActive(index)} onClick={() => navigate(item.href)}><item.icon size={18} aria-hidden="true" /><span>{item.label}</span><ArrowUpRight size={15} aria-hidden="true" /></li>)}
      </ul>
      {!results.length && <p className="workspace-search-empty" role="status">No pages match “{query}”. Try reports, signals, or settings.</p>}
      <p className="workspace-search-help">↑ ↓ to browse · Enter to open · Esc to close</p>
    </dialog>
  </>;
}
