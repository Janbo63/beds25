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
            document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
            router.refresh();
        });
    };

    return (
        <button
            onClick={toggleLanguage}
            disabled={isPending}
            className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
        >
            <span className={locale === 'en' ? 'text-hotel-gold' : 'text-neutral-400'}>EN</span>
            <span className="text-neutral-500">/</span>
            <span className={locale === 'pl' ? 'text-hotel-gold' : 'text-neutral-400'}>PL</span>
        </button>
    );
}
