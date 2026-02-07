'use client';

import { Suspense, useState, useEffect } from 'react';
import RatesGrid from '@/components/dashboard/RatesGrid';

export default function RatesPage() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <div className="min-h-screen bg-neutral-950" />;

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-700">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-white to-neutral-500 bg-clip-text text-transparent">
                        Daily <span className="text-hotel-gold">Occupancy Rates</span>
                    </h1>
                    <p className="text-neutral-500 mt-2 font-medium">Set and synchronize dynamic pricing with external channels.</p>
                </div>
            </header>

            <main className="space-y-8">
                <section className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl">
                    <div className="p-4 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
                        <h2 className="text-xl font-semibold">Pricing Grid</h2>
                    </div>
                    <Suspense fallback={<div className="p-8 text-neutral-500">Loading rates...</div>}>
                        <RatesGrid />
                    </Suspense>
                </section>
            </main>
        </div>
    );
}
