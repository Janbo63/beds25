'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';

interface BookingModalProps {
    booking: any;
    onClose: () => void;
}

export default function BookingModal({ booking, onClose }: BookingModalProps) {
    const [status, setStatus] = useState(booking?.status || 'CONFIRMED');
    const [saving, setSaving] = useState(false);

    if (!booking) return null;

    const handleUpdateStatus = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/bookings', {
                method: 'PATCH',
                body: JSON.stringify({ id: booking.id, status }),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                window.location.reload(); // Refresh to show on tape chart
            }
        } catch (error) {
            console.error('Failed to update status', error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                <div className="p-8 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-alpaca-green/20 to-transparent">
                    <div>
                        <h3 className="text-2xl font-bold text-white leading-tight">Booking Details</h3>
                        <p className="text-xs text-neutral-500 uppercase tracking-widest mt-1">Ref: {booking.externalId || booking.id.slice(-8)}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-3 hover:bg-white/10 rounded-full transition-all text-neutral-400 hover:text-white"
                    >
                        ✕
                    </button>
                </div>

                <div className="p-8 space-y-8">
                    <div className="flex justify-between items-start">
                        <div>
                            <label className="text-[10px] uppercase text-neutral-500 font-bold tracking-tighter">Guest Presence</label>
                            <h4 className="text-2xl font-bold text-white mt-1">{booking.guestName}</h4>
                            <p className="text-sm text-neutral-400 mt-1">{booking.guestEmail || 'No email provided'}</p>
                        </div>
                        <div className="text-right">
                            <label className="text-[10px] uppercase text-neutral-500 font-bold tracking-tighter">Current Status</label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                className={`mt-2 block w-full px-4 py-2 rounded-xl text-xs font-bold uppercase outline-none border-2 transition-all ${status === 'CONFIRMED' ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' :
                                    status === 'CANCELLED' ? 'bg-rose-500/10 border-rose-500/40 text-rose-400' :
                                        status === 'BLOCKED' ? 'bg-neutral-800 border-neutral-700 text-neutral-400' :
                                            'bg-amber-500/10 border-amber-500/40 text-amber-400'
                                    }`}
                            >
                                <option value="CONFIRMED" className="bg-neutral-900">Confirmed</option>
                                <option value="REQUEST" className="bg-neutral-900">Request</option>
                                <option value="NEW" className="bg-neutral-900">New</option>
                                <option value="BLOCKED" className="bg-neutral-900">Blocked</option>
                                <option value="CANCELLED" className="bg-neutral-900">Cancelled</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 py-6 border-y border-white/5">
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase text-neutral-500 font-bold tracking-tighter flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Check-In
                            </label>
                            <p className="text-white font-semibold text-lg">{format(parseISO(booking.checkIn), 'EEE, d MMM yyyy')}</p>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase text-neutral-500 font-bold tracking-tighter flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Check-Out
                            </label>
                            <p className="text-white font-semibold text-lg">{format(parseISO(booking.checkOut), 'EEE, d MMM yyyy')}</p>
                        </div>
                    </div>

                    <div className="bg-white/5 p-4 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <label className="text-[10px] uppercase text-neutral-500 font-bold tracking-tighter block mb-1">Party Size</label>
                                <div className="flex items-center gap-4 text-sm font-bold">
                                    <span className="text-white">👨 {booking.numAdults || 0} Adults</span>
                                    <span className="text-neutral-400">👶 {booking.numChildren || 0} Children</span>
                                </div>
                            </div>
                        </div>

                        {booking.guestAges && (() => {
                            try {
                                const ages = JSON.parse(booking.guestAges);
                                if (ages && ages.length > 0) {
                                    return (
                                        <div>
                                            <label className="text-[10px] uppercase text-neutral-500 font-bold tracking-tighter block mb-2">Guest Ages</label>
                                            <div className="flex flex-wrap gap-2">
                                                {ages.map((age: number, idx: number) => (
                                                    <div key={idx} className="px-3 py-1 bg-neutral-800 rounded-lg text-xs font-bold text-neutral-300">
                                                        {age} yrs
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                }
                            } catch (e) {
                                return null;
                            }
                            return null;
                        })()}
                    </div>

                    {booking.notes && (
                        <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl">
                            <label className="text-[10px] uppercase text-amber-500 font-bold tracking-tighter block mb-2 flex items-center gap-2">
                                📝 Special Requests
                            </label>
                            <p className="text-sm text-white leading-relaxed">{booking.notes}</p>
                        </div>
                    )}

                    <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl">
                        <div>
                            <label className="text-[10px] uppercase text-neutral-500 font-bold tracking-tighter block mb-1">Source Channel</label>
                            <div className="flex items-center gap-2 text-sm font-bold">
                                <span className={`w-2 h-2 rounded-full ${booking.source?.toUpperCase() === 'AIRBNB' ? 'bg-rose-600' :
                                    booking.source?.toUpperCase().includes('BOOKING') ? 'bg-blue-600' : 'bg-hotel-gold'
                                    }`}></span>
                                {booking.source}
                            </div>
                        </div>
                        <div className="text-right">
                            <label className="text-[10px] uppercase text-neutral-500 font-bold tracking-tighter block mb-1">Financial Data</label>
                            <div className="text-2xl font-black text-hotel-gold">{booking.totalPrice.toFixed(2)} zł</div>
                        </div>
                    </div>
                </div>

                <div className="p-8 bg-black/20 flex gap-4">
                    <button
                        className="flex-1 py-4 bg-neutral-800 hover:bg-neutral-700 text-white rounded-2xl font-bold transition-all border border-white/5"
                        onClick={onClose}
                    >
                        Back
                    </button>
                    <button
                        className="flex-1 py-4 bg-hotel-gold hover:bg-yellow-500 text-black rounded-2xl font-bold transition-all shadow-xl shadow-hotel-gold/20 disabled:opacity-50"
                        onClick={handleUpdateStatus}
                        disabled={saving || status === booking.status}
                    >
                        {saving ? 'Saving...' : 'Save Status'}
                    </button>
                </div>
            </div>
        </div>
    );
}
