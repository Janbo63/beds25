'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Users,
  Phone,
  Trash2,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Sparkles
} from 'lucide-react';
import QuickAddGuestModal from './QuickAddGuestModal';
import CustomTimeModal from './CustomTimeModal';
import TodayGuestsTray from './TodayGuestsTray';

interface ActivityBooking {
  id: string;
  guestName: string;
  phone: string | null;
  numAdults: number;
  numChildren: number;
  isRoomGuest: boolean;
  totalPrice: number;
  paymentStatus: string;
  paymentMethod: string | null;
  notes: string | null;
  roomBooking?: {
    room?: {
      name?: string;
    };
  } | null;
}

interface ActivitySession {
  id: string;
  time: string;
  activityType: string;
  status: string;
  maxCapacity: number;
  notes: string | null;
  bookings: ActivityBooking[];
}

export default function ActivityDiary() {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Modals state
  const [activeSessionForAdd, setActiveSessionForAdd] = useState<{
    id: string;
    time: string;
    activityType: string;
  } | null>(null);
  const [isAddGuestOpen, setIsAddGuestOpen] = useState<boolean>(false);
  const [prefilledGuestData, setPrefilledGuestData] = useState<any>(null);
  const [isCustomTimeOpen, setIsCustomTimeOpen] = useState<boolean>(false);

  useEffect(() => {
    fetchSessions();
  }, [selectedDate]);

  async function fetchSessions() {
    setLoading(true);
    try {
      const res = await fetch(`/api/activities/sessions?date=${selectedDate}`);
      const data = await res.json();
      if (data.success) {
        setSessions(data.sessions);
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteBooking(id: string) {
    if (!confirm('Czy na pewno chcesz usunąć tę rezerwację z zeszytu?')) return;
    try {
      const res = await fetch(`/api/activities/bookings?id=${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        fetchSessions();
      }
    } catch (err) {
      console.error('Error deleting booking:', err);
    }
  }

  function handleOpenAddGuest(session: { id: string; time: string; activityType: string }, initial?: any) {
    setActiveSessionForAdd(session);
    setPrefilledGuestData(initial || null);
    setIsAddGuestOpen(true);
  }

  function handleRoomGuestClaim(guest: any, session: { id: string; time: string; activityType: string }) {
    handleOpenAddGuest(session, {
      guestName: guest.guestName,
      phone: guest.phone,
      numAdults: guest.numAdults,
      numChildren: guest.numChildren,
      isRoomGuest: true,
      roomBookingId: guest.bookingId,
      roomName: guest.roomName
    });
  }

  // Date helpers
  function changeDate(deltaDays: number) {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + deltaDays);
    setSelectedDate(d.toISOString().split('T')[0]);
  }

  function setToday() {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === todayStr;

  const dateObj = new Date(`${selectedDate}T12:00:00.000Z`);
  const formattedDayTitle = dateObj.toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  // Calculations for summary
  const totalBookedToday = sessions.reduce((sum, s) => {
    return (
      sum +
      s.bookings.reduce((sub, b) => sub + b.numAdults + b.numChildren, 0)
    );
  }, 0);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 md:p-8 space-y-6">
      
      {/* Top Bar: Paper Diary Date Navigator */}
      <div className="rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row justify-between items-center gap-4">
        
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <button
            onClick={() => changeDate(-1)}
            className="w-12 h-12 rounded-2xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 flex items-center justify-center text-neutral-700 dark:text-neutral-200 transition-colors"
            title="Poprzedni dzień"
          >
            <ChevronLeft size={24} />
          </button>

          <div className="text-center sm:text-left">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
              Zeszyt Spotkań z Alpakami
            </span>
            <h1 className="text-xl sm:text-2xl font-black capitalize text-neutral-900 dark:text-white">
              {formattedDayTitle}
            </h1>
          </div>

          <button
            onClick={() => changeDate(1)}
            className="w-12 h-12 rounded-2xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 flex items-center justify-center text-neutral-700 dark:text-neutral-200 transition-colors"
            title="Następny dzień"
          >
            <ChevronRight size={24} />
          </button>
        </div>

        {/* Today quick return & stats */}
        <div className="flex items-center gap-3">
          {!isToday && (
            <button
              onClick={setToday}
              className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all active:scale-95"
            >
              Wróć do Dzisiaj
            </button>
          )}

          <div className="px-4 py-2 rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-bold flex items-center gap-2">
            <Users size={16} className="text-emerald-500" />
            <span>Razem dzisiaj: <strong className="text-base text-neutral-900 dark:text-white">{totalBookedToday}</strong> os.</span>
          </div>
        </div>

      </div>

      {/* In-House Overnight Guests Quick Tray */}
      <TodayGuestsTray
        dateStr={selectedDate}
        sessions={sessions.map(s => ({ id: s.id, time: s.time, activityType: s.activityType }))}
        onSelectGuestForSession={handleRoomGuestClaim}
      />

      {/* Sessions List */}
      <div className="space-y-6">
        {loading ? (
          <div className="text-center py-16 text-neutral-500">
            Wczytuję zapisy w zeszycie...
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-200 dark:border-neutral-800 p-8">
            <p className="text-neutral-500 font-medium">Brak zaplanowanych sesji na ten dzień.</p>
          </div>
        ) : (
          sessions.map((session) => {
            const sessionTotal = session.bookings.reduce(
              (sum, b) => sum + b.numAdults + b.numChildren,
              0
            );
            const isFull = sessionTotal >= session.maxCapacity;

            return (
              <div
                key={session.id}
                className="rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-xl transition-all"
              >
                {/* Session Header Card */}
                <div className="p-5 sm:p-6 bg-gradient-to-r from-neutral-50 to-neutral-100/60 dark:from-neutral-800/80 dark:to-neutral-900/80 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-4">
                  
                  <div className="flex items-center gap-4">
                    <div className="px-4 py-2 rounded-2xl bg-emerald-700 text-white font-black text-2xl tracking-tight shadow-md flex items-center gap-1.5">
                      <Clock size={20} className="text-emerald-300" />
                      {session.time}
                    </div>
                    <div>
                      <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white">
                        {session.activityType === 'MEET'
                          ? 'Spotkanie z alpakami'
                          : session.activityType === 'WALK'
                          ? 'Spacer z alpakami po lesie'
                          : session.activityType === 'WORKSHOP'
                          ? 'Warsztaty z alpakami'
                          : 'Urodziny / Impreza'}
                      </h2>
                      <span className="text-xs text-neutral-500 font-semibold block mt-0.5">
                        {session.time === '11:00' ? 'Poranna sesja standardowa' : session.time === '15:30' ? 'Popołudniowa sesja standardowa' : 'Elastyczna sesja dodatkowa'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold flex items-center gap-1.5 ${
                        isFull
                          ? 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30'
                          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      <Users size={14} />
                      {sessionTotal} / {session.maxCapacity} osób
                    </span>

                    <button
                      onClick={() => handleOpenAddGuest(session)}
                      className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                    >
                      <Plus size={18} /> Dodaj gościa
                    </button>
                  </div>

                </div>

                {/* Attendees List */}
                <div className="p-4 sm:p-6">
                  {session.bookings.length === 0 ? (
                    <p className="text-neutral-400 dark:text-neutral-500 text-sm italic text-center py-6">
                      Brak zapisanych gości na tę godzinę. Kliknij „Dodaj gościa”, aby wpisać rezerwację.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {session.bookings.map((b) => (
                        <div
                          key={b.id}
                          className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700/60 flex flex-wrap items-center justify-between gap-3 hover:border-emerald-500/40 transition-colors"
                        >
                          <div className="flex-1 min-w-[200px]">
                            <div className="flex items-center gap-2 mb-1">
                              <strong className="text-base font-bold text-neutral-900 dark:text-white">
                                {b.guestName}
                              </strong>
                              {b.isRoomGuest && (
                                <span className="text-[11px] font-extrabold bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2.5 py-0.5 rounded-full">
                                  🏨 Pokój (w cenie)
                                </span>
                              )}
                              {!b.isRoomGuest && b.paymentStatus === 'PAID' && (
                                <span className="text-[11px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-2.5 py-0.5 rounded-full">
                                  ✓ Opłacone ({b.totalPrice} PLN)
                                </span>
                              )}
                              {!b.isRoomGuest && b.paymentStatus !== 'PAID' && (
                                <span className="text-[11px] font-bold bg-red-500/20 text-red-600 dark:text-red-400 px-2.5 py-0.5 rounded-full">
                                  Do zapłaty: {b.totalPrice} PLN
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                              <span className="font-semibold">
                                Liczba osób: {b.numAdults} dorosł{b.numAdults === 1 ? 'y' : 'ych'}
                                {b.numChildren > 0 ? ` + ${b.numChildren} dzieck${b.numChildren === 1 ? 'o' : 'i'}` : ''}
                              </span>
                              {b.phone && (
                                <span className="flex items-center gap-1 text-neutral-600 dark:text-neutral-400 font-medium">
                                  <Phone size={11} /> {b.phone}
                                </span>
                              )}
                              {b.notes && (
                                <span className="italic text-neutral-400">
                                  ({b.notes})
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Quick Action Buttons */}
                          <div className="flex items-center gap-2">
                            {b.phone && (
                              <a
                                href={`https://wa.me/${b.phone.replace(/[^0-9]/g, '')}?text=Dzie%C5%84%20dobry%2C%20kontaktuj%C4%99%20si%C4%99%20z%20Zagrody%20Alpakoterapii%20w%20sprawie%20dzisiejszego%20spotkania%20z%20alpakami%20o%20${session.time}...`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-9 h-9 rounded-xl bg-green-500/15 hover:bg-green-500/30 text-green-600 dark:text-green-400 flex items-center justify-center transition-colors"
                                title="Napisz na WhatsApp"
                              >
                                <MessageSquare size={16} />
                              </a>
                            )}

                            <button
                              onClick={() => handleDeleteBooking(b.id)}
                              className="w-9 h-9 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 flex items-center justify-center transition-colors"
                              title="Usuń z zeszytu"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Add Custom Time Slot Button */}
      <div className="text-center pt-4">
        <button
          onClick={() => setIsCustomTimeOpen(true)}
          className="px-6 py-3.5 rounded-2xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-bold text-sm shadow-sm transition-all flex items-center gap-2 mx-auto"
        >
          <Clock size={16} className="text-hotel-gold" />
          + Dodaj inną godzinę na ten dzień (Custom Time)
        </button>
      </div>

      {/* Modals */}
      <QuickAddGuestModal
        isOpen={isAddGuestOpen}
        onClose={() => setIsAddGuestOpen(false)}
        onSuccess={fetchSessions}
        session={activeSessionForAdd}
        initialData={prefilledGuestData}
      />

      <CustomTimeModal
        isOpen={isCustomTimeOpen}
        onClose={() => setIsCustomTimeOpen(false)}
        onSuccess={fetchSessions}
        dateStr={selectedDate}
      />

    </div>
  );
}
