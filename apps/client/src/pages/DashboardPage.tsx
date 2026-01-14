import { useState, useEffect } from 'react';
import { useAnalyticsStore } from '../stores/analytics-store';
import './DashboardPage.css';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function StatCard({ title, value, subtitle }: { title: string; value: string | number; subtitle?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-title">{title}</div>
      {subtitle && <div className="stat-subtitle">{subtitle}</div>}
    </div>
  );
}

function BarChart({ data, title }: { data: Array<{ date: string; count: number }>; title: string }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="chart-container">
      <h3>{title}</h3>
      <div className="bar-chart">
        {data.map((item, i) => (
          <div key={i} className="bar-item">
            <div className="bar-wrapper">
              <div
                className="bar"
                style={{ height: `${(item.count / maxCount) * 100}%` }}
              />
            </div>
            <div className="bar-label">{item.date.slice(5)}</div>
            <div className="bar-value">{item.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PieChart({ data, title }: { data: { mobile: number; desktop: number }; title: string }) {
  const total = data.mobile + data.desktop;
  const mobilePercent = total > 0 ? Math.round((data.mobile / total) * 100) : 0;
  const desktopPercent = 100 - mobilePercent;

  return (
    <div className="chart-container">
      <h3>{title}</h3>
      <div className="pie-chart-wrapper">
        <div
          className="pie-chart"
          style={{
            background: `conic-gradient(var(--color-accent) 0% ${mobilePercent}%, var(--color-primary) ${mobilePercent}% 100%)`
          }}
        />
        <div className="pie-legend">
          <div className="pie-legend-item">
            <span className="pie-dot mobile" />
            <span>Mobile: {data.mobile} ({mobilePercent}%)</span>
          </div>
          <div className="pie-legend-item">
            <span className="pie-dot desktop" />
            <span>Desktop: {data.desktop} ({desktopPercent}%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CountryTable({ data, title }: { data: Record<string, number>; title: string }) {
  const sorted = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <div className="chart-container">
      <h3>{title}</h3>
      <div className="country-table">
        {sorted.length === 0 ? (
          <div className="no-data">No data yet</div>
        ) : (
          sorted.map(([country, count]) => (
            <div key={country} className="country-row">
              <span className="country-name">{country}</span>
              <span className="country-count">{count}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SessionsTable({ data }: { data: Array<{ clientId: string; startTime: number; endTime: number | null; deviceType: string; country: string | null; duration: number }> }) {
  return (
    <div className="chart-container sessions-container">
      <h3>Recent Sessions</h3>
      <div className="sessions-table">
        {data.length === 0 ? (
          <div className="no-data">No sessions yet</div>
        ) : (
          data.map((session, i) => (
            <div key={i} className={`session-row ${!session.endTime ? 'active' : ''}`}>
              <span className="session-device">{session.deviceType === 'mobile' ? '📱' : '💻'}</span>
              <span className="session-id">{session.clientId}</span>
              <span className="session-country">{session.country || '?'}</span>
              <span className="session-duration">{formatDuration(session.duration)}</span>
              <span className="session-status">{session.endTime ? '' : '🟢'}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const {
    isAuthenticated,
    authToken,
    dashboardData,
    isLoading,
    error,
    lastUpdated,
    login,
    logout,
    fetchDashboard,
    clearError,
  } = useAnalyticsStore();

  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Try to fetch dashboard if we have a token
  useEffect(() => {
    if (authToken && !dashboardData && !isLoading) {
      fetchDashboard();
    }
  }, [authToken, dashboardData, isLoading, fetchDashboard]);

  // Auto-refresh every 30 seconds when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const interval = setInterval(fetchDashboard, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, fetchDashboard]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const success = await login(password);
    if (!success) {
      setLoginError(error || 'Login failed');
    } else {
      setPassword('');
      fetchDashboard();
    }
  };

  // Login form
  if (!isAuthenticated) {
    return (
      <div className="dashboard-page">
        <div className="login-container">
          <div className="login-card">
            <h1>Analytics Dashboard</h1>
            <p className="login-subtitle">Whist Online Usage Statistics</p>
            <form onSubmit={handleLogin}>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
              <button type="submit" className="btn-primary" disabled={isLoading || !password}>
                {isLoading ? 'Loading...' : 'Login'}
              </button>
            </form>
            {(loginError || error) && (
              <div className="login-error">{loginError || error}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (!dashboardData && isLoading) {
    return (
      <div className="dashboard-page">
        <div className="loading-container">
          <div className="loading-spinner" />
          <p>Loading analytics...</p>
        </div>
      </div>
    );
  }

  // Dashboard content
  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Whist Analytics</h1>
          {lastUpdated && (
            <span className="last-updated">
              Updated: {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="header-right">
          <button className="btn-secondary" onClick={fetchDashboard} disabled={isLoading}>
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button className="btn-secondary" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {error && (
        <div className="dashboard-error">
          {error}
          <button onClick={clearError}>Dismiss</button>
        </div>
      )}

      {dashboardData && (
        <>
          {/* Stats cards */}
          <div className="stats-grid">
            <StatCard
              title="Active Games"
              value={dashboardData.activeGames}
              subtitle="Currently playing"
            />
            <StatCard
              title="Active Sessions"
              value={dashboardData.activeSessions}
              subtitle="Users online now"
            />
            <StatCard
              title="Total Games"
              value={dashboardData.totalGamesPlayed}
              subtitle="All time"
            />
            <StatCard
              title="Unique Users"
              value={dashboardData.totalUniqueUsers}
              subtitle="All time"
            />
            <StatCard
              title="Games (24h)"
              value={dashboardData.gamesLast24Hours}
              subtitle="Last 24 hours"
            />
            <StatCard
              title="Games (7d)"
              value={dashboardData.gamesLast7Days}
              subtitle="Last 7 days"
            />
            <StatCard
              title="Avg Session"
              value={formatDuration(dashboardData.averageSessionDuration)}
              subtitle="Duration"
            />
          </div>

          {/* Charts */}
          <div className="charts-grid">
            <BarChart
              data={dashboardData.gamesPerDay}
              title="Games Per Day (Last 14 Days)"
            />
            <PieChart
              data={dashboardData.deviceBreakdown}
              title="Device Breakdown"
            />
            <CountryTable
              data={dashboardData.countryBreakdown}
              title="Top Countries"
            />
            <SessionsTable data={dashboardData.recentSessions} />
          </div>
        </>
      )}
    </div>
  );
}
