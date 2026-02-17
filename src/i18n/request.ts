import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export default getRequestConfig(async () => {
    let locale = 'en';

    try {
        const cookieStore = await cookies();
        locale = cookieStore.get('NEXT_LOCALE')?.value || 'en';
    } catch {
        // cookies() may fail in certain contexts (e.g., static generation)
        locale = 'en';
    }

    // Validate locale is supported
    const supportedLocales = ['en', 'pl'];
    if (!supportedLocales.includes(locale)) {
        locale = 'en';
    }

    let messages;
    try {
        messages = (await import(`../../messages/${locale}.json`)).default;
    } catch {
        // Fallback to English if locale file is missing
        messages = (await import('../../messages/en.json')).default;
    }

    return {
        locale,
        messages
    };
});
