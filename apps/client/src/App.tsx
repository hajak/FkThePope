import { Routes, Route, Navigate } from 'react-router-dom';
import { useSocket } from './socket/use-socket';
import { useGameStore } from './stores/game-store';
import { LobbyPage } from './pages/LobbyPage';
import { GamePage } from './pages/GamePage';
import { Toast } from './components/ui/Toast';
import { ConnectionStatus } from './components/ui/ConnectionStatus';

export function App() {
  // Setup socket connection
  useSocket();

  const gameState = useGameStore((s) => s.gameState);

  return (
    <div className="app">
      <ConnectionStatus />
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
    </div>
  );
}
