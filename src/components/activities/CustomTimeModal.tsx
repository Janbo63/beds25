'use client';

import React, { useState } from 'react';
import { X, Clock, Plus, Check } from 'lucide-react';

interface CustomTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  dateStr: string;
}

const QUICK_TIMES = ['10:00', '12:00', '13:30', '14:00', '16:30', '17:00'];

export default function CustomTimeModal({
  isOpen,
  onClose,
  onSuccess,
  dateStr
}: CustomTimeModalProps) {
  const [time, setTime] = useState('14:00');
  const [activityType, setActivityType] = useState('MEET');
  const [maxCapacity, setMaxCapacity] = useState(15);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!time) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/activities/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateStr,
          time,
          activityType,
          maxCapacity
        })
      });

      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      } else {
        alert('Błąd dodawania godziny: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch (err) {
      console.error(err);
      alert('Nie udało się utworzyć godziny');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-neutral-800 to-neutral-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock size={24} className="text-hotel-gold" />
            <div>
              <span className="text-neutral-400 font-bold text-xs uppercase tracking-wider block">
                Elastyczna godzina
              </span>
              <h2 className="text-xl font-bold">
                Dodaj Nową Godzinę
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
          
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-neutral-500 block mb-2">
              Wybierz szybką godzinę:
            </label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {QUICK_TIMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTime(t)}
                  className={`py-2.5 px-2 rounded-xl font-bold text-sm transition-all ${
                    time === t
                      ? 'bg-hotel-gold text-black shadow-md'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <label className="text-xs font-bold text-neutral-500 block mb-1">
              Lub wpisz dowolną godzinę:
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full text-lg font-bold p-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 outline-none"
              required
            />
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-wider text-neutral-500 block mb-1.5">
              Rodzaj aktywności:
            </label>
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
              className="w-full text-base font-semibold p-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 outline-none"
            >
              <option value="MEET">Spotkanie z alpakami (Standard)</option>
              <option value="WALK">Spacer z alpakami po lesie</option>
              <option value="WORKSHOP">Warsztaty z alpakami</option>
              <option value="BIRTHDAY">Urodziny / Impreza okolicznościowa</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-wider text-neutral-500 block mb-1.5">
              Limit miejsc (osób):
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={maxCapacity}
              onChange={(e) => setMaxCapacity(Number(e.target.value))}
              className="w-full text-base font-semibold p-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 outline-none"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 px-6 rounded-2xl bg-neutral-900 dark:bg-white text-white dark:text-black font-black text-base transition-all transform active:scale-95 shadow-xl flex items-center justify-center gap-2"
            >
              <Check size={20} />
              {submitting ? 'Tworzę...' : 'Utwórz godzinę w zeszycie'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
