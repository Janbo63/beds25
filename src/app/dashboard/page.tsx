'use client';

import { Suspense, useState, useEffect } from 'react';
import TapeChart from '@/components/dashboard/TapeChart';
import NewBookingModal from '@/components/dashboard/NewBookingModal';

export default function DashboardPage() {
    const [mounted, setMounted] = useState(false);
    const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);
    const [quickBookingData, setQuickBookingData] = useState<any>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleCellClick = (data: { roomNumber: string; roomId: string; checkIn: string }) => {
        setQuickBookingData(data);
        setIsNewBookingOpen(true);
    };

    const handleManualBooking = () => {
        setQuickBookingData(null);
        setIsNewBookingOpen(true);
    };


    if (!mounted) return <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950" />;

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-700">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-neutral-800 to-neutral-500 dark:from-white dark:to-neutral-500 bg-clip-text text-transparent">
                        Booking <span className="text-hotel-gold">Timeline</span>
                    </h1>
                    <p className="text-neutral-400 dark:text-neutral-500 mt-2 font-medium">Real-time room occupancy and guest schedule.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => {
                            const todayIndicator = document.querySelector('.today-indicator');
                            if (todayIndicator) {
                                todayIndicator.scrollIntoView({ behavior: 'smooth', inline: 'center' });
                            }
                        }}
                        className="px-5 py-2.5 bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-all border border-neutral-200 dark:border-white/5 font-bold text-xs shadow-xl flex items-center gap-2 text-neutral-700 dark:text-neutral-200"
                    >
                        Today
                    </button>
                    <button
                        onClick={handleManualBooking}
                        className="px-8 py-2.5 bg-hotel-gold text-black hover:bg-yellow-500 rounded-xl transition-all font-black text-xs shadow-xl shadow-hotel-gold/20 flex items-center gap-2"
                    >
                        <span>✨</span> New Booking
                    </button>
                </div>
            </header>



            <NewBookingModal
                isOpen={isNewBookingOpen}
                onClose={() => setIsNewBookingOpen(false)}
                onSuccess={() => window.location.reload()}
                initialData={quickBookingData}
            />

            <main className="space-y-8">
                <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-2xl transition-colors">
                    <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 backdrop-blur-sm">
                        <h2 className="text-xl font-semibold text-neutral-800 dark:text-white">Availability Tape Chart</h2>
                    </div>
                    <Suspense fallback={<div className="p-8 text-neutral-500">Loading chart...</div>}>
                        <TapeChart onCellClick={handleCellClick} />
                    </Suspense>
                </section>
            </main>
        </div>
    );
}
