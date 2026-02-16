import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
    // A list of all locales that are supported
    locales: ['en', 'pl'],

    // Used when no locale matches
    defaultLocale: 'en',

    // Don't prefix the URL with the locale
    localePrefix: 'never'
});

export const config = {
    // Match only internationalized pathnames
    matcher: ['/((?!api|_next|.*\\..*).*)']
};
