# Beds25 Headquarters Reversion Strategy

## Date: March 2026

## Executive Summary
This document serves as a historical record and strategic overview of the decision to pivot the Zagroda Alpakoterapii booking architecture. In early 2026, an attempt was made to turn **Beds25** (the custom Next.js admin dashboard) into the master Property Management System (PMS), intercepting bookings from the website and attempting to push/sync state downstream to Beds24. 

After encountering severe data synchronization issues and experiencing a loss of confidence in system reliability, the architecture was reverted to treat **Beds24 as the sole Source of Truth (Headquarters)**.

## Key Issues Encountered (Why We Reverted)

1. **"Ghost" Bookings & Sync Duplication**
   - Beds25 implemented a two-way sync with Beds24 via webhooks (`/api/webhooks/beds24`) and bulk polling (`/api/admin/beds24-sync`).
   - Because the systems lacked a perfectly unified idempotent identifier (Beds24 `apiSource` vs `referrer`), the systems occasionally engaged in an infinite loop. Beds25 would send a booking to Beds24, Beds24 would trigger a webhook back to Beds25, and Beds25 would sometimes create a duplicated "Ghost" booking.
   - This duplication manifested visually in the Tape Chart where phantom overlapping records occluded valid reservations.

2. **Status Mapping Conflicts**
   - Beds24 natively operates with numeric status codes (e.g., `1` for Confirmed, `0` for Cancelled, `4` for Blackout/Blocked). 
   - Beds25 attempted to natively store string statuses (`CONFIRMED`, `CANCELLED`, `BLOCKED`). During bulk imports, Beds24's `4` status was inaccurately imported as `BLOCKED` for standard confirmed guests, leading to confusion where active reservations appeared as "Locked/Blocked" out of nowhere on the Tape Chart.

3. **Inconsistent Availability Representation**
   - The original Beds25 logic allowed a room to be booked relying solely on `room.basePrice` if no specific `priceRule` existed for a day.
   - The user correctly noticed that standard channel managers treat *no price* as *no availability*. Standard PMS logic states that if you haven't explicitly priced a date, it should be protected from bookings. The logic divergence caused a lack of confidence in preventing double-bookings and under-priced stays.

4. **Tape Chart Rendering Instability**
   - Attempting to display highly dense, multi-day, overlapping booking information natively using React standard tabular matrices (`<table>` and `<td>` cells) proved fragile.
   - Text rendering on multi-day bookings was frequently truncated, and rendering overlapping reservations often caused "ghost layers" to hide bookings stacked beneath them, requiring numerous complex UI interventions to mimic what Beds24 does out of the box natively.

## The Reversion Architecture (Beds24 as Master)

Rather than fighting the two-way sync loop, the new architecture strictly enforces a unidirectional flow of truth.

**Old Flow (Beds25 as Master)**
1. Website Checkout -> POST `/api/public/booking` (Local Beds25 DB)
2. Beds25 Server -> POST `fetch(Beds24)`
3. Beds25 -> POST (Zoho CRM API)
4. Beds24 -> Webhook back to Beds25.

**New Flow (Beds24 as Master)**
1. Website Checkout -> POST `/api/public/booking` -> Directly injects via `createBeds24Booking(payload)` into `https://api.beds24.com/v2/bookings`.
2. The custom website is treated simply as an OTA Channel ("WEBSITE").
3. **Beds24 manages Availability**: If Beds24 has no price, the website considers the room completely blocked.
4. **Beds25 is Read-Only**: The Beds25 dashboard retrieves the exact state of bookings from Beds24 via webhook ingestion. Local edits to bookings in Beds25 are heavily discouraged or disabled, shifting all actual administrative operations (modifications, cancellations, blockouts) back to the official Beds24 portal.

## Future Considerations
If the business scales and decides to re-attempt moving off Beds24 to make Beds25 the true master, the following must be done:
*   A strict, undeniable unique-identifier mapping system must be built to perfectly sync between Beds25 `bookingRef` and the OTA booking IDs.
*   Beds24 must be reduced to a "Channel Manager only" role, and its UI must never be touched by admin staff to prevent split-brain conflicts. Until the development team has sufficient testing resources to handle every edge case of OTA cancellations, modifications, and pricing anomalies, utilizing Beds24's hardened core PMS is the most reliable approach.
