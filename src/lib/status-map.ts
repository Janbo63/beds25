/**
 * Centralized status mapping between Beds25, Beds24, and Zoho CRM.
 * 
 * This is the SINGLE SOURCE OF TRUTH for status alignment across all three systems.
 * Every file that maps statuses MUST use these functions.
 * 
 * ┌───────────────────┬───────────────────┬─────────────────┐
 * │ Beds25 (Internal) │ Zoho CRM          │ Beds24 (Numeric)│
 * ├───────────────────┼───────────────────┼─────────────────┤
 * │ CONFIRMED         │ Confirmed         │ 1, 2, 3, 4      │
 * │ DEPOSIT_PAID      │ Deposit Paid      │ —               │
 * │ BALANCE_PENDING   │ Balance Pending   │ —               │
 * │ FULLY_PAID        │ Fully Paid        │ —               │
 * │ PAYMENT_FAILED    │ Payment Failed    │ —               │
 * │ CANCELLED         │ Cancelled         │ 0               │
 * └───────────────────┴───────────────────┴─────────────────┘
 * 
 * Rules:
 *  - ALL bookings from Beds24 (channels) or manual entry start as CONFIRMED.
 *  - Payment lifecycle (Deposit Paid → Fully Paid) is managed by Beds25 payment system.
 *  - Beds24 status 0 = Cancelled. All other Beds24 statuses (1-4) = Confirmed.
 *  - "Private" is a separate boolean field (isPrivate), NOT a status.
 *  - "Blocked" / "New" / "Request" are Beds24-only concepts — all map to CONFIRMED.
 */

/** All valid Beds25 internal statuses (matches Zoho Booking_status picklist) */
export type Beds25Status = 'CONFIRMED' | 'DEPOSIT_PAID' | 'BALANCE_PENDING' | 'FULLY_PAID' | 'PAYMENT_FAILED' | 'CANCELLED';

/**
 * Convert a Beds24 numeric status code (or string) → Beds25 internal status.
 * Only two outcomes: CONFIRMED or CANCELLED.
 * Used by: webhook handler, reconcile, sync-health check.
 */
export function beds24ToBeds25(status: string | number | undefined | null): Beds25Status {
    const str = status?.toString().toLowerCase() || '';
    if (str === '0' || str === 'cancelled') return 'CANCELLED';
    // All other Beds24 statuses (confirmed=1, new=2, request=3, blocked=4) → CONFIRMED
    return 'CONFIRMED';
}

/**
 * Convert a Beds25 internal status → Zoho CRM dropdown value (title case).
 * Used by: mapBookingToZoho, sync fix handler.
 */
export function beds25ToZoho(status: string | undefined | null): string {
    const map: Record<string, string> = {
        'CONFIRMED':       'Confirmed',
        'DEPOSIT_PAID':    'Deposit Paid',
        'BALANCE_PENDING': 'Balance Pending',
        'FULLY_PAID':      'Fully Paid',
        'PAYMENT_FAILED':  'Payment Failed',
        'CANCELLED':       'Cancelled',
    };
    return map[status || ''] || status || 'Confirmed';
}

/**
 * Convert a Zoho CRM dropdown value → Beds25 internal status (uppercase).
 * Used by: mapZohoToBooking, sync-health comparison.
 */
export function zohoToBeds25(zohoStatus: string | undefined | null): Beds25Status {
    const map: Record<string, Beds25Status> = {
        'confirmed':       'CONFIRMED',
        'deposit paid':    'DEPOSIT_PAID',
        'balance pending': 'BALANCE_PENDING',
        'fully paid':      'FULLY_PAID',
        'payment failed':  'PAYMENT_FAILED',
        'cancelled':       'CANCELLED',
        // Legacy values that may still exist in old records
        'new':             'CONFIRMED',
        'request':         'CONFIRMED',
        'blocked':         'CONFIRMED',
        'private':         'CONFIRMED',
    };
    return map[(zohoStatus || '').toLowerCase()] || 'CONFIRMED';
}

/**
 * Convert Beds25 internal status → Beds24 numeric code.
 * Only CANCELLED maps to 0. Everything else is 1 (confirmed).
 * Used by: updateBeds24Booking.
 */
export function beds25ToBeds24(status: string | undefined | null): number {
    if (status === 'CANCELLED') return 0;
    return 1; // All other statuses = confirmed in Beds24
}
