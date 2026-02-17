'use client';

import { useState, useEffect } from 'react';
import { addDays, format } from 'date-fns';

interface NewBookingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialData?: {
        roomNumber?: string;
        roomId?: string;
        checkIn?: string;
    };
}

export default function NewBookingModal({ isOpen, onClose, onSuccess, initialData }: NewBookingModalProps) {
    const [rooms, setRooms] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        roomNumber: '',
        roomId: '',
        guestName: '',
        guestEmail: '',
        numAdults: 2,
        numChildren: 0,
        guestAges: [] as number[],
        checkIn: '',
        checkOut: '',
        totalPrice: '',
        notes: '',
        status: 'CONFIRMED'
    });

    useEffect(() => {
        if (isOpen) {
            // Reset state on open
            setError(null);
            setLoading(false);

            fetch('/api/admin/rooms')
                .then(res => res.json())
                .then(data => {
                    setRooms(data);

                    if (initialData) {
                        const checkInStr = initialData.checkIn || '';
                        let checkOutStr = '';
                        if (checkInStr) {
                            try {
                                checkOutStr = format(addDays(new Date(checkInStr), 2), 'yyyy-MM-dd');
                            } catch (err) {
                                console.error('Date parsing error', err);
                            }
                        }

                        setFormData({
                            roomNumber: initialData.roomNumber || '',
                            roomId: initialData.roomId || '',
                            checkIn: checkInStr,
                            checkOut: checkOutStr,
                            guestName: '',
                            guestEmail: '',
                            numAdults: 2,
                            numChildren: 0,
                            guestAges: [],
                            totalPrice: '',
                            notes: '',
                            status: 'CONFIRMED'
                        });
                    } else {
                        // Reset for manual entry
                        setFormData({
                            roomNumber: '',
                            roomId: '',
                            guestName: '',
                            guestEmail: '',
                            numAdults: 2,
                            numChildren: 0,
                            guestAges: [],
                            checkIn: '',
                            checkOut: '',
                            totalPrice: '',
                            notes: '',
                            status: 'CONFIRMED'
                        });
                    }
                });
        }
    }, [isOpen, initialData]);

    useEffect(() => {
        if (formData.checkIn && formData.roomId) {
            const room = rooms.find(r => r.id === formData.roomId);
            if (room) {
                // Ensure checkOut is at least 1 day after checkIn
                const checkInDate = new Date(formData.checkIn);
                const currentCheckOut = formData.checkOut ? new Date(formData.checkOut) : null;

                let validCheckOut = formData.checkOut;
                if (!currentCheckOut || currentCheckOut <= checkInDate) {
                    validCheckOut = format(addDays(checkInDate, 2), 'yyyy-MM-dd');
                }

                const diffDays = Math.ceil(Math.abs(new Date(validCheckOut).getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
                const calculatedPrice = (diffDays * room.basePrice).toFixed(2);

                setFormData(prev => ({
                    ...prev,
                    checkOut: validCheckOut,
                    totalPrice: calculatedPrice
                }));
            }
        }
    }, [formData.checkIn, formData.roomId, rooms]);

    useEffect(() => {
        if (formData.checkIn && formData.checkOut && formData.roomId) {
            const room = rooms.find(r => r.id === formData.roomId);
            if (room) {
                const diffDays = Math.ceil(Math.abs(new Date(formData.checkOut).getTime() - new Date(formData.checkIn).getTime()) / (1000 * 60 * 60 * 24));
                const calculatedPrice = (diffDays * room.basePrice).toFixed(2);
                setFormData(prev => ({
                    ...prev,
                    totalPrice: calculatedPrice
                }));
            }
        }
    }, [formData.checkOut]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const checkInDate = new Date(formData.checkIn);
        const checkOutDate = new Date(formData.checkOut);
        const diffTime = Math.abs(checkOutDate.getTime() - checkInDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Get selected room for validation
        const selectedRoom = rooms.find(r => r.id === formData.roomId);
        if (!selectedRoom) {
            setError('Please select a room');
            setLoading(false);
            return;
        }

        // Client-side validation
        const totalGuests = formData.numAdults + formData.numChildren;

        if (formData.numAdults > selectedRoom.maxAdults) {
            setError(`This room allows a maximum of ${selectedRoom.maxAdults} adults`);
            setLoading(false);
            return;
        }

        if (totalGuests > selectedRoom.capacity) {
            setError(`This room has a maximum capacity of ${selectedRoom.capacity} guests`);
            setLoading(false);
            return;
        }

        if (diffDays < selectedRoom.minNights) {
            setError(`Minimum stay is ${selectedRoom.minNights} night${selectedRoom.minNights > 1 ? 's' : ''}`);
            setLoading(false);
            return;
        }

        try {
            const res = await fetch('/api/bookings', {
                method: 'POST',
                body: JSON.stringify({
                    ...formData,
                    totalPrice: parseFloat(formData.totalPrice),
                    guestAges: JSON.stringify(formData.guestAges),
                    source: 'DIRECT'
                }),
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.ok) {
                onSuccess();
                onClose();
            } else {
                const data = await res.json();
                const errorMessage = data.error || 'Failed to create booking';
                const details = data.details ? ` (${JSON.stringify(data.details)})` : '';
                setError(`${errorMessage}${details}`);
            }
        } catch (error) {
            console.error('Booking failed', error);
            setError('Failed to create booking. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-8 rounded-3xl w-full max-w-xl shadow-2xl relative">
                <button onClick={onClose} className="absolute top-6 right-6 text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-white transition-colors">✕</button>

                <h2 className="text-2xl font-bold mb-8">Manual Booking Entry</h2>

                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                        ⚠️ {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase text-neutral-500 font-bold">Select Room</label>
                            <select
                                required
                                className="w-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl p-3 outline-none focus:border-hotel-gold text-neutral-900 dark:text-white"
                                value={formData.roomId}
                                onChange={e => {
                                    const room = rooms.find(r => r.id === e.target.value);
                                    setFormData({ ...formData, roomId: e.target.value, roomNumber: room?.number || '' });
                                }}
                            >
                                <option value="">Select Accommodation</option>
                                {rooms.map(room => (
                                    <option key={room.id} value={room.id}>{room.number} ({room.name})</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase text-neutral-500 font-bold">Base Price (zł)</label>
                            <div className="w-full bg-neutral-100 dark:bg-neutral-950/50 border border-neutral-300 dark:border-neutral-800 rounded-xl p-3 text-neutral-500 dark:text-neutral-400">
                                {rooms.find(r => r.id === formData.roomId)?.basePrice || '0'} zł / night
                            </div>
                        </div>
                    </div>

                    {formData.roomId && (() => {
                        const room = rooms.find(r => r.id === formData.roomId);
                        if (room) {
                            return (
                                <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3">
                                    <div className="text-[10px] uppercase text-blue-400 font-bold mb-1">Room Constraints</div>
                                    <div className="text-xs text-neutral-300 space-y-0.5">
                                        <div>Max {room.maxAdults} adults • Capacity {room.capacity} guests</div>
                                        <div>Minimum stay: {room.minNights} night{room.minNights > 1 ? 's' : ''}</div>
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })()}

                    <div className="space-y-2">
                        <label className="text-[10px] uppercase text-neutral-500 font-bold">Guest Name</label>
                        <input
                            required
                            type="text"
                            className="w-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl p-3 outline-none focus:border-hotel-gold text-neutral-900 dark:text-white"
                            value={formData.guestName}
                            onChange={e => setFormData({ ...formData, guestName: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase text-neutral-500 font-bold">Adults</label>
                            <input
                                required
                                type="number"
                                min="1"
                                max="10"
                                className="w-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl p-3 outline-none focus:border-hotel-gold text-neutral-900 dark:text-white"
                                value={formData.numAdults}
                                onChange={e => {
                                    const newAdults = parseInt(e.target.value) || 1;
                                    setFormData({ ...formData, numAdults: newAdults, guestAges: [] });
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase text-neutral-500 font-bold">Children</label>
                            <input
                                required
                                type="number"
                                min="0"
                                max="10"
                                className="w-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl p-3 outline-none focus:border-hotel-gold text-neutral-900 dark:text-white"
                                value={formData.numChildren}
                                onChange={e => {
                                    const newChildren = parseInt(e.target.value) || 0;
                                    setFormData({ ...formData, numChildren: newChildren, guestAges: [] });
                                }}
                            />
                        </div>
                    </div>

                    {formData.numChildren > 0 && (
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase text-neutral-500 font-bold">Children's Ages</label>
                            <div className="grid grid-cols-4 gap-2">
                                {Array.from({ length: formData.numChildren }).map((_, idx) => (
                                    <input
                                        key={idx}
                                        type="number"
                                        min="0"
                                        max="17"
                                        placeholder={`Child ${idx + 1}`}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 outline-none focus:border-hotel-gold text-sm"
                                        value={formData.guestAges[idx] || ''}
                                        onChange={e => {
                                            const newAges = [...formData.guestAges];
                                            newAges[idx] = parseInt(e.target.value) || 0;
                                            setFormData({ ...formData, guestAges: newAges });
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase text-neutral-500 font-bold">Check-In</label>
                            <input
                                required
                                type="date"
                                className="w-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl p-3 outline-none focus:border-hotel-gold text-neutral-900 dark:text-white cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-900 transition-colors"
                                value={formData.checkIn}
                                onChange={e => setFormData({ ...formData, checkIn: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2 relative">
                            <label className="text-[10px] uppercase text-neutral-500 font-bold">Check-Out</label>
                            <input
                                required
                                type="date"
                                min={formData.checkIn}
                                className="w-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl p-3 outline-none focus:border-hotel-gold text-neutral-900 dark:text-white cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-900 transition-colors"
                                value={formData.checkOut}
                                onChange={e => setFormData({ ...formData, checkOut: e.target.value })}
                            />
                            {formData.checkIn && formData.checkOut && (
                                <div className="absolute -bottom-6 left-0 text-[10px] font-bold text-hotel-gold uppercase tracking-tighter">
                                    Duration: {Math.ceil(Math.abs(new Date(formData.checkOut).getTime() - new Date(formData.checkIn).getTime()) / (1000 * 60 * 60 * 24))} nights
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase text-neutral-500 font-bold">Total Price (zł)</label>
                            <input
                                required
                                type="number"
                                className="w-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl p-3 outline-none focus:border-hotel-gold text-neutral-900 dark:text-white"
                                value={formData.totalPrice}
                                onChange={e => setFormData({ ...formData, totalPrice: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase text-neutral-500 font-bold">Status</label>
                            <select
                                className="w-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl p-3 outline-none focus:border-hotel-gold text-neutral-900 dark:text-white"
                                value={formData.status}
                                onChange={e => setFormData({ ...formData, status: e.target.value })}
                            >
                                <option value="CONFIRMED">Confirmed</option>
                                <option value="REQUEST">Request</option>
                                <option value="BLOCKED">Blocked</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] uppercase text-neutral-500 font-bold">Special Requests / Notes</label>
                        <textarea
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 outline-none focus:border-hotel-gold min-h-[80px] resize-none"
                            placeholder="Dietary requirements, early check-in, parking..." value={formData.notes}
                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-hotel-gold text-black font-bold py-4 rounded-xl hover:bg-yellow-500 transition-all shadow-lg shadow-hotel-gold/10"
                    >
                        {loading ? 'Creating...' : 'Create Booking'}
                    </button>
                </form>
            </div>
        </div>
    );
}
