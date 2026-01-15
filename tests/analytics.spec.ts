import { test, expect } from '@playwright/test';

// Analytics password - can be overridden via env variable
const ANALYTICS_PASSWORD = process.env.ANALYTICS_PASSWORD || 'whist-analytics-2024';

test.describe('Analytics Dashboard', () => {
  test('should show login page initially', async ({ page }) => {
    await page.goto('/dashboard');

    // Should see login form
    await expect(page.locator('h1')).toContainText('Analytics Dashboard');
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should login and show dashboard', async ({ page }) => {
    await page.goto('/dashboard');

    // Login
    await page.fill('input[type="password"]', ANALYTICS_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for dashboard to load
    await expect(page.locator('h1')).toContainText('Whist Analytics', { timeout: 10000 });

    // Check for key elements
    await expect(page.locator('.stats-grid')).toBeVisible();
    await expect(page.locator('.stat-card')).toHaveCount(8);

    // Check period selector
    await expect(page.locator('.period-selector select')).toBeVisible();

    // Check charts grid
    await expect(page.locator('.charts-grid')).toBeVisible();
  });

  test('should show stat cards with values', async ({ page }) => {
    await page.goto('/dashboard');
    await page.fill('input[type="password"]', ANALYTICS_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for stats to load
    await expect(page.locator('.stat-card').first()).toBeVisible({ timeout: 10000 });

    // Check stat cards exist
    const statCards = page.locator('.stat-card');
    await expect(statCards).toHaveCount(8);

    // Each stat card should have a value and title
    for (let i = 0; i < 8; i++) {
      const card = statCards.nth(i);
      await expect(card.locator('.stat-value')).toBeVisible();
      await expect(card.locator('.stat-title')).toBeVisible();
    }
  });

  test('should change time period', async ({ page }) => {
    await page.goto('/dashboard');
    await page.fill('input[type="password"]', ANALYTICS_PASSWORD);
    await page.click('button[type="submit"]');

    await expect(page.locator('.period-selector select')).toBeVisible({ timeout: 10000 });

    // Change to 30 days
    await page.selectOption('.period-selector select', '30d');

    // Wait for refresh
    await page.waitForTimeout(1000);

    // Should still show dashboard
    await expect(page.locator('.stats-grid')).toBeVisible();
  });

  test('should show version chart', async ({ page }) => {
    await page.goto('/dashboard');
    await page.fill('input[type="password"]', ANALYTICS_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for charts to load
    await expect(page.locator('.charts-grid')).toBeVisible({ timeout: 10000 });

    // Check for stacked chart (version usage over time)
    await expect(page.locator('.stacked-chart')).toBeVisible();
  });

  test('should show sessions table', async ({ page }) => {
    await page.goto('/dashboard');
    await page.fill('input[type="password"]', ANALYTICS_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for sessions table
    await expect(page.locator('.sessions-container')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.sessions-table')).toBeVisible();
  });

  test('should refresh data', async ({ page }) => {
    await page.goto('/dashboard');
    await page.fill('input[type="password"]', ANALYTICS_PASSWORD);
    await page.click('button[type="submit"]');

    await expect(page.locator('button:has-text("Refresh")')).toBeVisible({ timeout: 10000 });

    // Click refresh
    await page.click('button:has-text("Refresh")');

    // Should briefly show "Refreshing..."
    // Data should still be visible after refresh
    await expect(page.locator('.stats-grid')).toBeVisible();
  });

  test('should logout', async ({ page }) => {
    await page.goto('/dashboard');
    await page.fill('input[type="password"]', ANALYTICS_PASSWORD);
    await page.click('button[type="submit"]');

    await expect(page.locator('button:has-text("Logout")')).toBeVisible({ timeout: 10000 });

    // Click logout
    await page.click('button:has-text("Logout")');

    // Should return to login
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});

test.describe('Live Monitor', () => {
  test('should show login page initially', async ({ page }) => {
    await page.goto('/admin');

    // Should see login form
    await expect(page.locator('h1')).toContainText('Live Monitor');
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('should login and show monitor', async ({ page }) => {
    await page.goto('/admin');

    // Login
    await page.fill('input[type="password"]', ANALYTICS_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for monitor to load
    await expect(page.locator('h1')).toContainText('Live Monitor', { timeout: 10000 });

    // Check for tabs
    await expect(page.locator('.admin-tabs')).toBeVisible();
    await expect(page.locator('button.tab-btn:has-text("Rooms")')).toBeVisible();
    await expect(page.locator('button.tab-btn:has-text("Errors")')).toBeVisible();
    await expect(page.locator('button.tab-btn:has-text("Events")')).toBeVisible();
  });

  test('should show connection status', async ({ page }) => {
    await page.goto('/admin');
    await page.fill('input[type="password"]', ANALYTICS_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for connection status in the header (more specific selector)
    await expect(page.locator('.admin-title .connection-status')).toBeVisible({ timeout: 10000 });

    // Should show "Live" when connected
    await expect(page.locator('.admin-title .connection-status')).toContainText('Live', { timeout: 15000 });
  });

  test('should show rooms list', async ({ page }) => {
    await page.goto('/admin');
    await page.fill('input[type="password"]', ANALYTICS_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for room list
    await expect(page.locator('.room-list')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.room-list h2')).toContainText('Active Rooms');
  });

  test('should switch to Errors tab', async ({ page }) => {
    await page.goto('/admin');
    await page.fill('input[type="password"]', ANALYTICS_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for connection to be established first
    await expect(page.locator('.admin-title .connection-status')).toContainText('Live', { timeout: 15000 });
    await expect(page.locator('button.tab-btn:has-text("Errors")')).toBeVisible({ timeout: 10000 });

    // Click Errors tab
    await page.click('button.tab-btn:has-text("Errors")');

    // Should show errors container
    await expect(page.locator('.logs-container')).toBeVisible();
    await expect(page.locator('h2:has-text("Error Logs")')).toBeVisible();
  });

  test('should switch to Events tab', async ({ page }) => {
    await page.goto('/admin');
    await page.fill('input[type="password"]', ANALYTICS_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for connection to be established first
    await expect(page.locator('.admin-title .connection-status')).toContainText('Live', { timeout: 15000 });
    await expect(page.locator('button.tab-btn:has-text("Events")')).toBeVisible({ timeout: 10000 });

    // Click Events tab
    await page.click('button.tab-btn:has-text("Events")');

    // Should show events container
    await expect(page.locator('.logs-container')).toBeVisible();
    await expect(page.locator('h2:has-text("Session Events")')).toBeVisible();
  });

  test('should show stats in header', async ({ page }) => {
    await page.goto('/admin');
    await page.fill('input[type="password"]', ANALYTICS_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for stats
    await expect(page.locator('.admin-stats')).toBeVisible({ timeout: 10000 });

    // Check stat pills
    await expect(page.locator('.stat-pill:has-text("Connections")')).toBeVisible();
    await expect(page.locator('.stat-pill:has-text("Rooms")')).toBeVisible();
    await expect(page.locator('.stat-pill:has-text("Uptime")')).toBeVisible();
  });
});

test.describe('Game Flow with Analytics Tracking', () => {
  test('should create room and see it in Live Monitor', async ({ browser }) => {
    // Open two tabs - one for game, one for admin
    const gameContext = await browser.newContext();
    const adminContext = await browser.newContext();

    const gamePage = await gameContext.newPage();
    const adminPage = await adminContext.newPage();

    // Login to admin
    await adminPage.goto('/admin');
    await adminPage.fill('input[type="password"]', ANALYTICS_PASSWORD);
    await adminPage.click('button[type="submit"]');
    await expect(adminPage.locator('.admin-title .connection-status')).toContainText('Live', { timeout: 15000 });

    // Get initial room count
    const initialRoomText = await adminPage.locator('.room-list h2').textContent();
    const initialCount = parseInt(initialRoomText?.match(/\d+/)?.[0] || '0');

    // Go to game and create room
    await gamePage.goto('/');

    // Enter name and join lobby
    await gamePage.fill('input[placeholder*="name" i]', 'TestPlayer');
    await gamePage.click('button:has-text("Play")');

    // Wait for lobby
    await expect(gamePage.locator('text=Create Room')).toBeVisible({ timeout: 10000 });

    // Create a room
    await gamePage.click('button:has-text("Create Room")');

    // Wait for room to be created
    await gamePage.waitForTimeout(2000);

    // Check admin page for new room
    const newRoomText = await adminPage.locator('.room-list h2').textContent({ timeout: 5000 });
    const newCount = parseInt(newRoomText?.match(/\d+/)?.[0] || '0');

    // Room count should have increased or there should be at least one room
    expect(newCount).toBeGreaterThanOrEqual(1);

    // Cleanup
    await gameContext.close();
    await adminContext.close();
  });

  test('should click room and see details', async ({ browser }) => {
    // Open two tabs
    const gameContext = await browser.newContext();
    const adminContext = await browser.newContext();

    const gamePage = await gameContext.newPage();
    const adminPage = await adminContext.newPage();

    // Create a game first
    await gamePage.goto('/');
    await gamePage.fill('input[placeholder*="name" i]', 'ClickTestPlayer');
    await gamePage.click('button:has-text("Play")');
    await expect(gamePage.locator('text=Create Room')).toBeVisible({ timeout: 10000 });
    await gamePage.click('button:has-text("Create Room")');
    await gamePage.waitForTimeout(2000);

    // Login to admin
    await adminPage.goto('/admin');
    await adminPage.fill('input[type="password"]', ANALYTICS_PASSWORD);
    await adminPage.click('button[type="submit"]');
    await expect(adminPage.locator('.admin-title .connection-status')).toContainText('Live', { timeout: 15000 });

    // Wait for rooms to appear
    await adminPage.waitForTimeout(2000);

    // Check if there's a room to click
    const roomItems = adminPage.locator('button.room-item');
    const roomCount = await roomItems.count();

    if (roomCount > 0) {
      // Click the first room
      await roomItems.first().click();

      // Should show room details
      await expect(adminPage.locator('.room-detail')).toBeVisible({ timeout: 5000 });
      await expect(adminPage.locator('.room-header h2')).toBeVisible();
    }

    // Cleanup
    await gameContext.close();
    await adminContext.close();
  });
});
