import { useStatus } from './useStatus.ts';

/** The preview chip: what is about to happen, with a bar that fills until it runs. Esc cancels. */
export function Chip(): React.JSX.Element | null {
  const status = useStatus();
  const preview = status?.preview;
  if (!preview) return null;
  return (
    <div className="flex h-screen items-center justify-center">
      <div
        key={preview.id}
        className="relative overflow-hidden rounded-xl bg-neutral-900/95 px-4 py-2.5 text-white shadow-lg"
      >
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium">{preview.label}</span>
          <span className="text-xs text-neutral-400">Esc to cancel</span>
        </div>
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-emerald-400"
          style={{ animation: `chip-progress ${preview.ms}ms linear forwards` }}
        />
      </div>
    </div>
  );
}
