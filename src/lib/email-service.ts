/**
 * Email Service for Beds25
 * Handles balance charge notifications and admin alerts.
 * Uses the same Zoho SMTP as the Zagroda booking confirmations.
 *
 * Required env vars (same as Zagroda):
 *   SMTP_HOST=smtp.zoho.eu
 *   SMTP_PORT=465
 *   SMTP_SECURE=true
 *   SMTP_USER=info@zagrodaalpakoterapii.com
 *   SMTP_PASS=<zoho app password>
 *   EMAIL_FROM="Zagroda Alpakoterapii <info@zagrodaalpakoterapii.com>"
 *   ADMIN_EMAILS=fura.dorota@wp.pl,jan@futuresolutionsjf.com
 */

import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.zoho.eu',
            port: parseInt(process.env.SMTP_PORT || '465'),
            secure: (process.env.SMTP_SECURE ?? 'true') === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    }
    return transporter;
}

const FROM = () => process.env.EMAIL_FROM || 'Zagroda Alpakoterapii <info@zagrodaalpakoterapii.com>';
const ADMIN_EMAILS = () => process.env.ADMIN_EMAILS || 'fura.dorota@wp.pl,jan@futuresolutionsjf.com';

// ─── Guest: Balance Successfully Charged ────────────────────────────────────

interface BalanceChargedEmailData {
    guestEmail: string;
    guestName: string;
    bookingRef: string;
    roomName: string;
    checkIn: string;       // formatted date
    checkOut: string;      // formatted date
    balanceAmount: number;  // PLN
    currency: string;
    locale: string;        // 'pl' | 'en' | 'de' | etc.
}

export async function sendBalanceChargedEmail(data: BalanceChargedEmailData): Promise<boolean> {
    try {
        const isPl = data.locale === 'pl';
        const amountStr = `${data.balanceAmount.toFixed(2)} ${data.currency.toUpperCase()}`;

        const subject = isPl
            ? `✅ Płatność końcowa pobrana — ${data.bookingRef}`
            : `✅ Final payment charged — ${data.bookingRef}`;

        const html = isPl
            ? getBalanceChargedPL(data, amountStr)
            : getBalanceChargedEN(data, amountStr);

        await getTransporter().sendMail({
            from: FROM(),
            to: data.guestEmail,
            subject,
            html,
        });

        console.log(`[Email] Balance charged email sent to ${data.guestEmail} for ${data.bookingRef}`);
        return true;
    } catch (err: any) {
        console.error(`[Email] Failed to send balance charged email to ${data.guestEmail}:`, err?.message);
        return false;
    }
}

// ─── Admin: Balance Charge Failed ───────────────────────────────────────────

interface ChargeFailedAlertData {
    bookingRef: string;
    guestName: string;
    guestEmail: string;
    roomName: string;
    checkIn: string;
    balanceAmount: number;
    currency: string;
    error: string;
}

