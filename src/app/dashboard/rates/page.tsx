'use client';

import { Suspense, useState, useEffect } from 'react';
import RatesGrid from '@/components/dashboard/RatesGrid';
import { useTranslations } from 'next-intl';

export default function RatesPage() {
    const t = useTranslations('Rates');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950" />;

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-700">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-neutral-800 to-neutral-500 dark:from-white dark:to-neutral-500 bg-clip-text text-transparent">
                        {t('title')} <span className="text-hotel-gold">{t('titleHighlight')}</span>
                    </h1>
                    <p className="text-neutral-500 mt-2 font-medium">{t('subtitle')}</p>
                </div>
            </header>

            <main className="space-y-8">
                <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-2xl">
                    <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 backdrop-blur-sm">
                        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">{t('pricingGrid')}</h2>
                    </div>
                    <Suspense fallback={<div className="p-8 text-neutral-500">{t('loading')}</div>}>
                        <RatesGrid />
                    </Suspense>
                </section>
            </main>
        </div>
    );
}
