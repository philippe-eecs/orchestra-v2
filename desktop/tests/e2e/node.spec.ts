import { test, expect } from '@playwright/test';

test.describe('Node Management', () => {
  test.beforeEach(async ({ page }) => {
    const projectName = `Test Project ${Date.now()}`;
    await page.goto('/');

    // Create a project first
    await page.click('aside header button');
    await page.fill('#project-name', projectName);
    await page.click('button[type="submit"]');
    await page.waitForSelector('.overlay', { state: 'detached' });
    await page.locator('.project-item', { hasText: projectName }).click();
  });

  test('should create a new node', async ({ page }) => {
    // Click + Node button
    await page.click('button:has-text("+ Node")');

    // Fill in node details
    await page.fill('#title', 'Test Node');
    await page.fill('#description', 'A test node');

    // Submit
    await page.click('button:has-text("Create Node")');

    // Verify modal is closed
    await page.waitForSelector('.overlay', { state: 'detached' });

    // Verify node appears in DAG (canvas would need custom assertions)
  });

  test('should create node with resources', async ({ page }) => {
    await page.click('button:has-text("+ Node")');

    await page.fill('#title', 'Node with Resources');

    // Add a resource
    await page.fill('.add-resource input[placeholder="Title"]', 'API Docs');
    await page.fill('.add-resource input[placeholder="URL"]', 'https://api.example.com');
    await page.click('.add-resource button:has-text("+")');

    // Verify resource appears in list
    await expect(page.locator('.resources li')).toContainText('API Docs');

    await page.click('button:has-text("Create Node")');

    // Verify modal is closed
    await page.waitForSelector('.overlay', { state: 'detached' });
  });

  test('should show error when title is empty', async ({ page }) => {
    await page.click('button:has-text("+ Node")');

    // Try to submit without title
    await page.click('button:has-text("Create Node")');

    // Verify error is shown
    await expect(page.locator('.error-banner')).toContainText('Title is required');
  });
});
