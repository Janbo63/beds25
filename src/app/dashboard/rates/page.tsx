'use client';

import { Suspense, useState, useEffect } from 'react';
import RatesGrid from '@/components/dashboard/RatesGrid';
import MassRateUpdateModal from '@/components/dashboard/MassRateUpdateModal';
import { useTranslations } from 'next-intl';

export default function RatesPage() {
    const t = useTranslations('Rates');
    const [mounted, setMounted] = useState(false);
    const [rooms, setRooms] = useState<any[]>([]);
    const [selectedRoom, setSelectedRoom] = useState<{ id: string; number: string } | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        setMounted(true);
        fetch('/api/admin/rooms')
            .then(res => res.json())
            .then(data => setRooms(data));
    }, []);

    if (!mounted) return <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950" />;

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-700">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-neutral-800 to-neutral-500 dark:from-white dark:to-neutral-500 bg-clip-text text-transparent">
                        {t('title')} <span className="text-hotel-gold">{t('titleHighlight')}</span>
                    </h1>
                    <p className="text-neutral-500 mt-2 font-medium">{t('subtitle')}</p>
                </div>

                {/* Mass Update Button */}
                <div className="flex items-center gap-3">
                    <select
                        className="bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl px-4 py-3 text-sm font-bold text-neutral-900 dark:text-white outline-none focus:border-hotel-gold transition-colors"
                        value={selectedRoom?.id || ''}
                        onChange={(e) => {
                            const room = rooms.find(r => r.id === e.target.value);
                            setSelectedRoom(room ? { id: room.id, number: room.number || room.name } : null);
                        }}
                    >
                        <option value="">Select Room...</option>
                        {rooms.map(room => (
                            <option key={room.id} value={room.id}>
                                {room.number} — {room.name}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={() => {
                            if (!selectedRoom) {
                                alert('Please select a room first');
                                return;
                            }
                        }}
                        disabled={!selectedRoom}
                        className={`px-6 py-3 rounded-xl font-bold transition-all shadow-lg whitespace-nowrap ${selectedRoom
                                ? 'bg-hotel-gold text-black hover:bg-yellow-500 active:scale-95 shadow-hotel-gold/20'
                                : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed'
                            }`}
                    >
                        📅 Mass Update
                    </button>
                </div>
            </header>

            <main className="space-y-8">
                <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-2xl">
                    <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 backdrop-blur-sm">
                        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">{t('pricingGrid')}</h2>
                    </div>
                    <Suspense fallback={<div className="p-8 text-neutral-500">{t('loading')}</div>}>
                        <RatesGrid key={refreshKey} />
                    </Suspense>
                </section>
            </main>

            {/* Mass Rate Update Modal */}
            {selectedRoom && (
                <MassRateUpdateModal
                    roomId={selectedRoom.id}
                    roomNumber={selectedRoom.number}
                    onClose={() => setSelectedRoom(null)}
                    onSave={() => {
                        setSelectedRoom(null);
                        setRefreshKey(k => k + 1);
                    }}
                />
            )}
        </div>
    );
}
