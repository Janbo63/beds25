'use client';

import React, { useState } from 'react';
import { X, Plus, Minus, Check, Phone, User, Users, DollarSign, Sparkles } from 'lucide-react';

interface QuickAddGuestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  session: {
    id: string;
    time: string;
    activityType: string;
  } | null;
  initialData?: {
    guestName?: string;
    phone?: string;
    numAdults?: number;
    numChildren?: number;
    isRoomGuest?: boolean;
    roomBookingId?: string;
    roomName?: string;
  };
}

export default function QuickAddGuestModal({
  isOpen,
  onClose,
  onSuccess,
  session,
  initialData
}: QuickAddGuestModalProps) {
  const [guestName, setGuestName] = useState(initialData?.guestName || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [numAdults, setNumAdults] = useState(initialData?.numAdults || 2);
  const [numChildren, setNumChildren] = useState(initialData?.numChildren || 0);
  const [isRoomGuest, setIsRoomGuest] = useState(initialData?.isRoomGuest || false);
  const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'UNPAID'>('PAID');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BLIK' | 'CARD'>('CASH');
  const [totalPrice, setTotalPrice] = useState<number>(100);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sync initialData when modal opens
  React.useEffect(() => {
    if (initialData) {
      if (initialData.guestName) setGuestName(initialData.guestName);
      if (initialData.phone) setPhone(initialData.phone);
      if (initialData.numAdults !== undefined) setNumAdults(initialData.numAdults);
      if (initialData.numChildren !== undefined) setNumChildren(initialData.numChildren);
      if (initialData.isRoomGuest !== undefined) setIsRoomGuest(initialData.isRoomGuest);
    }
  }, [initialData]);

  if (!isOpen || !session) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/activities/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session?.id,
          guestName,
          phone,
          numAdults,
          numChildren,
          isRoomGuest,
          roomBookingId: initialData?.roomBookingId,
          totalPrice: isRoomGuest ? 0 : Number(totalPrice),
          paymentStatus: isRoomGuest ? 'FREE_PERK' : paymentStatus,
          paymentMethod: isRoomGuest ? 'INCLUDED' : paymentMethod,
          notes: initialData?.roomName ? `Pobyt: ${initialData.roomName}${notes ? ' • ' + notes : ''}` : notes
        })
      });

      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
        // Reset form
        setGuestName('');
        setPhone('');
        setNumAdults(2);
        setNumChildren(0);
        setNotes('');
      } else {
        alert('Błąd zapisu: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch (err) {
      console.error(err);
      alert('Nie udało się zapisać rezerwacji');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🦙</span>
            <div>
              <span className="text-emerald-300 font-bold text-xs uppercase tracking-wider block">
                Zapis w Zeszycie Alpak
              </span>
              <h2 className="text-xl sm:text-2xl font-bold">
                Godzina {session.time}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
          
          {/* Guest Name */}
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-neutral-500 dark:text-neutral-400 block mb-1.5">
              Imię i Nazwisko / Rodzina:
            </label>
            <input
              type="text"
              required
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="np. Anna Kowalska"
              className="w-full text-lg font-bold p-3.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          {/* Headcount Selectors (Adults & Children) */}
          <div className="grid grid-cols-2 gap-4">
            {/* Adults */}
            <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/80">
              <span className="text-xs font-bold uppercase text-neutral-500 block mb-2">
                Dorośli
              </span>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setNumAdults(Math.max(1, numAdults - 1))}
                  className="w-10 h-10 rounded-xl bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-lg font-bold hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                >
                  <Minus size={18} />
                </button>
                <span className="text-2xl font-black">{numAdults}</span>
                <button
                  type="button"
                  onClick={() => setNumAdults(numAdults + 1)}
                  className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-lg font-bold hover:bg-emerald-500 transition-colors shadow-sm"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            {/* Children */}
            <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/80">
              <span className="text-xs font-bold uppercase text-neutral-500 block mb-2">
                Dzieci
              </span>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setNumChildren(Math.max(0, numChildren - 1))}
                  className="w-10 h-10 rounded-xl bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-lg font-bold hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors"
                >
                  <Minus size={18} />
                </button>
                <span className="text-2xl font-black">{numChildren}</span>
                <button
                  type="button"
                  onClick={() => setNumChildren(numChildren + 1)}
                  className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-lg font-bold hover:bg-emerald-500 transition-colors shadow-sm"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Guest Type Toggle: Room Guest (Free) vs Day Visitor (Paid) */}
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800/60 space-y-3">
            <span className="text-xs font-bold uppercase text-amber-900 dark:text-amber-300 block">
              Typ gościa:
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsRoomGuest(true)}
                className={`py-3 px-3 rounded-xl font-bold text-sm text-center transition-all ${
                  isRoomGuest
                    ? 'bg-amber-500 text-black shadow-md'
                    : 'bg-white/80 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700'
                }`}
              >
                🏨 Gość z pokoju (W cenie)
              </button>
              <button
                type="button"
                onClick={() => setIsRoomGuest(false)}
                className={`py-3 px-3 rounded-xl font-bold text-sm text-center transition-all ${
                  !isRoomGuest
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-white/80 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700'
                }`}
              >
                🚗 Gość z zewnątrz (Płatne)
              </button>
            </div>

            {!isRoomGuest && (
              <div className="pt-3 border-t border-amber-200 dark:border-amber-800/50 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300">Kwota do zapłaty:</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="10"
                      value={totalPrice}
                      onChange={(e) => setTotalPrice(Number(e.target.value))}
                      className="w-24 text-right font-bold text-base p-1.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                    />
                    <span className="text-sm font-bold">PLN</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-neutral-500">Płatność:</span>
                  <div className="flex gap-1.5">
                    {(['CASH', 'BLIK', 'CARD'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={`px-3 py-1.5 rounded-lg font-bold ${
                          paymentMethod === m
                            ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                            : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                        }`}
                      >
                        {m === 'CASH' ? 'Gotówka' : m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Phone (Optional) */}
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-neutral-500 dark:text-neutral-400 block mb-1.5">
              Telefon / WhatsApp (opcjonalnie):
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+48 600 000 000"
              className="w-full text-base font-semibold p-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          {/* Notes (Optional) */}
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-neutral-500 dark:text-neutral-400 block mb-1.5">
              Notatki / Uwagi (np. wózek, alergia):
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="np. małe dzieci, urodziny..."
              className="w-full text-sm p-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-3">
            <button
              type="submit"
              disabled={submitting || !guestName.trim()}
              className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-lg shadow-xl shadow-emerald-700/20 transition-all transform active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Check size={22} />
              {submitting ? 'Zapisuję...' : 'Zapisz w zeszycie'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
