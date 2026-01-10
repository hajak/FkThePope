import { useUiStore } from '../../stores/ui-store';
import './ConnectionStatus.css';

export function ConnectionStatus() {
  const isConnected = useUiStore((s) => s.isConnected);
  const isReconnecting = useUiStore((s) => s.isReconnecting);
  const reconnectAttempts = useUiStore((s) => s.reconnectAttempts);

  if (isConnected && !isReconnecting) {
    return null; // Don't show when connected
  }

  return (
    <div
      className={`connection-status ${isReconnecting ? 'reconnecting' : 'disconnected'}`}
      role="alert"
      aria-live="polite"
    >
      <div className="connection-status-content">
        {isReconnecting ? (
          <>
            <div className="spinner" aria-hidden="true" />
            <span>Reconnecting... (attempt {reconnectAttempts})</span>
          </>
        ) : (
          <>
            <span className="status-icon" aria-hidden="true">⚠</span>
            <span>Disconnected from server</span>
          </>
        )}
      </div>
    </div>
  );
}
