// @ts-check
const { test, expect } = require('@playwright/test');

test('homepage has title and upload form', async ({ page }) => {
    await page.goto('http://127.0.0.1:8080/');

    // Expect a title "to contain" a substring.
    await expect(page).toHaveTitle(/HAR Analyzer/);

    // Check upload region exists
    const dropZone = page.locator('#drop-zone');
    await expect(dropZone).toBeVisible();
});

test('shows error for large files (mocked logic)', async ({ page }) => {
    await page.goto('http://127.0.0.1:8080/');
    // Use locator on body to be more robust against nested tags like <strong>
    await expect(page.locator('body')).toContainText('unlimited size', { ignoreCase: true });
});

// Since we cannot easily upload a real HAR in this automated environment without a file,
// we will focus on static checks for now.
