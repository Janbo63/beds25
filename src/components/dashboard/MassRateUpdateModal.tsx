'use client';

import { useState } from 'react';
import { format, addMonths } from 'date-fns';

interface MassRateUpdateModalProps {
    roomId: string;
    roomNumber: string;
    onClose: () => void;
    onSave: () => void;
}

export default function MassRateUpdateModal({ roomId, roomNumber, onClose, onSave }: MassRateUpdateModalProps) {
    const today = new Date().toISOString().split('T')[0];
    const nextMonth = addMonths(new Date(), 1).toISOString().split('T')[0];

    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(nextMonth);
    const [price, setPrice] = useState('');
    // 0=Sun, 1=Mon, ..., 6=Sat
    const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 0]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const daysOfWeek = [
        { id: 1, label: 'Mon' },
        { id: 2, label: 'Tue' },
        { id: 3, label: 'Wed' },
        { id: 4, label: 'Thu' },
        { id: 5, label: 'Fri' },
        { id: 6, label: 'Sat' },
        { id: 0, label: 'Sun' },
    ];

    const toggleDay = (dayId: number) => {
        if (selectedDays.includes(dayId)) {
            setSelectedDays(selectedDays.filter(d => d !== dayId));
        } else {
            setSelectedDays([...selectedDays, dayId]);
        }
    };

    const handleSave = async () => {
        setError(null);
        setSuccessMsg(null);

        if (!price || parseFloat(price) <= 0) {
            setError('Please enter a valid price.');
            return;
        }
        if (selectedDays.length === 0) {
            setError('Please select at least one day of the week.');
            return;
        }

        setSaving(true);

        try {
            const res = await fetch('/api/dashboard/rates/mass-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId,
                    startDate,
                    endDate,
                    price: parseFloat(price),
                    daysOfWeek: selectedDays
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to update rates');
            }

            setSuccessMsg(`Successfully updated ${data.count} dates!`);
            setTimeout(() => {
                onSave();
                onClose();
            }, 1000); // Wait a sec so user sees success message

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 dark:bg-black/80 backdrop-blur-md">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                <div className="p-6 border-b border-neutral-200 dark:border-white/5 flex justify-between items-center bg-gradient-to-r from-blue-600/10 dark:from-blue-600/20 to-transparent">
                    <div>
                        <h3 className="text-xl font-bold text-neutral-900 dark:text-white leading-tight">Mass Rate Update</h3>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 uppercase tracking-widest">Room {roomNumber}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-neutral-200 dark:hover:bg-white/10 rounded-full transition-all text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
                    >
                        ✕
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Date Range */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] uppercase text-neutral-500 font-bold tracking-tighter block mb-2">Start Date</label>
                            <input
                                type="date"
                                className="w-full bg-neutral-100 dark:bg-neutral-800 border-2 border-neutral-300 dark:border-neutral-700/50 rounded-xl px-4 py-2 text-neutral-900 dark:text-white text-sm outline-none focus:border-blue-500 transition-colors"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase text-neutral-500 font-bold tracking-tighter block mb-2">End Date</label>
                            <input
                                type="date"
                                className="w-full bg-neutral-100 dark:bg-neutral-800 border-2 border-neutral-300 dark:border-neutral-700/50 rounded-xl px-4 py-2 text-neutral-900 dark:text-white text-sm outline-none focus:border-blue-500 transition-colors"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Price */}
                    <div>
                        <label className="text-[10px] uppercase text-neutral-500 font-bold tracking-tighter block mb-2">New Rate (PLN)</label>
                        <div className="relative">
                            <input
                                type="number"
                                placeholder="0.00"
                                className="w-full bg-neutral-100 dark:bg-neutral-800 border-2 border-neutral-300 dark:border-neutral-700/50 rounded-xl pl-4 pr-12 py-3 text-neutral-900 dark:text-white font-bold text-lg outline-none focus:border-hotel-gold transition-colors"
                                value={price}
                                onChange={e => setPrice(e.target.value)}
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 font-bold text-xs">PLN</span>
                        </div>
                        <p className="text-[10px] text-neutral-500 mt-2">
                            * Existing bookings in this period will NOT be updated.
                        </p>
                    </div>

                    {/* Days of Week */}
                    <div>
                        <label className="text-[10px] uppercase text-neutral-500 font-bold tracking-tighter block mb-3">Apply On</label>
                        <div className="flex justify-between gap-1">
                            {daysOfWeek.map(day => {
                                const isSelected = selectedDays.includes(day.id);
                                return (
                                    <button
                                        key={day.id}
                                        onClick={() => toggleDay(day.id)}
                                        className={`flex-1 h-10 rounded-lg text-xs font-bold transition-all border ${isSelected
                                            ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                                            : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                                            }`}
                                    >
                                        {day.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Feedback Messages */}
                    {error && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 font-medium">
                            {error}
                        </div>
                    )}
                    {successMsg && (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 font-medium">
                            {successMsg}
                        </div>
                    )}
                </div>

                <div className="p-6 bg-neutral-50 dark:bg-black/20 flex gap-4">
                    <button
                        className="flex-1 py-3 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-700 dark:text-white rounded-xl font-bold transition-all border border-neutral-300 dark:border-white/5 text-sm"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        className="flex-1 py-3 bg-hotel-gold hover:bg-yellow-500 text-black rounded-xl font-bold transition-all shadow-lg shadow-hotel-gold/20 disabled:opacity-50 text-sm"
                        onClick={handleSave}
                        disabled={saving || !!successMsg}
                    >
                        {saving ? 'Updating...' : 'Update Rates'}
                    </button>
                </div>
            </div>
        </div>
    );
}
