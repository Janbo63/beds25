'use client';

import React, { useState, useEffect } from 'react';
import { BedDouble, Plus, Users, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

interface TodayGuest {
  bookingId: string;
  guestName: string;
  phone: string | null;
  roomName: string;
  numAdults: number;
  numChildren: number;
  checkIn: string;
  checkOut: string;
}

interface TodayGuestsTrayProps {
  dateStr: string;
  sessions: Array<{
    id: string;
    time: string;
    activityType: string;
  }>;
  onSelectGuestForSession: (guest: TodayGuest, session: { id: string; time: string; activityType: string }) => void;
}

export default function TodayGuestsTray({
  dateStr,
  sessions,
  onSelectGuestForSession
}: TodayGuestsTrayProps) {
  const [guests, setGuests] = useState<TodayGuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    fetchTodayGuests();
  }, [dateStr]);

  async function fetchTodayGuests() {
    setLoading(true);
    try {
      const res = await fetch(`/api/activities/today-guests?date=${dateStr}`);
      const data = await res.json();
      if (data.success) {
        setGuests(data.guests);
      }
    } catch (err) {
      console.error('Error fetching today guests:', err);
    } finally {
      setLoading(false);
    }
  }

  if (guests.length === 0 && !loading) {
    return null; // Don't clutter if no room guests checked in
  }

  return (
    <div className="rounded-3xl bg-amber-500/10 border border-amber-500/30 p-4 sm:p-5 transition-all">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold">
            <BedDouble size={18} />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base text-neutral-900 dark:text-white flex items-center gap-2">
              Goście nocujący dzisiaj w pokojach ({guests.length})
              <span className="text-xs bg-amber-500/20 text-amber-600 dark:text-amber-400 font-extrabold px-2 py-0.5 rounded-full">
                Pakiet: Spotkanie w cenie!
              </span>
            </h3>
          </div>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 p-1"
        >
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      {isExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {guests.map((g) => (
            <div
              key={g.bookingId}
              className="p-3.5 rounded-2xl bg-white dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 shadow-sm flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 truncate">
                    {g.roomName}
                  </span>
                  <span className="text-xs text-neutral-500 flex items-center gap-1 font-medium">
                    <Users size={12} /> {g.numAdults}{g.numChildren ? `+${g.numChildren}` : ''} os.
                  </span>
                </div>
                <strong className="text-sm font-extrabold text-neutral-900 dark:text-white block truncate">
                  {g.guestName}
                </strong>
                {g.phone && (
                  <span className="text-xs text-neutral-500 block mt-0.5">{g.phone}</span>
                )}
              </div>

              {/* Quick Session Add Buttons */}
              <div className="pt-2 border-t border-neutral-100 dark:border-neutral-700/50 flex flex-wrap gap-1.5">
                <span className="text-[11px] font-bold text-neutral-400 self-center mr-1">Zapisz:</span>
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onSelectGuestForSession(g, s)}
                    className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold shadow-sm transition-transform active:scale-95 flex items-center gap-1"
                  >
                    <Plus size={12} strokeWidth={3} /> {s.time}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
