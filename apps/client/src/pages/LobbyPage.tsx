import { useState, useMemo } from 'react';
import { useGameStore } from '../stores/game-store';
import { useLobbyStore } from '../stores/lobby-store';
import { useGameActions } from '../socket/use-socket';
import type { PlayerPosition } from '@fkthepope/shared';
import './LobbyPage.css';

// Word lists for random room names
const adjectives = ['Swift', 'Bold', 'Clever', 'Mighty', 'Noble', 'Royal', 'Lucky', 'Wild', 'Bright', 'Grand', 'Silent', 'Golden', 'Silver', 'Hidden', 'Ancient'];
const nouns = ['Kings', 'Queens', 'Knights', 'Dragons', 'Wizards', 'Ravens', 'Wolves', 'Eagles', 'Lions', 'Tigers', 'Phoenix', 'Foxes', 'Owls', 'Bears', 'Hawks'];
const places = ['Table', 'Court', 'Tower', 'Hall', 'Chamber', 'Den', 'Throne', 'Castle', 'Palace', 'Arena', 'Garden', 'Lodge', 'Keep', 'Lair', 'Sanctum'];

function generateRoomName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const place = places[Math.floor(Math.random() * places.length)];
  return `${adj} ${noun} ${place}`;
}

export function LobbyPage() {
  const [playerName, setPlayerName] = useState('');
  const initialRoomName = useMemo(() => generateRoomName(), []);
  const [roomName, setRoomName] = useState(initialRoomName);
  const [hasJoinedLobby, setHasJoinedLobby] = useState(false);

  const isConnected = useGameStore((s) => s.isConnected);
  const storedName = useGameStore((s) => s.playerName);
  const setStoredName = useGameStore((s) => s.setPlayerName);

  const rooms = useLobbyStore((s) => s.rooms);
  const currentRoom = useLobbyStore((s) => s.currentRoom);

  const { joinLobby, createRoom, joinRoom, leaveRoom, startGame, addBot } = useGameActions();

  const handleJoinLobby = () => {
    if (playerName.trim()) {
      setStoredName(playerName);
      joinLobby(playerName);
      setHasJoinedLobby(true);
    }
  };

  const handleCreateRoom = () => {
    if (roomName.trim()) {
      createRoom(roomName);
      setRoomName(generateRoomName());
    }
  };

  const handleJoinRoom = (roomId: string) => {
    joinRoom(roomId);
  };

  const handleAddBot = (position: PlayerPosition) => {
    addBot(position);
  };

  const handleStartGame = () => {
    startGame();
  };

  // Name entry screen
  if (!hasJoinedLobby) {
    return (
      <div className="lobby-page">
        <div className="lobby-card">
          <div className="lobby-logo">
            <span className="logo-cards">
              <span className="logo-card red">A</span>
              <span className="logo-card black">A</span>
            </span>
            <h1>Whist Online</h1>
          </div>
          <p className="subtitle">Classic 4-player trick-taking card game</p>

          <div className="name-form">
            <input
              type="text"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleJoinLobby()}
              disabled={!isConnected}
            />
            <button
              className="btn-primary"
              onClick={handleJoinLobby}
              disabled={!isConnected || !playerName.trim()}
            >
              Join Lobby
            </button>
          </div>

          {!isConnected && (
            <p className="connection-msg">Connecting to server...</p>
          )}
        </div>
      </div>
    );
  }

  // Room waiting screen
  if (currentRoom) {
    const positions: PlayerPosition[] = ['north', 'east', 'south', 'west'];
    const filledPositions = currentRoom.players.filter(Boolean).length;

    return (
      <div className="lobby-page">
        <div className="lobby-card room-card">
          <h2>Room: {currentRoom.name}</h2>

          <div className="room-players">
            {positions.map((pos, idx) => {
              const player = currentRoom.players[idx];
              return (
                <div key={pos} className={`room-seat ${player ? 'filled' : 'empty'}`}>
                  <span className="seat-position">{pos}</span>
                  {player ? (
                    <span className="seat-name">
                      {player.name}
                      {player.isBot && ' (Bot)'}
                    </span>
                  ) : (
                    <button
                      className="btn-secondary add-bot-btn"
                      onClick={() => handleAddBot(pos)}
                    >
                      + Add Bot
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="room-actions">
            <button className="btn-secondary" onClick={leaveRoom}>
              Leave Room
            </button>
            <button
              className="btn-primary"
              onClick={handleStartGame}
              disabled={filledPositions < 4}
            >
              {filledPositions < 4 ? `Need ${4 - filledPositions} more players` : 'Start Game'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Room list screen
  return (
    <div className="lobby-page">
      <div className="lobby-card">
        <h2>Welcome, {storedName}!</h2>

        <div className="create-room">
          <input
            type="text"
            placeholder="Room name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
          />
          <button
            className="btn-primary"
            onClick={handleCreateRoom}
            disabled={!roomName.trim()}
          >
            Create Room
          </button>
        </div>

        <div className="room-list">
          <h3>Available Rooms</h3>
          {rooms.length === 0 ? (
            <p className="no-rooms">No rooms available. Create one!</p>
          ) : (
            rooms.map((room) => (
              <div key={room.id} className="room-item">
                <div className="room-info">
                  <span className="room-name">{room.name}</span>
                  <span className="room-players-count">
                    {room.playerCount}/4 players
                  </span>
                </div>
                <button
                  className="btn-secondary"
                  onClick={() => handleJoinRoom(room.id)}
                  disabled={room.playerCount >= 4 || room.status === 'playing'}
                >
                  {room.status === 'playing' ? 'In Progress' : 'Join'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
