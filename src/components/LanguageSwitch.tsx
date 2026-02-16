'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export default function LanguageSwitch() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const locale = useLocale();

    const toggleLanguage = () => {
        const nextLocale = locale === 'en' ? 'pl' : 'en';
        startTransition(() => {
            // Set cookie manually since we use 'never' prefix
            document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
            router.refresh();
        });
    };

    return (
        <button
            onClick={toggleLanguage}
            disabled={isPending}
            className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-hotel-gold transition-colors flex items-center gap-2"
        >
            <span className={locale === 'en' ? 'text-white' : 'text-neutral-600'}>EN</span>
            <span className="text-white/20">/</span>
            <span className={locale === 'pl' ? 'text-white' : 'text-neutral-600'}>PL</span>
        </button>
    );
}
