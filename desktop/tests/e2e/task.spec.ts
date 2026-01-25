import { test, expect } from '@playwright/test';

test.describe('Task Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Navigate to TODO view
    await page.click('button:has-text("TODO")');
  });

  test('should create a new task', async ({ page }) => {
    const taskName = `My first task ${Date.now()}`;
    // Add a task
    await page.fill('input[placeholder="Add a new task..."]', taskName);
    await page.click('button:has-text("Add")');

    // Verify task appears in list
    await expect(page.locator('.task-item', { hasText: taskName })).toBeVisible();
  });

  test('should toggle task completion', async ({ page }) => {
    const taskName = `Task to complete ${Date.now()}`;
    // Add a task
    await page.fill('input[placeholder="Add a new task..."]', taskName);
    await page.click('button:has-text("Add")');

    const taskItem = page.locator('.task-item', { hasText: taskName });
    await expect(taskItem).toBeVisible();

    // Show completed tasks
    await page.check('input[type="checkbox"]:near(:text("Show completed"))');

    // Click the checkbox
    await taskItem.locator('.checkbox').click();

    // Verify task is marked complete
    await expect(taskItem).toHaveClass(/completed/);
  });

  test('should delete a task', async ({ page }) => {
    const taskName = `Task to delete ${Date.now()}`;
    // Add a task
    await page.fill('input[placeholder="Add a new task..."]', taskName);
    await page.click('button:has-text("Add")');

    const taskItem = page.locator('.task-item', { hasText: taskName });
    await expect(taskItem).toBeVisible();

    // Hover and click delete
    await taskItem.hover();
    await taskItem.locator('.delete').click();

    // Verify task is gone
    await expect(taskItem).toHaveCount(0);
  });

  test('should filter by project', async ({ page }) => {
    const projectName = `Test Project ${Date.now()}`;
    const taskName = `Project task ${Date.now()}`;
    // First create a project
    await page.click('button:has-text("DAG")');
    await page.click('aside header button');
    await page.fill('#project-name', projectName);
    await page.click('button[type="submit"]');
    await page.waitForSelector('.overlay', { state: 'detached' });
    await page.locator('.project-item', { hasText: projectName }).click();

    // Go back to TODO
    await page.click('button:has-text("TODO")');

    // Enable project filter
    await page.check('input[type="checkbox"]:near(:text("Project only"))');

    // Add a task (should be associated with project)
    await page.fill('input[placeholder="Add a new task..."]', taskName);
    await page.click('button:has-text("Add")');

    // Verify task appears
    await expect(page.locator('.task-item', { hasText: taskName })).toBeVisible();
  });
});
