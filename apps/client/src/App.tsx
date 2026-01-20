import { Routes, Route, Navigate } from 'react-router-dom';
import { useSocket } from './socket/use-socket';
import { useGameStore, useGameType } from './stores/game-store';
import { LobbyPage } from './pages/LobbyPage';
import { GamePage } from './pages/GamePage';
import { BridgeGamePage } from './pages/BridgeGamePage';
import { SkitgubbeGamePage } from './pages/SkitgubbeGamePage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminPage } from './pages/AdminPage';
import { Toast } from './components/ui/Toast';
import { ConnectionStatus } from './components/ui/ConnectionStatus';

function GameRouter() {
  const gameType = useGameType();
  const gameState = useGameStore((s) => s.gameState);
  const bridgeState = useGameStore((s) => s.bridgeState);
  const skitgubbeState = useGameStore((s) => s.skitgubbeState);

  // Check if any game is active
  const hasActiveGame = gameState || bridgeState || skitgubbeState;

  if (!hasActiveGame) {
    return <Navigate to="/" replace />;
  }

  switch (gameType) {
    case 'bridge':
      return <BridgeGamePage />;
    case 'skitgubbe':
      return <SkitgubbeGamePage />;
    case 'whist':
    default:
      return <GamePage />;
  }
}

export function App() {
  // Setup socket connection
  useSocket();

  const gameState = useGameStore((s) => s.gameState);
  const bridgeState = useGameStore((s) => s.bridgeState);
  const skitgubbeState = useGameStore((s) => s.skitgubbeState);

  // Check if any game is active
  const hasActiveGame = gameState || bridgeState || skitgubbeState;

  return (
    <div className="app">
      <ConnectionStatus />
      <Routes>
        <Route
          path="/"
          element={
            hasActiveGame ? <Navigate to="/game" replace /> : <LobbyPage />
          }
        />
        <Route
          path="/game"
          element={<GameRouter />}
        />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
      <Toast />
    </div>
  );
}
