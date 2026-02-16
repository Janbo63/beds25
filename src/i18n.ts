import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export default getRequestConfig(async () => {
    // Provide a static locale, fetch a user setting,
    // read from `cookies()`, `headers()`, etc.

    // For 'localePrefix: never', next-intl middleware sets a cookie 'NEXT_LOCALE'.
    // However, getRequestConfig doesn't always automatically get it.
    // We can read the cookie manually or rely on `requestLocale` being passed by the middleware.

    const cookieStore = await cookies();
    const locale = cookieStore.get('NEXT_LOCALE')?.value || 'en';

    return {
        locale,
        messages: (await import(`../messages/${locale}.json`)).default
    };
});
