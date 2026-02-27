
import { test, expect } from '@playwright/test';

test('login page loads', async ({ page }) => {
    await page.goto('/login');
    // The login page should show the PIN input
    await expect(page.locator('h1')).toContainText('Admin Access');
});

test('unauthenticated access redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    // Should redirect to /login
    await expect(page).toHaveURL(/\/login/);
});

test('public API is accessible without auth', async ({ request }) => {
    const response = await request.get('/api/public/rooms');
    expect(response.ok()).toBeTruthy();
});
