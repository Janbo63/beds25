'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { useTranslations } from 'next-intl';

interface BookingModalProps {
    booking: any;
    onClose: () => void;
}

export default function BookingModal({ booking, onClose }: BookingModalProps) {
    const t = useTranslations('BookingModal');
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Editable fields
    const [status, setStatus] = useState(booking?.status || 'CONFIRMED');
    const [guestName, setGuestName] = useState(booking?.guestName || '');
    const [guestEmail, setGuestEmail] = useState(booking?.guestEmail || '');
    const [checkIn, setCheckIn] = useState(booking?.checkIn?.slice(0, 10) || '');
    const [checkOut, setCheckOut] = useState(booking?.checkOut?.slice(0, 10) || '');
    const [totalPrice, setTotalPrice] = useState(booking?.totalPrice || 0);
    const [numAdults, setNumAdults] = useState(booking?.numAdults || 2);
    const [numChildren, setNumChildren] = useState(booking?.numChildren || 0);
    const [notes, setNotes] = useState(booking?.notes || '');

    if (!booking) return null;

    const hasChanges = () => {
        return status !== booking.status ||
            guestName !== booking.guestName ||
            guestEmail !== (booking.guestEmail || '') ||
            checkIn !== booking.checkIn?.slice(0, 10) ||
            checkOut !== booking.checkOut?.slice(0, 10) ||
            totalPrice !== booking.totalPrice ||
            numAdults !== booking.numAdults ||
            numChildren !== booking.numChildren ||
            notes !== (booking.notes || '');
    };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            const updates: any = { id: booking.id };

            // Only send changed fields
            if (status !== booking.status) updates.status = status;
            if (guestName !== booking.guestName) updates.guestName = guestName;
            if (guestEmail !== (booking.guestEmail || '')) updates.guestEmail = guestEmail;
            if (checkIn !== booking.checkIn?.slice(0, 10)) updates.checkIn = new Date(checkIn);
            if (checkOut !== booking.checkOut?.slice(0, 10)) updates.checkOut = new Date(checkOut);
            if (totalPrice !== booking.totalPrice) updates.totalPrice = totalPrice;
            if (numAdults !== booking.numAdults) updates.numAdults = numAdults;
            if (numChildren !== booking.numChildren) updates.numChildren = numChildren;
            if (notes !== (booking.notes || '')) updates.notes = notes;

            const res = await fetch('/api/bookings', {
                method: 'PATCH',
                body: JSON.stringify(updates),
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.ok) {
                window.location.reload();
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to update');
            }
        } catch (err: any) {
            setError(err.message || 'Network error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm(t('deleteConfirm'))) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/bookings?id=${booking.id}`, { method: 'DELETE' });
            if (res.ok) {
                window.location.reload();
            } else {
                setError('Failed to delete booking');
            }
        } catch {
            setError('Network error');
        } finally {
            setSaving(false);
        }
    };

    const inputClass = "w-full bg-neutral-100 dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded-xl px-4 py-2.5 text-neutral-900 dark:text-white text-sm focus:outline-none focus:border-hotel-gold/50 focus:ring-1 focus:ring-hotel-gold/30 transition-all";
    const labelClass = "text-[10px] uppercase text-neutral-500 font-bold tracking-tighter block mb-1.5";
    const displayClass = "text-neutral-900 dark:text-white font-semibold";

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 dark:bg-black/80 backdrop-blur-md">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-neutral-200 dark:border-white/5 flex justify-between items-center bg-gradient-to-r from-alpaca-green/10 dark:from-alpaca-green/20 to-transparent shrink-0">
                    <div>
                        <h3 className="text-2xl font-bold text-neutral-900 dark:text-white leading-tight">
                            {isEditing ? t('editBooking') : t('bookingDetails')}
                        </h3>
                        <p className="text-xs text-neutral-500 uppercase tracking-widest mt-1">
                            {t('ref')}: {booking.externalId || booking.id.slice(-8)}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {!isEditing && (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="px-4 py-2 text-xs font-bold uppercase tracking-wider bg-hotel-gold/10 border border-hotel-gold/30 text-hotel-gold rounded-xl hover:bg-hotel-gold/20 transition-all"
                            >
                                ✏️ {t('edit')}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-3 hover:bg-white/10 rounded-full transition-all text-neutral-400 hover:text-white"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="p-6 space-y-6 overflow-y-auto flex-1">
                    {error && (
                        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-3 rounded-xl text-sm font-medium">
                            {error}
                        </div>
                    )}

                    {/* Guest & Status Row */}
                    <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                            <label className={labelClass}>{t('guestName')}</label>
                            {isEditing ? (
                                <input type="text" value={guestName} onChange={e => setGuestName(e.target.value)} className={inputClass} />
                            ) : (
                                <h4 className="text-xl font-bold text-white">{booking.guestName}</h4>
                            )}

                            <label className={`${labelClass} mt-3`}>{t('email')}</label>
                            {isEditing ? (
                                <input type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} className={inputClass} placeholder="guest@email.com" />
                            ) : (
                                <p className="text-sm text-neutral-400">{booking.guestEmail || t('noEmail')}</p>
                            )}
                        </div>

                        <div className="w-40">
                            <label className={labelClass}>{t('status')}</label>
                            {isEditing ? (
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value)}
                                    className={`${inputClass} ${status === 'CONFIRMED' ? '!border-emerald-500/40 text-emerald-400' :
                                        status === 'CANCELLED' ? '!border-rose-500/40 text-rose-400' :
                                            status === 'BLOCKED' ? '!border-neutral-700 text-neutral-400' :
                                                '!border-amber-500/40 text-amber-400'
                                        }`}
                                >
                                    <option value="CONFIRMED" className="bg-white dark:bg-neutral-900">{t('statusConfirmed')}</option>
                                    <option value="REQUEST" className="bg-white dark:bg-neutral-900">{t('statusRequest')}</option>
                                    <option value="NEW" className="bg-white dark:bg-neutral-900">{t('statusNew')}</option>
                                    <option value="BLOCKED" className="bg-white dark:bg-neutral-900">{t('statusBlocked')}</option>
                                    <option value="CANCELLED" className="bg-white dark:bg-neutral-900">{t('statusCancelled')}</option>
                                </select>
                            ) : (
                                <span className={`inline-block px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${status === 'CONFIRMED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                                    status === 'CANCELLED' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' :
                                        status === 'BLOCKED' ? 'bg-neutral-800 text-neutral-400 border border-neutral-700' :
                                            'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                    }`}>
                                    {status}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-4 py-4 border-y border-white/5">
                        <div>
                            <label className={`${labelClass} flex items-center gap-2`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {t('checkIn')}
                            </label>
                            {isEditing ? (
                                <input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} className={inputClass} />
                            ) : (
                                <p className={`${displayClass} text-lg`}>{format(parseISO(booking.checkIn), 'EEE, d MMM yyyy')}</p>
                            )}
                        </div>
                        <div>
                            <label className={`${labelClass} flex items-center gap-2`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> {t('checkOut')}
                            </label>
                            {isEditing ? (
                                <input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} className={inputClass} />
                            ) : (
                                <p className={`${displayClass} text-lg`}>{format(parseISO(booking.checkOut), 'EEE, d MMM yyyy')}</p>
                            )}
                        </div>
                    </div>

                    {/* Party Size */}
                    <div className="bg-white/5 p-4 rounded-2xl space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>👨 {t('adults')}</label>
                                {isEditing ? (
                                    <input type="number" min={1} max={10} value={numAdults} onChange={e => setNumAdults(parseInt(e.target.value) || 1)} className={inputClass} />
                                ) : (
                                    <p className={`${displayClass} text-sm`}>{booking.numAdults || 0} {t('adults')}</p>
                                )}
                            </div>
                            <div>
                                <label className={labelClass}>👶 {t('children')}</label>
                                {isEditing ? (
                                    <input type="number" min={0} max={10} value={numChildren} onChange={e => setNumChildren(parseInt(e.target.value) || 0)} className={inputClass} />
                                ) : (
                                    <p className="text-sm text-neutral-400">{booking.numChildren || 0} {t('children')}</p>
                                )}
                            </div>
                        </div>

                        {!isEditing && booking.guestAges && (() => {
                            try {
                                const ages = JSON.parse(booking.guestAges);
                                if (ages && ages.length > 0) {
                                    return (
                                        <div>
                                            <label className={`${labelClass} mb-2`}>{t('guestAges')}</label>
                                            <div className="flex flex-wrap gap-2">
                                                {ages.map((age: number, idx: number) => (
                                                    <div key={idx} className="px-3 py-1 bg-neutral-800 rounded-lg text-xs font-bold text-neutral-300">
                                                        {age} {t('years')}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                }
                            } catch {
                                return null;
                            }
                            return null;
                        })()}
                    </div>

                    {/* Notes */}
                    <div>
                        <label className={`${labelClass} flex items-center gap-2`}>📝 {t('notes')}</label>
                        {isEditing ? (
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={3}
                                className={`${inputClass} resize-none`}
                                placeholder={t('notesPlaceholder')}
                            />
                        ) : booking.notes ? (
                            <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl">
                                <p className="text-sm text-white leading-relaxed">{booking.notes}</p>
                            </div>
                        ) : (
                            <p className="text-sm text-neutral-600 italic">{t('noNotes')}</p>
                        )}
                    </div>

                    {/* Price & Source */}
                    <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl">
                        <div>
                            <label className={labelClass}>{t('sourceChannel')}</label>
                            <div className="flex items-center gap-2 text-sm font-bold">
                                <span className={`w-2 h-2 rounded-full ${booking.source?.toUpperCase() === 'AIRBNB' ? 'bg-rose-600' :
                                    booking.source?.toUpperCase().includes('BOOKING') ? 'bg-blue-600' : 'bg-hotel-gold'
                                    }`}></span>
                                {booking.source}
                            </div>
                        </div>
                        <div className="text-right">
                            <label className={labelClass}>{t('totalPrice')}</label>
                            {isEditing ? (
                                <input
                                    type="number"
                                    step="0.01"
                                    value={totalPrice}
                                    onChange={e => setTotalPrice(parseFloat(e.target.value) || 0)}
                                    className={`${inputClass} w-32 text-right text-lg font-black text-hotel-gold`}
                                />
                            ) : (
                                <div className="text-2xl font-black text-hotel-gold">{booking.totalPrice?.toFixed(2)} zł</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 bg-black/20 border-t border-white/5 shrink-0">
                    {isEditing ? (
                        <div className="space-y-3">
                            <div className="flex gap-3">
                                <button
                                    className="flex-1 py-3.5 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white rounded-2xl font-bold transition-all border border-neutral-300 dark:border-white/5"
                                    onClick={() => {
                                        setIsEditing(false);
                                        // Reset to original values
                                        setStatus(booking.status);
                                        setGuestName(booking.guestName);
                                        setGuestEmail(booking.guestEmail || '');
                                        setCheckIn(booking.checkIn?.slice(0, 10));
                                        setCheckOut(booking.checkOut?.slice(0, 10));
                                        setTotalPrice(booking.totalPrice);
                                        setNumAdults(booking.numAdults);
                                        setNumChildren(booking.numChildren);
                                        setNotes(booking.notes || '');
                                    }}
                                >
                                    {t('cancel')}
                                </button>
                                <button
                                    className="flex-1 py-3.5 bg-hotel-gold hover:bg-yellow-500 text-black rounded-2xl font-bold transition-all shadow-xl shadow-hotel-gold/20 disabled:opacity-50"
                                    onClick={handleSave}
                                    disabled={saving || !hasChanges()}
                                >
                                    {saving ? t('saving') : t('saveChanges')}
                                </button>
                            </div>
                            <button
                                className="w-full py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-2xl text-sm font-bold transition-all border border-rose-500/20"
                                onClick={handleDelete}
                                disabled={saving}
                            >
                                🗑️ {t('deleteBooking')}
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-3">
                            <button
                                className="flex-1 py-3.5 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white rounded-2xl font-bold transition-all border border-neutral-300 dark:border-white/5"
                                onClick={onClose}
                            >
                                {t('close')}
                            </button>
                            <button
                                className="flex-1 py-3.5 bg-hotel-gold hover:bg-yellow-500 text-black rounded-2xl font-bold transition-all shadow-xl shadow-hotel-gold/20"
                                onClick={() => setIsEditing(true)}
                            >
                                ✏️ {t('editBookingBtn')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
