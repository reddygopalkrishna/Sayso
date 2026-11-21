import type { DictationState } from '../../shared/status.ts';
import { useStatus } from './useStatus.ts';

function content(state: DictationState): { text: string; dot: string } | null {
  switch (state.phase) {
    case 'listening':
      return { text: 'Listening…', dot: 'bg-red-500 animate-pulse' };
    case 'transcribing':
      return { text: 'Transcribing…', dot: 'bg-sky-400 animate-pulse' };
    case 'inserting':
      return { text: 'Typing…', dot: 'bg-sky-400' };
    case 'error':
      return { text: state.message, dot: 'bg-amber-400' };
    case 'idle':
      return null;
  }
}

/** The floating listening pill (its own transparent, non-focusable window). */
export function Pill(): React.JSX.Element | null {
  const status = useStatus();
  const shown = status ? content(status.dictation) : null;
  if (!shown) return null;
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex max-w-full items-center gap-2 rounded-full bg-neutral-900/90 px-4 py-2 text-xs text-white shadow-lg">
        <span className={`h-2 w-2 shrink-0 rounded-full ${shown.dot}`} />
        <span className="truncate">{shown.text}</span>
      </div>
    </div>
  );
}
