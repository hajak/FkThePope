import { Routes, Route, Navigate } from 'react-router-dom';
import { useSocket } from './socket/use-socket';
import { useGameStore } from './stores/game-store';
import { LobbyPage } from './pages/LobbyPage';
import { GamePage } from './pages/GamePage';
import { Toast } from './components/ui/Toast';

export function App() {
  // Setup socket connection
  useSocket();

  const isConnected = useGameStore((s) => s.isConnected);
  const gameState = useGameStore((s) => s.gameState);

  return (
    <div className="app">
      <Routes>
        <Route
          path="/"
          element={
            gameState ? <Navigate to="/game" replace /> : <LobbyPage />
          }
        />
        <Route
          path="/game"
          element={
            gameState ? <GamePage /> : <Navigate to="/" replace />
          }
        />
      </Routes>
      <Toast />
      {!isConnected && (
        <div className="connection-status">
          Connecting...
        </div>
      )}
    </div>
  );
}
