import { useEffect, useState, useCallback } from 'react';
import { useAdminStore, type AdminGameInfo } from '../stores/admin-store';
import type { PlayerPosition, Card } from '@fkthepope/shared';
import './AdminPage.css';

// Types for error and event logs
interface ErrorLog {
  id: number;
  timestamp: number;
  level: string;
  source: string;
  message: string;
  stack: string | null;
  context: string | null;
  sessionId: string | null;
  roomId: string | null;
  playerName: string | null;
}

interface SessionEvent {
  id: number;
  timestamp: number;
  sessionId: string;
  eventType: string;
  roomId: string | null;
  playerPosition: string | null;
  details: string | null;
}

type AdminTab = 'rooms' | 'errors' | 'events';

export function AdminPage() {
  const {
    isAuthenticated,
    authToken,
    isLoading,
    error,
    isConnected,
    rooms,
    selectedRoomId,
    totalConnections,
    serverUptime,
    login,
    logout,
    connect,
    selectRoom,
    clearError,
  } = useAdminStore();

  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('rooms');
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Get API base URL
  const apiBase = import.meta.env.PROD
    ? window.location.origin
    : 'http://localhost:3001';

  // Fetch error logs
  const fetchErrorLogs = useCallback(async () => {
    if (!authToken) return;
    setLogsLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/analytics/errors?limit=200`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setErrorLogs(data.errors || []);
      }
    } catch (err) {
      console.error('Failed to fetch error logs:', err);
    } finally {
      setLogsLoading(false);
    }
  }, [authToken, apiBase]);

  // Fetch session events
  const fetchSessionEvents = useCallback(async () => {
    if (!authToken) return;
    setLogsLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/analytics/events?limit=300`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSessionEvents(data.events || []);
      }
    } catch (err) {
      console.error('Failed to fetch session events:', err);
    } finally {
      setLogsLoading(false);
    }
  }, [authToken, apiBase]);

  // Auto-connect if we have a token
  useEffect(() => {
    if (authToken && !isConnected) {
      connect();
    }
  }, [authToken, isConnected, connect]);

  // Periodic refresh to ensure data stays up-to-date (every 30 seconds)
  useEffect(() => {
    if (isConnected && activeTab === 'rooms') {
      const interval = setInterval(() => {
        // Re-subscribe to get fresh data
        connect();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [isConnected, activeTab, connect]);

  // Load logs when tab changes
  useEffect(() => {
    if (activeTab === 'errors') {
      fetchErrorLogs();
    } else if (activeTab === 'events') {
      fetchSessionEvents();
    }
  }, [activeTab, fetchErrorLogs, fetchSessionEvents]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(password);
    setPassword('');
  };

  const selectedRoom = rooms.find((r) => r.roomId === selectedRoomId);

  // Format uptime
  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs}h ${mins}m ${secs}s`;
  };

  // Show login if not authenticated
  if (!isAuthenticated && !authToken) {
    return (
      <div className="admin-page">
        <div className="admin-login">
          <h1>Live Monitor</h1>
          <p>Real-time game monitoring</p>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>
          {error && <div className="admin-error">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-title">
          <h1>Live Monitor</h1>
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? 'Live' : 'Offline'}
          </span>
        </div>
        <div className="admin-stats">
          <div className="stat-pill">
            <span className="stat-label">Connections:</span>
            <span className="stat-value">{totalConnections}</span>
          </div>
          <div className="stat-pill">
            <span className="stat-label">Rooms:</span>
            <span className="stat-value">{rooms.length}</span>
          </div>
          <div className="stat-pill uptime">
            <span className="stat-label">Uptime:</span>
            <span className="stat-value">{formatUptime(serverUptime)}</span>
          </div>
        </div>
        <button className="logout-btn" onClick={logout}>
          Logout
        </button>
      </header>

      {error && (
        <div className="admin-error-banner" onClick={clearError}>
          {error} (click to dismiss)
        </div>
      )}

      {/* Tab navigation */}
      <div className="admin-tabs">
        <button
          className={`tab-btn ${activeTab === 'rooms' ? 'active' : ''}`}
          onClick={() => setActiveTab('rooms')}
        >
          Rooms ({rooms.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'errors' ? 'active' : ''}`}
          onClick={() => setActiveTab('errors')}
        >
          Errors ({errorLogs.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          Events ({sessionEvents.length})
        </button>
      </div>

      {/* Rooms tab */}
      {activeTab === 'rooms' && (
        <div className="admin-layout">
          {/* Room list sidebar */}
          <aside className="room-list">
            <h2>Active Rooms ({rooms.length})</h2>
            {rooms.length === 0 ? (
              <div className="no-rooms">No active rooms</div>
            ) : (
              rooms.map((room) => (
                <div
                  key={room.roomId}
                  className={`room-item ${selectedRoomId === room.roomId ? 'selected' : ''} ${room.status}`}
                  onClick={() => selectRoom(room.roomId)}
                >
                  <div className="room-name">{room.roomName}</div>
                  <div className="room-meta">
                    <span className={`room-status ${room.status}`}>
                      {room.status === 'playing' ? `Hand ${room.handNumber}` : 'Waiting'}
                    </span>
                    <span className="player-count">
                      {Object.values(room.players).filter(Boolean).length}/4
                    </span>
                  </div>
                </div>
              ))
            )}
          </aside>

          {/* Main content area */}
          <main className="admin-main">
            {selectedRoom ? (
              <RoomDetail room={selectedRoom} />
            ) : (
              <div className="no-selection">
                <p>Select a room to view details</p>
              </div>
            )}
          </main>
        </div>
      )}

      {/* Errors tab */}
      {activeTab === 'errors' && (
        <div className="logs-container">
          <div className="logs-header">
            <h2>Error Logs</h2>
            <button className="refresh-btn" onClick={fetchErrorLogs} disabled={logsLoading}>
              {logsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          <ErrorLogsList logs={errorLogs} />
        </div>
      )}

      {/* Events tab */}
      {activeTab === 'events' && (
        <div className="logs-container">
          <div className="logs-header">
            <h2>Session Events</h2>
            <button className="refresh-btn" onClick={fetchSessionEvents} disabled={logsLoading}>
              {logsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          <SessionEventsList events={sessionEvents} />
        </div>
      )}
    </div>
  );
}

// Room detail component
function RoomDetail({ room }: { room: AdminGameInfo }) {
  const positions: PlayerPosition[] = ['north', 'east', 'south', 'west'];

  return (
    <div className="room-detail">
      <div className="room-header">
        <h2>{room.roomName}</h2>
        <div className="room-info">
          <span>Status: {room.status}</span>
          <span>Phase: {room.phase}</span>
          {room.trumpSuit && (
            <span className={`trump-display trump-${room.trumpSuit}`}>
              Trump: {getSuitSymbol(room.trumpSuit)}
            </span>
          )}
          {room.handNumber > 0 && <span>Hand #{room.handNumber}</span>}
        </div>
      </div>

      {/* Players grid */}
      <div className="players-grid">
        {positions.map((pos) => {
          const player = room.players[pos];
          return (
            <div key={pos} className={`player-card ${pos} ${player ? '' : 'empty'}`}>
              <div className="player-position">{pos.toUpperCase()}</div>
              {player ? (
                <>
                  <div className="player-name">
                    {player.name}
                    {player.isBot && <span className="bot-badge">BOT</span>}
                  </div>
                  <div className={`player-connection ${player.isConnected ? 'online' : 'offline'}`}>
                    {player.isConnected ? 'Online' : 'Offline'}
                  </div>
                  <div className="player-meta">
                    {player.version && <span>v{player.version}</span>}
                    {player.deviceType && <span>{player.deviceType}</span>}
                  </div>
                  <div className="player-tricks">Tricks: {player.tricksWon}</div>
                  {/* Player's hand */}
                  {player.hand.length > 0 && (
                    <div className="player-hand">
                      {player.hand.map((card, i) => (
                        <CardDisplay key={i} card={card} />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-slot">Empty</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Current trick */}
      {room.currentTrick && room.currentTrick.cards.length > 0 && (
        <div className="current-trick">
          <h3>Current Trick (#{room.currentTrick.trickNumber})</h3>
          <div className="trick-cards">
            {room.currentTrick.cards.map((pc, i) => (
              <div key={i} className="played-card">
                <span className="played-by">{pc.playedBy}:</span>
                <CardDisplay card={pc.card} faceDown={pc.faceDown} />
              </div>
            ))}
          </div>
          {room.currentTrick.leadSuit && (
            <div className="lead-suit">
              Lead suit: {getSuitSymbol(room.currentTrick.leadSuit)}
            </div>
          )}
        </div>
      )}

      {/* Turn indicator */}
      {room.currentPlayer && (
        <div className="turn-indicator">
          Waiting for: <strong>{room.currentPlayer}</strong>
        </div>
      )}

      {/* Scores */}
      <div className="scores-section">
        <h3>Scores</h3>
        <div className="scores-grid">
          {positions.map((pos) => (
            <div key={pos} className="score-item">
              <span className="score-pos">{pos}</span>
              <span className="score-val">{room.scores[pos] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Completed tricks (collapsible) */}
      {room.completedTricks.length > 0 && (
        <details className="completed-tricks">
          <summary>Completed Tricks ({room.completedTricks.length})</summary>
          <div className="tricks-list">
            {room.completedTricks.map((trick, i) => (
              <div key={i} className="completed-trick">
                <span className="trick-num">Trick {i + 1}</span>
                <span className="trick-winner">Won by: {trick.winner}</span>
                <div className="trick-cards-mini">
                  {trick.cards.map((pc, j) => (
                    <span key={j} className="mini-card">
                      {pc.playedBy[0]}: <CardDisplay card={pc.card} mini />
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// Card display component
function CardDisplay({
  card,
  faceDown,
  mini,
}: {
  card: Card;
  faceDown?: boolean;
  mini?: boolean;
}) {
  if (faceDown) {
    return <span className={`card face-down ${mini ? 'mini' : ''}`}>[?]</span>;
  }

  const suitColor = card.suit === 'hearts' || card.suit === 'diamonds' ? 'red' : 'black';

  return (
    <span className={`card ${suitColor} ${mini ? 'mini' : ''}`}>
      {card.rank}
      {getSuitSymbol(card.suit)}
    </span>
  );
}

// Helper to get suit symbol
function getSuitSymbol(suit: string): string {
  switch (suit) {
    case 'hearts':
      return '\u2665';
    case 'diamonds':
      return '\u2666';
    case 'clubs':
      return '\u2663';
    case 'spades':
      return '\u2660';
    default:
      return suit;
  }
}

// Format timestamp for display
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

// Error logs list component
function ErrorLogsList({ logs }: { logs: ErrorLog[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Format error for copy/paste to Claude Code
  const formatForClipboard = (log: ErrorLog) => {
    let text = `Error: ${log.message}\n`;
    text += `Source: ${log.source}\n`;
    text += `Level: ${log.level}\n`;
    text += `Time: ${formatTime(log.timestamp)}\n`;
    if (log.playerName) text += `Player: ${log.playerName}\n`;
    if (log.roomId) text += `Room: ${log.roomId}\n`;
    if (log.sessionId) text += `Session: ${log.sessionId}\n`;
    if (log.context) {
      text += `Context: ${log.context}\n`;
    }
    if (log.stack) {
      text += `Stack:\n${log.stack}\n`;
    }
    return text;
  };

  const copyToClipboard = async (log: ErrorLog) => {
    try {
      await navigator.clipboard.writeText(formatForClipboard(log));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (logs.length === 0) {
    return <div className="no-logs">No error logs found</div>;
  }

  return (
    <div className="logs-list">
      {logs.map((log) => (
        <div
          key={log.id}
          className={`log-item error-log ${log.level} ${expanded === log.id ? 'expanded' : ''}`}
        >
          <div className="log-header" onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
            <span className={`log-level ${log.level}`}>{log.level.toUpperCase()}</span>
            <span className="log-source">[{log.source}]</span>
            <span className="log-message">{log.message}</span>
            <span className="log-time">{formatTime(log.timestamp)}</span>
          </div>
          {expanded === log.id && (
            <div className="log-details">
              {log.playerName && <div><strong>Player:</strong> {log.playerName}</div>}
              {log.roomId && <div><strong>Room:</strong> {log.roomId}</div>}
              {log.sessionId && <div><strong>Session:</strong> {log.sessionId}</div>}
              {log.context && (
                <div className="log-context">
                  <strong>Context:</strong>
                  <pre>{JSON.stringify(JSON.parse(log.context), null, 2)}</pre>
                </div>
              )}
              {log.stack && (
                <div className="log-stack">
                  <strong>Stack trace:</strong>
                  <pre>{log.stack}</pre>
                </div>
              )}
              <button className="copy-btn" onClick={() => copyToClipboard(log)}>
                {copied ? 'Copied!' : 'Copy for Claude Code'}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Session events list component
function SessionEventsList({ events }: { events: SessionEvent[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string>('');

  // Get unique event types for filter
  const eventTypes = [...new Set(events.map(e => e.eventType))];

  const filteredEvents = filterType
    ? events.filter(e => e.eventType === filterType)
    : events;

  if (events.length === 0) {
    return <div className="no-logs">No session events found</div>;
  }

  return (
    <div className="events-container">
      <div className="events-filter">
        <label>Filter by type:</label>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">All types</option>
          {eventTypes.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <span className="event-count">Showing {filteredEvents.length} of {events.length}</span>
      </div>
      <div className="logs-list">
        {filteredEvents.map((event) => (
          <div
            key={event.id}
            className={`log-item event-log ${expanded === event.id ? 'expanded' : ''}`}
          >
            <div className="log-header" onClick={() => setExpanded(expanded === event.id ? null : event.id)}>
              <span className={`event-type type-${event.eventType}`}>{event.eventType}</span>
              <span className="event-session">{event.sessionId.slice(0, 8)}...</span>
              {event.playerPosition && <span className="event-position">{event.playerPosition}</span>}
              {event.roomId && <span className="event-room">{event.roomId.slice(0, 8)}...</span>}
              <span className="log-time">{formatTime(event.timestamp)}</span>
            </div>
            {expanded === event.id && event.details && (
              <div className="log-details">
                <div className="event-details">
                  <strong>Details:</strong>
                  <pre>{JSON.stringify(JSON.parse(event.details), null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
