import { test, expect } from '@playwright/test';

test.describe('Project Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should create a new project', async ({ page }) => {
    const projectName = `Test Project ${Date.now()}`;
    // Click the + button in sidebar
    await page.click('aside header button');

    // Fill in the project name
    await page.fill('#project-name', projectName);

    // Submit
    await page.click('button[type="submit"]');
    await page.waitForSelector('.overlay', { state: 'detached' });

    // Verify project appears in list
    await expect(page.locator('.project-item', { hasText: projectName })).toBeVisible();
  });

  test('should select a project', async ({ page }) => {
    const projectName = `My Project ${Date.now()}`;
    // Create a project first
    await page.click('aside header button');
    await page.fill('#project-name', projectName);
    await page.click('button[type="submit"]');
    await page.waitForSelector('.overlay', { state: 'detached' });

    // Click on the project
    await page.locator('.project-item', { hasText: projectName }).click();

    // Verify project name appears in top bar
    await expect(page.locator('.topbar .project-name')).toContainText(projectName);
  });

  test('should delete a project', async ({ page }) => {
    const projectName = `To Delete ${Date.now()}`;
    // Create a project first
    await page.click('aside header button');
    await page.fill('#project-name', projectName);
    await page.click('button[type="submit"]');
    await page.waitForSelector('.overlay', { state: 'detached' });

    const projectItem = page.locator('.project-item', { hasText: projectName });
    // Hover over project and click delete
    await projectItem.hover();
    await projectItem.locator('.delete-btn').click();

    // Confirm deletion
    await projectItem.locator('.confirm-btn').click();

    // Verify project is gone
    await expect(projectItem).toHaveCount(0);
  });
});
