'use client';

import { Suspense, useState, useEffect } from 'react';
import TapeChart from '@/components/dashboard/TapeChart';
import NewBookingModal from '@/components/dashboard/NewBookingModal';

export default function DashboardPage() {
    const [syncing, setSyncing] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);
    const [quickBookingData, setQuickBookingData] = useState<any>(null);
    const [syncStatus, setSyncStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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

    const handleSyncNow = async () => {
        setSyncing(true);
        setSyncStatus(null);
        try {
            const res = await fetch('/api/admin/sync-now', { method: 'POST' });
            if (res.ok) {
                setSyncStatus({ message: 'Synchronization complete!', type: 'success' });
                setTimeout(() => window.location.reload(), 2000);
            } else {
                setSyncStatus({ message: 'Sync failed. Check settings.', type: 'error' });
            }
        } catch (err) {
            setSyncStatus({ message: 'Network error during sync.', type: 'error' });
        } finally {
            setSyncing(false);
        }
    };

    const handleReimport = async () => {
        setSyncing(true);
        setSyncStatus({ message: 'Re-importing data from Beds24...', type: 'success' });
        try {
            const res = await fetch('/api/admin/beds24/import', {
                method: 'POST',
                body: JSON.stringify({ inviteCode: 'REFRESH' }), // The backend should handle this or just trigger importBeds24Data
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                setSyncStatus({ message: 'Data re-imported successfully!', type: 'success' });
                setTimeout(() => window.location.reload(), 2000);
            }
        } catch (err) {
            setSyncStatus({ message: 'Import failed.', type: 'error' });
        } finally {
            setSyncing(false);
        }
    };

    if (!mounted) return <div className="min-h-screen bg-neutral-950" />;

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-700">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-white to-neutral-500 bg-clip-text text-transparent">
                        Booking <span className="text-hotel-gold">Timeline</span>
                    </h1>
                    <p className="text-neutral-500 mt-2 font-medium">Real-time room occupancy and guest schedule.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => {
                            const todayIndicator = document.querySelector('.today-indicator');
                            if (todayIndicator) {
                                todayIndicator.scrollIntoView({ behavior: 'smooth', inline: 'center' });
                            }
                        }}
                        className="px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 rounded-xl transition-all border border-white/5 font-bold text-xs shadow-xl flex items-center gap-2"
                    >
                        Today
                    </button>
                    <button
                        onClick={handleSyncNow}
                        disabled={syncing}
                        className="px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 rounded-xl transition-all border border-white/5 font-bold text-xs shadow-xl flex items-center gap-2"
                    >
                        {syncing ? '⏳' : '📡'} Sync iCals
                    </button>
                    <button
                        onClick={handleManualBooking}
                        className="px-8 py-2.5 bg-hotel-gold text-black hover:bg-yellow-500 rounded-xl transition-all font-black text-xs shadow-xl shadow-hotel-gold/20 flex items-center gap-2"
                    >
                        <span>✨</span> New Booking
                    </button>
                </div>
            </header>

            {syncStatus && (
                <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-8 py-4 rounded-2xl shadow-2xl z-[200] animate-in slide-in-from-bottom-8 duration-500 flex items-center gap-3 border ${syncStatus.type === 'success' ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-rose-500 text-white border-rose-400'
                    }`}>
                    <span className="text-xl">{syncStatus.type === 'success' ? '✅' : '❌'}</span>
                    <span className="font-bold tracking-tight">{syncStatus.message}</span>
                </div>
            )}

            <NewBookingModal
                isOpen={isNewBookingOpen}
                onClose={() => setIsNewBookingOpen(false)}
                onSuccess={() => window.location.reload()}
                initialData={quickBookingData}
            />

            <main className="space-y-8">
                <section className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl">
                    <div className="p-4 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
                        <h2 className="text-xl font-semibold">Availability Tape Chart</h2>
                    </div>
                    <Suspense fallback={<div className="p-8 text-neutral-500">Loading chart...</div>}>
                        <TapeChart onCellClick={handleCellClick} />
                    </Suspense>
                </section>
            </main>
        </div>
    );
}
