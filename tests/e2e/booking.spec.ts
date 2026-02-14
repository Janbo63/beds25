
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
        // 1. Create a room via the Admin API
        // We use the request context to hit the API directly for setup
        const apiContext = await request.newContext();
        const createResponse = await apiContext.post('/api/admin/rooms', {
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

        const bookingResponse = await apiContext.post('/api/bookings', {
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
            const deleteBookingResponse = await apiContext.delete(`/api/bookings?id=${createdBookingId}`);
            expect(deleteBookingResponse.ok()).toBeTruthy();
            console.log(`Deleted test booking ID: ${createdBookingId}`);
        }

        // 5. Clean up: Delete the room via the Admin API
        const deleteResponse = await apiContext.delete(`/api/admin/rooms?id=${createdRoomId}`);
        expect(deleteResponse.ok()).toBeTruthy();
        console.log(`Deleted test room ID: ${createdRoomId}`);

        // 4. Verify it's gone from the homepage
        await page.reload();
        await expect(page.getByText(testRoomName)).not.toBeVisible();
    });

    // Safety net: ensure cleanup even if the test fails midway
    test.afterAll(async () => {
        const apiContext = await request.newContext();

        if (createdBookingId) {
            await apiContext.delete(`/api/bookings?id=${createdBookingId}`).catch(() => { });
        }

        if (createdRoomId) {
            await apiContext.delete(`/api/admin/rooms?id=${createdRoomId}`).catch(() => { });
        }
    });
});