export async function sendChargeFailedAlert(data: ChargeFailedAlertData): Promise<boolean> {
    try {
        const amountStr = `${data.balanceAmount.toFixed(2)} ${data.currency.toUpperCase()}`;

        const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h1 style="color: #dc2626;">❌ Balance Charge Failed</h1>
    <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; border: 1px solid #fecaca;">
        <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #666;">Booking:</td><td style="padding: 6px 0; font-weight: bold;">${data.bookingRef}</td></tr>
            <tr><td style="padding: 6px 0; color: #666;">Guest:</td><td style="padding: 6px 0;">${data.guestName} (<a href="mailto:${data.guestEmail}">${data.guestEmail}</a>)</td></tr>
            <tr><td style="padding: 6px 0; color: #666;">Room:</td><td style="padding: 6px 0;">${data.roomName}</td></tr>
            <tr><td style="padding: 6px 0; color: #666;">Check-in:</td><td style="padding: 6px 0;">${data.checkIn}</td></tr>
            <tr><td style="padding: 6px 0; color: #666;">Amount:</td><td style="padding: 6px 0; font-weight: bold; color: #dc2626;">${amountStr}</td></tr>
        </table>
    </div>
    <div style="background-color: #fff7ed; padding: 15px; border-radius: 8px; border: 1px solid #fed7aa; margin-top: 16px;">
        <p style="margin: 0 0 8px 0; font-weight: bold; color: #9a3412;">Error Details:</p>
        <pre style="margin: 0; white-space: pre-wrap; font-family: monospace; font-size: 13px; color: #7c2d12;">${data.error}</pre>
    </div>
    <p style="margin-top: 20px; color: #666; line-height: 1.6;">
        <strong>Action Required:</strong> Contact the guest to arrange alternative payment, 
        or update the card on file. Check-in is in <strong>3 days</strong>.
    </p>
</div>`;

        await getTransporter().sendMail({
            from: FROM(),
            to: ADMIN_EMAILS(),
            subject: `⚠️ Balance charge FAILED — ${data.bookingRef} (${data.guestName})`,
            html,
        });

        console.log(`[Email] Charge failed alert sent to admins for ${data.bookingRef}`);
        return true;
    } catch (err: any) {
        console.error(`[Email] Failed to send charge failed alert:`, err?.message);
        return false;
    }
}

// ─── Admin: Daily Charge Summary ────────────────────────────────────────────

interface ChargeSummaryData {
    date: string;
    succeeded: Array<{ bookingRef: string; guestName: string; amount: string }>;
    failed: Array<{ bookingRef: string; guestName: string; amount: string; error: string }>;
}

export async function sendDailyChargeSummary(data: ChargeSummaryData): Promise<boolean> {
    try {
        const totalProcessed = data.succeeded.length + data.failed.length;
        if (totalProcessed === 0) return true; // nothing to report

        const successRows = data.succeeded.map(s =>
            `<tr style="background: #f0fdf4;"><td style="padding: 8px; border: 1px solid #e5e7eb;">${s.bookingRef}</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${s.guestName}</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${s.amount}</td><td style="padding: 8px; border: 1px solid #e5e7eb; color: #16a34a;">✅ Charged</td></tr>`
        ).join('');

        const failRows = data.failed.map(f =>
            `<tr style="background: #fef2f2;"><td style="padding: 8px; border: 1px solid #e5e7eb;">${f.bookingRef}</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${f.guestName}</td><td style="padding: 8px; border: 1px solid #e5e7eb;">${f.amount}</td><td style="padding: 8px; border: 1px solid #e5e7eb; color: #dc2626;">❌ ${f.error.substring(0, 60)}</td></tr>`
        ).join('');

        const statusEmoji = data.failed.length > 0 ? '⚠️' : '✅';

        const html = `
<div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
    <h1 style="color: #1e3a5f;">${statusEmoji} Balance Charge Report — ${data.date}</h1>
    <p style="color: #666;">Processed <strong>${totalProcessed}</strong> booking(s): <span style="color: #16a34a;">${data.succeeded.length} succeeded</span>, <span style="color: #dc2626;">${data.failed.length} failed</span></p>
    <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
        <thead><tr style="background: #f3f4f6;">
            <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Booking</th>
            <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Guest</th>
            <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Amount</th>
            <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Status</th>
        </tr></thead>
        <tbody>${successRows}${failRows}</tbody>
    </table>
</div>`;

        await getTransporter().sendMail({
            from: FROM(),
            to: ADMIN_EMAILS(),
            subject: `${statusEmoji} Daily Balance Charges — ${data.date} (${data.succeeded.length}/${totalProcessed} OK)`,
            html,
        });

        console.log(`[Email] Daily charge summary sent to admins for ${data.date}`);
        return true;
    } catch (err: any) {
        console.error(`[Email] Failed to send daily charge summary:`, err?.message);
        return false;
    }
}

// ─── Templates ──────────────────────────────────────────────────────────────

function getBalanceChargedPL(data: BalanceChargedEmailData, amountStr: string): string {
    return `
<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f0; padding: 40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <tr><td style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 40px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; color: #ffffff; font-size: 28px;">✅ Płatność Potwierdzona</h1>
    </td></tr>
    <tr><td style="padding: 40px;">
        <h2 style="margin: 0 0 20px 0; color: #2C1810;">Drogi/a ${data.guestName},</h2>
        <p style="color: #5C4033; font-size: 16px; line-height: 1.6;">
            Informujemy, że pozostała kwota za Twoją rezerwację została pomyślnie pobrana z Twojej karty płatniczej.
        </p>
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <table style="width: 100%;">
                <tr><td style="padding: 6px 0; color: #666;">Rezerwacja:</td><td style="padding: 6px 0; font-weight: bold;">${data.bookingRef}</td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Pokój:</td><td style="padding: 6px 0;">${data.roomName}</td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Zameldowanie:</td><td style="padding: 6px 0;">${data.checkIn}</td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Wymeldowanie:</td><td style="padding: 6px 0;">${data.checkOut}</td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Pobrana kwota:</td><td style="padding: 6px 0; font-weight: bold; color: #16a34a; font-size: 18px;">${amountStr}</td></tr>
            </table>
        </div>
        <p style="color: #5C4033; font-size: 16px; line-height: 1.6;">
            Twoja rezerwacja jest w pełni opłacona. Czekamy na Ciebie! 🦙
        </p>
        <div style="background-color: #FFF8DC; border-left: 4px solid #D4AF37; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #5C4033; font-size: 14px; line-height: 1.5;">
                <strong>Zameldowanie od 15:00</strong> · Wymeldowanie do 11:00<br>
                Adres: Zagroda Alpakoterapii, Ściegny 184A, 58-533 Mysłakowice
            </p>
        </div>
    </td></tr>
    <tr><td style="background-color: #f9f9f9; padding: 30px 40px; text-align: center; border-radius: 0 0 12px 12px; border-top: 1px solid #e0e0e0;">
        <p style="margin: 0; color: #888; font-size: 14px;">
            Z serdecznymi pozdrowieniami,<br><strong style="color: #5C4033;">Zespół Zagrody Alpakoterapii</strong>
        </p>
        <p style="margin: 10px 0 0 0; color: #aaa; font-size: 12px;">
            W razie pytań: <a href="mailto:info@zagrodaalpakoterapii.com">info@zagrodaalpakoterapii.com</a> · +48 690 610 520
        </p>
    </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function getBalanceChargedEN(data: BalanceChargedEmailData, amountStr: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f0; padding: 40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <tr><td style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 40px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; color: #ffffff; font-size: 28px;">✅ Payment Confirmed</h1>
    </td></tr>
    <tr><td style="padding: 40px;">
        <h2 style="margin: 0 0 20px 0; color: #2C1810;">Dear ${data.guestName},</h2>
        <p style="color: #5C4033; font-size: 16px; line-height: 1.6;">
            The remaining balance for your booking has been successfully charged to your payment card.
        </p>
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <table style="width: 100%;">
                <tr><td style="padding: 6px 0; color: #666;">Booking:</td><td style="padding: 6px 0; font-weight: bold;">${data.bookingRef}</td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Room:</td><td style="padding: 6px 0;">${data.roomName}</td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Check-in:</td><td style="padding: 6px 0;">${data.checkIn}</td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Check-out:</td><td style="padding: 6px 0;">${data.checkOut}</td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Amount charged:</td><td style="padding: 6px 0; font-weight: bold; color: #16a34a; font-size: 18px;">${amountStr}</td></tr>
            </table>
        </div>
        <p style="color: #5C4033; font-size: 16px; line-height: 1.6;">
            Your booking is now fully paid. We look forward to welcoming you! 🦙
        </p>
        <div style="background-color: #FFF8DC; border-left: 4px solid #D4AF37; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #5C4033; font-size: 14px; line-height: 1.5;">
                <strong>Check-in from 15:00</strong> · Check-out by 11:00<br>
                Address: Zagroda Alpakoterapii, Ściegny 184A, 58-533 Mysłakowice
            </p>
        </div>
    </td></tr>
    <tr><td style="background-color: #f9f9f9; padding: 30px 40px; text-align: center; border-radius: 0 0 12px 12px; border-top: 1px solid #e0e0e0;">
        <p style="margin: 0; color: #888; font-size: 14px;">
            With warmest regards,<br><strong style="color: #5C4033;">Zagroda Alpakoterapii Team</strong>
        </p>
        <p style="margin: 10px 0 0 0; color: #aaa; font-size: 12px;">
            Questions? <a href="mailto:info@zagrodaalpakoterapii.com">info@zagrodaalpakoterapii.com</a> · +48 690 610 520
        </p>
    </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
