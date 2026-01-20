import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('Lobby UI', () => {
  test('should show name entry screen', async ({ page }) => {
    await page.goto(BASE_URL);

    // Wait for the lobby to load
    await expect(page.locator('.lobby-page')).toBeVisible({ timeout: 10000 });

    // Should show the name input
    await expect(page.locator('input[placeholder="Enter your name"]')).toBeVisible();

    // Should show Join Lobby button
    await expect(page.locator('button:has-text("Join Lobby")')).toBeVisible();
  });

  test('should enter name and show room list', async ({ page }) => {
    await page.goto(BASE_URL);

    // Wait for connection
    await page.waitForTimeout(1000);

    // Enter name
    await page.fill('input[placeholder="Enter your name"]', 'TestPlayer');
    await page.click('button:has-text("Join Lobby")');

    // Should show room list with game selector
    await expect(page.locator('.game-selector')).toBeVisible({ timeout: 5000 });

    // Should show all three games
    await expect(page.locator('.game-option:has-text("Whist")')).toBeVisible();
    await expect(page.locator('.game-option:has-text("Bridge")')).toBeVisible();
    await expect(page.locator('.game-option:has-text("Skitgubbe")')).toBeVisible();
  });

  test('should create a Whist room', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    // Enter name and join
    await page.fill('input[placeholder="Enter your name"]', 'TestPlayer');
    await page.click('button:has-text("Join Lobby")');

    // Wait for game selector
    await expect(page.locator('.game-selector')).toBeVisible({ timeout: 5000 });

    // Whist should be selected by default
    await expect(page.locator('.game-option.selected:has-text("Whist")')).toBeVisible();

    // Create room
    await page.click('button:has-text("Create Room")');

    // Should show room waiting screen
    await expect(page.locator('.room-card')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.game-badge:has-text("Whist")')).toBeVisible();
  });

  test('should create a Bridge room', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    // Enter name and join
    await page.fill('input[placeholder="Enter your name"]', 'TestPlayer');
    await page.click('button:has-text("Join Lobby")');

    // Wait for game selector
    await expect(page.locator('.game-selector')).toBeVisible({ timeout: 5000 });

    // Select Bridge
    await page.click('.game-option:has-text("Bridge")');
    await expect(page.locator('.game-option.selected:has-text("Bridge")')).toBeVisible();

    // Create room
    await page.click('button:has-text("Create Room")');

    // Should show room waiting screen
    await expect(page.locator('.room-card')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.game-badge:has-text("Bridge")')).toBeVisible();
  });

  test('should create a Skitgubbe room', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    // Enter name and join
    await page.fill('input[placeholder="Enter your name"]', 'TestPlayer');
    await page.click('button:has-text("Join Lobby")');

    // Wait for game selector
    await expect(page.locator('.game-selector')).toBeVisible({ timeout: 5000 });

    // Select Skitgubbe
    await page.click('.game-option:has-text("Skitgubbe")');
    await expect(page.locator('.game-option.selected:has-text("Skitgubbe")')).toBeVisible();

    // Create room
    await page.click('button:has-text("Create Room")');

    // Should show room waiting screen
    await expect(page.locator('.room-card')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.game-badge:has-text("Skitgubbe")')).toBeVisible();
  });
});

test.describe('Game Flow', () => {
  test('should start Whist game with bots', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    // Enter name and join
    await page.fill('input[placeholder="Enter your name"]', 'TestPlayer');
    await page.click('button:has-text("Join Lobby")');

    // Wait for game selector
    await expect(page.locator('.game-selector')).toBeVisible({ timeout: 5000 });

    // Create room
    await page.click('button:has-text("Create Room")');

    // Wait for room
    await expect(page.locator('.room-card')).toBeVisible({ timeout: 5000 });

    // Add 3 bots
    const addBotButtons = page.locator('.add-bot-btn');
    await addBotButtons.first().click();
    await page.waitForTimeout(500);
    await addBotButtons.first().click();
    await page.waitForTimeout(500);
    await addBotButtons.first().click();
    await page.waitForTimeout(500);

    // Start game
    await page.click('button:has-text("Start Game")');

    // Should navigate to game page
    await expect(page.locator('.game-page')).toBeVisible({ timeout: 10000 });

    // Should show trump badge
    await expect(page.locator('.trump-badge')).toBeVisible({ timeout: 5000 });
  });

  test('should start Bridge game with bots', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    // Enter name and join
    await page.fill('input[placeholder="Enter your name"]', 'TestPlayer');
    await page.click('button:has-text("Join Lobby")');

    // Wait for game selector
    await expect(page.locator('.game-selector')).toBeVisible({ timeout: 5000 });

    // Select Bridge
    await page.click('.game-option:has-text("Bridge")');

    // Create room
    await page.click('button:has-text("Create Room")');

    // Wait for room
    await expect(page.locator('.room-card')).toBeVisible({ timeout: 5000 });

    // Add 3 bots
    const addBotButtons = page.locator('.add-bot-btn');
    await addBotButtons.first().click();
    await page.waitForTimeout(500);
    await addBotButtons.first().click();
    await page.waitForTimeout(500);
    await addBotButtons.first().click();
    await page.waitForTimeout(500);

    // Start game
    await page.click('button:has-text("Start Game")');

    // Should navigate to Bridge game page
    await expect(page.locator('.bridge-game-page')).toBeVisible({ timeout: 10000 });
  });

  test('should start Skitgubbe game with bots', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    // Enter name and join
    await page.fill('input[placeholder="Enter your name"]', 'TestPlayer');
    await page.click('button:has-text("Join Lobby")');

    // Wait for game selector
    await expect(page.locator('.game-selector')).toBeVisible({ timeout: 5000 });

    // Select Skitgubbe
    await page.click('.game-option:has-text("Skitgubbe")');

    // Create room
    await page.click('button:has-text("Create Room")');

    // Wait for room
    await expect(page.locator('.room-card')).toBeVisible({ timeout: 5000 });

    // Skitgubbe only needs 2 players minimum, add 1 bot
    const addBotButtons = page.locator('.add-bot-btn');
    await addBotButtons.first().click();
    await page.waitForTimeout(500);

    // Start game
    await page.click('button:has-text("Start Game")');

    // Should navigate to Skitgubbe game page
    await expect(page.locator('.skitgubbe-game-page')).toBeVisible({ timeout: 10000 });
  });
});
