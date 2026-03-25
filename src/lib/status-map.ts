/**
 * Centralized status mapping between Beds25, Beds24, and Zoho CRM.
 * 
 * This is the SINGLE SOURCE OF TRUTH for status alignment across all three systems.
 * Every file that maps statuses MUST use these functions.
 * 
 * ┌──────────────┬───────────────┬─────────────────┐
 * │ Beds25       │ Beds24        │ Zoho CRM        │
 * │ (Internal)   │ (Numeric)     │ (Dropdown)      │
 * ├──────────────┼───────────────┼─────────────────┤
 * │ CONFIRMED    │ 1             │ Confirmed       │
 * │ CANCELLED    │ 0             │ Cancelled       │
 * │ NEW          │ 2             │ New             │
 * │ REQUEST      │ 3             │ Request         │
 * │ BLOCKED      │ 4             │ Blocked         │
 * └──────────────┴───────────────┴─────────────────┘
 * 
 * Note: "Private" is NOT a status — it's a separate boolean field (isPrivate/Private).
 */

/** All valid Beds25 internal statuses */
export type Beds25Status = 'CONFIRMED' | 'CANCELLED' | 'NEW' | 'REQUEST' | 'BLOCKED';

/**
 * Convert a Beds24 numeric status code (or string) → Beds25 internal status.
 * Used by: webhook handler, reconcile, sync-health check.
 */
export function beds24ToBeds25(status: string | number | undefined | null): Beds25Status {
    const str = status?.toString().toLowerCase() || '';
    switch (str) {
        case '0': case 'cancelled': return 'CANCELLED';
        case '1': case 'confirmed': return 'CONFIRMED';
        case '2': case 'new':       return 'NEW';
        case '3': case 'request':   return 'REQUEST';
        case '4': case 'black': case 'blocked': return 'BLOCKED';
        default: return 'CONFIRMED';
    }
}

/**
 * Convert a Beds25 internal status → Zoho CRM dropdown value (title case).
 * Used by: mapBookingToZoho, sync fix handler.
 */
export function beds25ToZoho(status: string | undefined | null): string {
    const map: Record<string, string> = {
        'CONFIRMED': 'Confirmed',
        'CANCELLED': 'Cancelled',
        'NEW':       'New',
        'REQUEST':   'Request',
        'BLOCKED':   'Blocked',
    };
    return map[status || ''] || status || 'Confirmed';
}

/**
 * Convert a Zoho CRM dropdown value → Beds25 internal status (uppercase).
 * Used by: mapZohoToBooking, sync-health comparison.
 */
export function zohoToBeds25(zohoStatus: string | undefined | null): Beds25Status {
    const str = (zohoStatus || '').toUpperCase();
    if (['CONFIRMED', 'CANCELLED', 'NEW', 'REQUEST', 'BLOCKED'].includes(str)) {
        return str as Beds25Status;
    }
    // Handle edge cases like "Private" (not a real status)
    if (str === 'PRIVATE') return 'CONFIRMED';
    return 'CONFIRMED';
}

/**
 * Convert Beds25 internal status → Beds24 numeric code.
 * Used by: updateBeds24Booking.
 */
export function beds25ToBeds24(status: string | undefined | null): number {
    switch (status) {
        case 'CANCELLED': return 0;
        case 'CONFIRMED': return 1;
        case 'NEW':       return 2;
        case 'REQUEST':   return 3;
        case 'BLOCKED':   return 4;
        default: return 1;
    }
}
