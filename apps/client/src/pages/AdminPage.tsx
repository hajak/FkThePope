import { useEffect, useState } from 'react';
import { useAdminStore, type AdminGameInfo } from '../stores/admin-store';
import type { PlayerPosition, Card } from '@fkthepope/shared';
import './AdminPage.css';

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

  // Auto-connect if we have a token
  useEffect(() => {
    if (authToken && !isConnected) {
      connect();
    }
  }, [authToken, isConnected, connect]);

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
          <h1>Admin Dashboard</h1>
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
          <h1>Admin Dashboard</h1>
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="admin-stats">
          <span>Connections: {totalConnections}</span>
          <span>Uptime: {formatUptime(serverUptime)}</span>
          <span>Rooms: {rooms.length}</span>
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
