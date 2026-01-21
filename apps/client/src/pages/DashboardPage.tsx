import { useState, useEffect } from 'react';
import { useAnalyticsStore } from '../stores/analytics-store';
import './DashboardPage.css';

type TimePeriod = '7d' | '30d' | 'all';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString();
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function PeriodLabel({ period }: { period: TimePeriod }) {
  switch (period) {
    case '7d': return <>Last 7 Days</>;
    case '30d': return <>Last 30 Days</>;
    case 'all': return <>All Time</>;
  }
}

function StatCard({ title, value, subtitle }: { title: string; value: string | number; subtitle?: React.ReactNode }) {
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

function GameTypePieChart({ data, title }: { data: Record<string, number>; title: string }) {
  const total = (data.whist || 0) + (data.bridge || 0) + (data.skitgubbe || 0);
  if (total === 0) {
    return (
      <div className="chart-container">
        <h3>{title}</h3>
        <div className="no-data">No games recorded yet</div>
      </div>
    );
  }

  const whistPercent = Math.round(((data.whist || 0) / total) * 100);
  const bridgePercent = Math.round(((data.bridge || 0) / total) * 100);
  const skitgubbePercent = 100 - whistPercent - bridgePercent;

  // Calculate conic gradient stops
  const whistEnd = whistPercent;
  const bridgeEnd = whistEnd + bridgePercent;

  return (
    <div className="chart-container">
      <h3>{title}</h3>
      <div className="pie-chart-wrapper">
        <div
          className="pie-chart"
          style={{
            background: `conic-gradient(
              #3b82f6 0% ${whistEnd}%,
              #10b981 ${whistEnd}% ${bridgeEnd}%,
              #f59e0b ${bridgeEnd}% 100%
            )`
          }}
        />
        <div className="pie-legend">
          <div className="pie-legend-item">
            <span className="pie-dot" style={{ backgroundColor: '#3b82f6' }} />
            <span>Whist: {data.whist || 0} ({whistPercent}%)</span>
          </div>
          <div className="pie-legend-item">
            <span className="pie-dot" style={{ backgroundColor: '#10b981' }} />
            <span>Bridge: {data.bridge || 0} ({bridgePercent}%)</span>
          </div>
          <div className="pie-legend-item">
            <span className="pie-dot" style={{ backgroundColor: '#f59e0b' }} />
            <span>Skitgubbe: {data.skitgubbe || 0} ({skitgubbePercent}%)</span>
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

// Generate a color for a version based on index
function getVersionColor(_version: string, index: number): string {
  const colors = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#f97316', // orange
    '#ec4899', // pink
    '#84cc16', // lime
    '#6366f1', // indigo
  ];
  return colors[index % colors.length] || '#64748b';
}

function VersionStackedChart({ data, title }: { data: Array<{ date: string; versions: Record<string, number> }>; title: string }) {
  // Get all unique versions across all days
  const allVersions = new Set<string>();
  for (const day of data) {
    for (const version of Object.keys(day.versions)) {
      allVersions.add(version);
    }
  }

  // Sort versions: newest first, unknown last
  const sortedVersions = Array.from(allVersions).sort((a, b) => {
    if (a === 'unknown') return 1;
    if (b === 'unknown') return -1;
    return b.localeCompare(a, undefined, { numeric: true });
  });

  // Find max total per day for scaling
  const maxTotal = Math.max(...data.map(day =>
    Object.values(day.versions).reduce((sum, count) => sum + count, 0)
  ), 1);

  // Filter to only show days with data
  const dataWithContent = data.filter(day => Object.keys(day.versions).length > 0);

  return (
    <div className="chart-container">
      <h3>{title}</h3>
      <div className="stacked-chart">
        {dataWithContent.length === 0 ? (
          <div className="no-data">No data yet</div>
        ) : (
          <>
            <div className="stacked-bars">
              {data.map((day, i) => {
                const total = Object.values(day.versions).reduce((sum, count) => sum + count, 0);
                return (
                  <div key={i} className="stacked-bar-column">
                    <div className="stacked-bar-wrapper" style={{ height: `${(total / maxTotal) * 100}%` }}>
                      {sortedVersions.map((version, vIndex) => {
                        const count = day.versions[version] || 0;
                        if (count === 0) return null;
                        const heightPercent = (count / total) * 100;
                        return (
                          <div
                            key={version}
                            className="stacked-segment"
                            style={{
                              height: `${heightPercent}%`,
                              backgroundColor: getVersionColor(version, vIndex),
                            }}
                            title={`v${version}: ${count}`}
                          />
                        );
                      })}
                    </div>
                    <div className="stacked-bar-label">{day.date.slice(5)}</div>
                    <div className="stacked-bar-value">{total || ''}</div>
                  </div>
                );
              })}
            </div>
            <div className="stacked-legend">
              {sortedVersions.slice(0, 6).map((version, index) => (
                <div key={version} className="stacked-legend-item">
                  <span
                    className="stacked-legend-dot"
                    style={{ backgroundColor: getVersionColor(version, index) }}
                  />
                  <span>v{version}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SessionsTable({ data }: { data: Array<{ clientId: string; playerName: string | null; startTime: number; endTime: number | null; deviceType: string; country: string | null; duration: number }> }) {
  return (
    <div className="chart-container sessions-container">
      <h3>Recent Sessions</h3>
      <div className="sessions-table">
        <div className="sessions-header">
          <span></span>
          <span>Name</span>
          <span>Started</span>
          <span>Country</span>
          <span>Duration</span>
          <span></span>
        </div>
        {data.length === 0 ? (
          <div className="no-data">No sessions yet</div>
        ) : (
          data.map((session, i) => (
            <div key={i} className={`session-row ${!session.endTime ? 'active' : ''}`}>
              <span className="session-device">{session.deviceType === 'mobile' ? '📱' : '💻'}</span>
              <span className="session-name">{session.playerName || 'Guest'}</span>
              <span className="session-time">{formatDateTime(session.startTime)}</span>
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

function PlayersTable({ data }: { data: Array<{ playerId: string; playerName: string; firstSeen: number; lastSeen: number; totalSessions: number; totalGamesPlayed: number; totalPlayTime: number; lastCountry: string | null; lastDeviceType: 'mobile' | 'desktop' }> }) {
  return (
    <div className="chart-container players-container">
      <h3>Player Statistics</h3>
      <div className="players-table">
        {data.length === 0 ? (
          <div className="no-data">No player data yet</div>
        ) : (
          <>
            <div className="players-header">
              <span className="player-name-col">Name</span>
              <span className="player-sessions-col">Sessions</span>
              <span className="player-games-col">Games</span>
              <span className="player-time-col">Play Time</span>
              <span className="player-last-col">Last Seen</span>
            </div>
            {data.map((player) => (
              <div key={player.playerId} className="player-row">
                <span className="player-name-col">
                  {player.lastDeviceType === 'mobile' ? '📱' : '💻'} {player.playerName}
                </span>
                <span className="player-sessions-col">{player.totalSessions}</span>
                <span className="player-games-col">{player.totalGamesPlayed}</span>
                <span className="player-time-col">{formatDuration(player.totalPlayTime)}</span>
                <span className="player-last-col">{formatDate(player.lastSeen)}</span>
              </div>
            ))}
          </>
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
    selectedPeriod,
    login,
    logout,
    fetchDashboard,
    setSelectedPeriod,
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
            <p className="login-subtitle">Cards Online Usage Statistics</p>
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
          <h1>Cards Analytics</h1>
          {lastUpdated && (
            <span className="last-updated">
              Updated: {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="header-right">
          <button className="btn-secondary" onClick={() => fetchDashboard()} disabled={isLoading}>
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
          {/* Period selector */}
          <div className="period-selector">
            <label>Time Period:</label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as TimePeriod)}
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>

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
              title="Period Games"
              value={dashboardData.periodStats?.gamesPlayed ?? 0}
              subtitle={<PeriodLabel period={selectedPeriod} />}
            />
            <StatCard
              title="Period Users"
              value={dashboardData.periodStats?.uniqueUsers ?? 0}
              subtitle={<PeriodLabel period={selectedPeriod} />}
            />
            <StatCard
              title="Avg Session"
              value={formatDuration(dashboardData.periodStats?.averageSessionDuration ?? 0)}
              subtitle={<PeriodLabel period={selectedPeriod} />}
            />
            <StatCard
              title="Total Play Time"
              value={formatDuration(dashboardData.periodStats?.totalPlayTime ?? 0)}
              subtitle={<PeriodLabel period={selectedPeriod} />}
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
            <GameTypePieChart
              data={dashboardData.gameTypeBreakdown || {}}
              title="Game Types Played"
            />
            <CountryTable
              data={dashboardData.countryBreakdown}
              title="Top Countries"
            />
            <VersionStackedChart
              data={dashboardData.versionPerDay || []}
              title="Version Usage Over Time"
            />
            <SessionsTable data={dashboardData.recentSessions} />
          </div>

          {/* Players table */}
          <PlayersTable data={dashboardData.players || []} />
        </>
      )}
    </div>
  );
}
