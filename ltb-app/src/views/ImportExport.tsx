import { useEffect, useRef, useState } from 'preact/hooks';
import { buildConfigDocument, unwrapShortcode, validateImport, wrapAsShortcode } from '../services/persistence';
import { markSeedApplied } from '../services/seed';
import { useStore } from '../state/provider';

type Mode = 'export' | 'import';
type Message = { kind: 'ok' | 'error'; text: string };

export function ImportExport() {
  const { state, dispatch } = useStore();
  const [mode, setMode] = useState<Mode | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [replace, setReplace] = useState(true);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Preserve each named filter and its saved operator, including empty filters.
  const exportableTempFilters = () => {
    const filters = state.tempFilters;
    if (filters.length === 0) return undefined;
    const activeId = filters.some((f) => f.id === state.activeTempFilterId) ? state.activeTempFilterId : filters[0]!.id;
    return { filters, activeId, enabled: state.tempFilterEnabled };
  };

  const exportText = () =>
    wrapAsShortcode(
      JSON.stringify(
        buildConfigDocument({
          sourceUrl: state.source.baseUrl,
          assignments: state.assignments,
          destinationExclusions: state.destinationExclusions,
          postSelections: state.postSelections,
          excludedTermKeys: state.excludedTermKeys,
          unresolvedAssignments: state.unresolvedAssignments,
          tempFilters: exportableTempFilters(),
        }),
        null,
        2,
      ),
    );

  const importText = (text: string, replaceExisting = replace): boolean => {
    try {
      const body = unwrapShortcode(text);
      if (!body) throw new Error('Nothing to import. Paste a configuration JSON document first.');
      const parsed: unknown = JSON.parse(body);
      const result = validateImport(parsed, {
        sourceUrl: state.source.baseUrl,
        excludedTermKeys: new Set(state.excludedTermKeys),
        knownTermKeys: state.termsInventory.complete ? new Set(Object.keys(state.termsByKey) as never[]) : null,
      });
      dispatch({ type: 'IMPORT_CONFIG', assignments: result.assignments, unresolved: result.unresolved, replace: replaceExisting, postSelections: result.postSelections, destinationExclusions: result.destinationExclusions, tempFilters: result.tempFilters });
      const n = Object.keys(result.assignments).length;
      const parts = [`Imported ${n} assignment${n === 1 ? '' : 's'}.`];
      if (result.postSelections) parts.push(Object.keys(result.postSelections).length + ' post selections restored.');
      if (result.tempFilters) parts.push(`${result.tempFilters.filters.length} temporary filter${result.tempFilters.filters.length === 1 ? '' : 's'} restored.`);
      if (result.unresolved.length) parts.push(`${result.unresolved.length} entr${result.unresolved.length === 1 ? 'y' : 'ies'} need review.`);
      setMessage({ kind: 'ok', text: parts.join(' ') });
      return true;
    } catch (e) {
      const detail = e instanceof SyntaxError ? `Invalid JSON (${e.message})` : e instanceof Error ? e.message : String(e);
      setMessage({ kind: 'error', text: `Import failed: ${detail}. Existing assignments were not changed.` });
      return false;
    }
  };

  const open = (m: Mode, ev: Event) => {
    triggerRef.current = ev.currentTarget as HTMLElement;
    setMode(m);
  };
  const close = () => {
    setMode(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const p = state.persistence;
  return (
    <aside class="ltb-import-export" aria-labelledby="ltb-ie-heading">
      <h3 id="ltb-ie-heading" class="ltb-h3">
        Configuration
      </h3>
      <p class="ltb-muted ltb-persist-status" role="status">
        {p.status === 'saved' && (p.lastSavedAt ? `Saved locally at ${new Date(p.lastSavedAt).toLocaleTimeString()}` : 'Saved locally')}
        {p.status === 'saving' && 'Saving…'}
        {p.status === 'unsaved' && 'Unsaved changes'}
        {p.status === 'error' && <span class="ltb-text-error">Save failed: {p.error}. Export your configuration to avoid losing work.</span>}
      </p>
      <div class="ltb-ie-actions">
        <button type="button" class="ltb-btn" onClick={(e) => open('export', e)}>
          Export…
        </button>
        <button type="button" class="ltb-btn" onClick={(e) => open('import', e)}>
          Import…
        </button>
        {state.pageSeed && (
          <button
            type="button"
            class="ltb-btn"
            title="Replace the current mapping with the configuration embedded in this page's shortcode"
            onClick={() => {
              if (window.confirm('Replace the current mapping with the configuration embedded in this page?')) {
                const ok = importText(state.pageSeed!, true);
                if (ok) markSeedApplied(state.source.baseUrl, state.pageSeed!);
              }
            }}
          >
            Re-import page configuration
          </button>
        )}
      </div>
      {message && (
        <p class={`ltb-ie-message is-${message.kind}`} role="status">
          {message.text}
        </p>
      )}
      {state.unresolvedAssignments.length > 0 && (
        <details class="ltb-unresolved">
          <summary>{state.unresolvedAssignments.length} unresolved import entries</summary>
          <ul>
            {state.unresolvedAssignments.map((u, i) => (
              <li key={i}>
                <code>{u.termKey}</code> → {u.destination}: {u.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {mode === 'export' && <ExportDialog json={exportText()} onClose={close} />}
      {mode === 'import' && (
        <ImportDialog
          replace={replace}
          onReplaceChange={setReplace}
          onImport={(text) => importText(text) && close()}
          onClose={close}
        />
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------------ */

function useModal(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [onClose]);
  const onBackdropClick = (e: MouseEvent) => e.target === ref.current && onClose();
  return { ref, onBackdropClick };
}

function ExportDialog({ json, onClose }: { json: string; onClose: () => void }) {
  const { ref, onBackdropClick } = useModal(onClose);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    textRef.current?.focus();
    textRef.current?.select();
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setStatus('Copied to clipboard.');
    } catch {
      textRef.current?.select();
      const ok = document.execCommand?.('copy');
      setStatus(ok ? 'Copied to clipboard.' : 'Clipboard access was blocked — select the text and copy it manually.');
    }
  };

  const download = () => {
    const blob = new Blob([json], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `living-term-mapping-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <dialog ref={ref} class="ltb-dialog ltb-dialog-wide" aria-labelledby="ltb-export-title" onClick={onBackdropClick}>
      <div class="ltb-dialog-body">
        <h2 id="ltb-export-title" class="ltb-dialog-title">
          Export configuration
        </h2>
        <p class="ltb-dialog-text">Ready to paste into a WordPress page as the shortcode, or into Import on another browser. Includes assignments and temporary filters.</p>
        <textarea ref={textRef} class="ltb-textarea" readOnly rows={14} value={json} aria-label="Configuration JSON" onFocus={(e) => (e.currentTarget as HTMLTextAreaElement).select()} />
        {status && (
          <p class="ltb-muted ltb-dialog-status" role="status">
            {status}
          </p>
        )}
        <div class="ltb-dialog-actions">
          <button type="button" class="ltb-btn" onClick={download}>
            Download file
          </button>
          <button type="button" class="ltb-btn" onClick={onClose}>
            Close
          </button>
          <button type="button" class="ltb-btn ltb-btn-primary" onClick={copy}>
            Copy to clipboard
          </button>
        </div>
      </div>
    </dialog>
  );
}

function ImportDialog({
  replace,
  onReplaceChange,
  onImport,
  onClose,
}: {
  replace: boolean;
  onReplaceChange: (v: boolean) => void;
  onImport: (text: string) => void;
  onClose: () => void;
}) {
  const { ref, onBackdropClick } = useModal(onClose);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => textRef.current?.focus(), []);

  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setText(t);
      setStatus(t ? 'Pasted from clipboard.' : 'Clipboard is empty.');
    } catch {
      setStatus('Clipboard access was blocked — paste into the box with Ctrl+V / Cmd+V instead.');
      textRef.current?.focus();
    }
  };

  const loadFile = async (file: File) => {
    setText(await file.text());
    setStatus(`Loaded ${file.name}.`);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <dialog ref={ref} class="ltb-dialog ltb-dialog-wide" aria-labelledby="ltb-import-title" onClick={onBackdropClick}>
      <div class="ltb-dialog-body">
        <h2 id="ltb-import-title" class="ltb-dialog-title">
          Import configuration
        </h2>
        <p class="ltb-dialog-text">
          Paste an exported configuration below (with or without the shortcode wrapper). Entries with conflicting or unknown destinations are kept for review rather than applied.
        </p>
        <textarea
          ref={textRef}
          class="ltb-textarea"
          rows={14}
          value={text}
          placeholder='{ "schemaVersion": 1, "assignments": { "category:123": "athletics" } }'
          aria-label="Configuration JSON to import"
          spellcheck={false}
          onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
        />
        <div class="ltb-dialog-row">
          <button type="button" class="ltb-btn ltb-btn-small" onClick={pasteFromClipboard}>
            Paste from clipboard
          </button>
          <button type="button" class="ltb-btn ltb-btn-small" onClick={() => fileRef.current?.click()}>
            Load file…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json,.txt"
            hidden
            onChange={(e) => {
              const f = (e.currentTarget as HTMLInputElement).files?.[0];
              if (f) void loadFile(f);
            }}
          />
          <label class="ltb-checkbox">
            <input type="checkbox" checked={replace} onChange={(e) => onReplaceChange((e.currentTarget as HTMLInputElement).checked)} /> Replace existing assignments
          </label>
        </div>
        {status && (
          <p class="ltb-muted ltb-dialog-status" role="status">
            {status}
          </p>
        )}
        <div class="ltb-dialog-actions">
          <button type="button" class="ltb-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" class="ltb-btn ltb-btn-primary" disabled={!text.trim()} onClick={() => onImport(text)}>
            Import
          </button>
        </div>
      </div>
    </dialog>
  );
}
