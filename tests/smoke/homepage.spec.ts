
import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
    await page.goto('/');

    // Expect a title "to contain" a substring.
    // Note: Adjust the expected title based on your actual application title
    // await expect(page).toHaveTitle(/Beds25/); 

    // Alternatively, check for a key element on the homepage
    // await expect(page.locator('h1')).toBeVisible();
});

test('check dashboard loads', async ({ page }) => {
    // Navigate to dashboard if accessible without login, or check login page
    await page.goto('/login'); // Assuming there is a login page or similar
    // Check if login form is present
    // await expect(page.locator('form')).toBeVisible(); 
});
