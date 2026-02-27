
import { test, expect, request } from '@playwright/test';

/**
 * Level 2: End-to-End Room Lifecycle
 * This test creates a temporary room, verifies it on the frontend, and then deletes it.
 * This tests the full integration including Zoho CRM and the local database.
 */
test.describe('Room Lifecycle E2E', () => {
    let createdRoomId: string;
    let createdBookingId: string;
    const testRoomName = `[TEST] Playwright Room ${Date.now()}`;

    test('Create, Verify, and Delete a Room', async ({ page }) => {
        // 0. Authenticate: get a session cookie via PIN login
        const apiContext = await request.newContext();
        const loginResponse = await apiContext.post('/api/auth/login', {
            data: { pin: process.env.ADMIN_PIN || '000000' }
        });
        expect(loginResponse.ok()).toBeTruthy();

        // Extract session cookie from login response
        const cookies = loginResponse.headers()['set-cookie'];
        const sessionMatch = cookies?.match(/beds25_session=([^;]+)/);
        expect(sessionMatch).toBeTruthy();

        // Create a new context with the session cookie
        const authedContext = await request.newContext({
            extraHTTPHeaders: {
                'Cookie': `beds25_session=${sessionMatch![1]}`
            }
        });

        // 1. Create a room via the Admin API (now authenticated)
        const createResponse = await authedContext.post('/api/admin/rooms', {
            data: {
                number: 'PT-999',
                name: testRoomName,
                basePrice: '123.45',
                capacity: '2'
            }
        });

        expect(createResponse.ok()).toBeTruthy();
        const room = await createResponse.json();
        createdRoomId = room.id;
        console.log(`Created test room with ID: ${createdRoomId}`);

        // 2. Refresh/Visit the homepage and verify the room appears
        await page.goto('/');
        // Check if the unique room name appears in the room showcase
        await expect(page.getByText(testRoomName)).toBeVisible({ timeout: 15000 });

        // 3. Create a Booking for this new Room
        const checkIn = new Date();
        checkIn.setDate(checkIn.getDate() + 1); // Tomorrow
        const checkOut = new Date();
        checkOut.setDate(checkOut.getDate() + 3); // 3 days later

        const bookingResponse = await authedContext.post('/api/bookings', {
            data: {
                roomId: createdRoomId,
                guestName: 'Playwright Test Guest',
                guestEmail: 'test@example.com',
                checkIn: checkIn.toISOString(),
                checkOut: checkOut.toISOString(),
                numAdults: 2,
                totalPrice: 246.90
            }
        });

        expect(bookingResponse.ok()).toBeTruthy();
        const booking = await bookingResponse.json();
        createdBookingId = booking.id;
        console.log(`Created test booking with ID: ${createdBookingId}`);

        // 4. Clean up: Delete the booking first
        if (createdBookingId) {
            const deleteBookingResponse = await authedContext.delete(`/api/bookings?id=${createdBookingId}`);
            expect(deleteBookingResponse.ok()).toBeTruthy();
            console.log(`Deleted test booking ID: ${createdBookingId}`);
        }

        // 5. Clean up: Delete the room via the Admin API
        const deleteResponse = await authedContext.delete(`/api/admin/rooms?id=${createdRoomId}`);
        expect(deleteResponse.ok()).toBeTruthy();
        console.log(`Deleted test room ID: ${createdRoomId}`);

        // 6. Verify it's gone from the homepage
        await page.reload();
        await expect(page.getByText(testRoomName)).not.toBeVisible();
    });

    // Safety net: ensure cleanup even if the test fails midway
    test.afterAll(async () => {
        const apiContext = await request.newContext();

        // Get auth cookie for cleanup
        const loginRes = await apiContext.post('/api/auth/login', {
            data: { pin: process.env.ADMIN_PIN || '000000' }
        });
        const cookies = loginRes.headers()['set-cookie'];
        const match = cookies?.match(/beds25_session=([^;]+)/);

        if (match) {
            const authed = await request.newContext({
                extraHTTPHeaders: { 'Cookie': `beds25_session=${match[1]}` }
            });

            if (createdBookingId) {
                await authed.delete(`/api/bookings?id=${createdBookingId}`).catch(() => { });
            }
            if (createdRoomId) {
                await authed.delete(`/api/admin/rooms?id=${createdRoomId}`).catch(() => { });
            }
        }
    });
});
