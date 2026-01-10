import { useUiStore } from '../../stores/ui-store';
import './Toast.css';

export function Toast() {
  const message = useUiStore((s) => s.toastMessage);
  const type = useUiStore((s) => s.toastType);
  const hideToast = useUiStore((s) => s.hideToast);

  if (!message) return null;

  return (
    <div className={`toast toast-${type}`} onClick={hideToast}>
      {message}
    </div>
  );
}
