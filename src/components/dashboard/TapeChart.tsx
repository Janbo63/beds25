'use client';

import React, { useEffect, useState, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { enUS, pl } from 'date-fns/locale';
import { useTranslations, useLocale } from 'next-intl';
import BookingModal from './BookingModal';
import MassRateUpdateModal from './MassRateUpdateModal';

interface TapeChartProps {
    onCellClick?: (data: { roomNumber: string; roomId: string; checkIn: string }) => void;
}

export default function TapeChart({ onCellClick }: TapeChartProps) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selectedBooking, setSelectedBooking] = useState<any>(null);
    const [massUpdateRoom, setMassUpdateRoom] = useState<{ id: string, number: string } | null>(null);
    const [editingCell, setEditingCell] = useState<{ roomId: string, date: string } | null>(null);
    const [tempPrice, setTempPrice] = useState<string>('');
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Smooth drag-to-scroll implementation
    const t = useTranslations('Dashboard');
    const locale = useLocale();
    const dateLocale = locale === 'pl' ? pl : enUS;

    const [isDragging, setIsDragging] = useState(false);
    const [hasDragged, setHasDragged] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!scrollContainerRef.current) return;
        setIsDragging(true);
        setHasDragged(false);
        setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
        setScrollLeft(scrollContainerRef.current.scrollLeft);
    };

    const handleMouseLeaveOrUp = () => {
        setIsDragging(false);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !scrollContainerRef.current) return;
        const x = e.pageX - scrollContainerRef.current.offsetLeft;
        const walk = (x - startX) * 1.5;

        // If moved significantly, consider it a drag and block clicks
        if (Math.abs(x - startX) > 5) {
            setHasDragged(true);
            scrollContainerRef.current.scrollLeft = scrollLeft - walk;
        }
    };

    useEffect(() => {
        fetch('/api/dashboard/tape-chart')
            .then(res => res.json())
            .then(d => {
                setData(d);
                setLoading(false);
                // Scroll to today by default after a short delay
                setTimeout(() => {
                    const todayCell = document.querySelector('.today-indicator');
                    if (todayCell && scrollContainerRef.current) {
                        todayCell.scrollIntoView({ behavior: 'smooth', inline: 'center' });
                    }
                }, 500);
            });
    }, []);

    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (loading || !data || !mounted) return <div className="p-8 text-neutral-500">Loading chart...</div>;

    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // Group days by month for the orientation header
    const months = data.days.reduce((acc: any[], day: string) => {
        const monthName = format(parseISO(day), 'MMMM yyyy', { locale: dateLocale });
        if (acc.length === 0 || acc[acc.length - 1].name !== monthName) {
            acc.push({ name: monthName, count: 1 });
        } else {
            acc[acc.length - 1].count++;
        }
        return acc;
    }, []);

    return (
        <>
            <div
                ref={scrollContainerRef}
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeaveOrUp}
                onMouseUp={handleMouseLeaveOrUp}
                onMouseMove={handleMouseMove}
                className={`overflow-x-auto relative rounded-3xl border border-neutral-200 dark:border-white/5 bg-white/80 dark:bg-neutral-900/20 backdrop-blur-sm shadow-2xl select-none cursor-grab active:cursor-grabbing ${isDragging ? 'grabbing' : ''}`}
            >
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-neutral-100/60 dark:bg-neutral-800/60">
                            <th className="border-r border-neutral-200 dark:border-white/5 sticky left-0 bg-white dark:bg-neutral-900 z-50 w-[300px] min-w-[300px] p-4 text-left shadow-2xl">
                                <span className="text-[10px] font-black uppercase text-neutral-500 tracking-[0.2em]">{t('timeline')}</span>
                            </th>
                            {months.map((month: any, i: number) => (
                                <th
                                    key={i}
                                    colSpan={month.count}
                                    className="p-0 border-r border-neutral-200 dark:border-white/5 bg-neutral-50/40 dark:bg-neutral-900/40 relative h-12"
                                >
                                    <div className="sticky left-[300px] right-0 flex justify-center px-4 w-[calc(100vw-350px)] max-w-full">
                                        <div className="bg-neutral-200/80 dark:bg-neutral-800/80 backdrop-blur-md px-4 py-1.5 rounded-full border border-neutral-300 dark:border-white/10 shadow-lg flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-hotel-gold animate-pulse"></span>
                                            <span className="text-[10px] font-black uppercase text-hotel-gold tracking-widest whitespace-nowrap">
                                                {month.name}
                                            </span>
                                        </div>
                                    </div>
                                </th>
                            ))}
                        </tr>
                        <tr className="bg-neutral-50/20 dark:bg-neutral-800/20">
                            <th className="p-8 text-left border-r border-neutral-200 dark:border-white/5 sticky left-0 bg-white dark:bg-neutral-900 z-50 w-[300px] min-w-[300px]">
                                <span className="text-[9px] uppercase font-black tracking-[0.3em] text-neutral-600">{t('unit')}</span>
                            </th>
                            {data.days.map((day: string) => {
                                const isToday = day === todayStr;
                                return (
                                    <th key={day} className={`p-2 border-r border-neutral-200 dark:border-white/5 text-center min-w-[70px] transition-colors ${isToday ? 'bg-hotel-gold/5' : ''}`}>
                                        <div className={`text-[10px] uppercase font-bold tracking-widest ${isToday ? 'text-hotel-gold' : 'text-neutral-600'}`}>
                                            {format(parseISO(day), 'EEE', { locale: dateLocale })}
                                        </div>
                                        <div className={`text-xl font-black ${isToday ? 'text-hotel-gold' : 'text-neutral-700 dark:text-white/80'}`}>
                                            {format(parseISO(day), 'd')}
                                        </div>
                                        {isToday && <div className="today-indicator text-[8px] font-black text-hotel-gold uppercase mt-1 px-2 py-0.5 bg-hotel-gold/10 rounded-full">{t('today')}</div>}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-white/5">
                        {data.rooms.map((room: any) => (
                            <tr key={room.id} className="group hover:bg-neutral-50/50 dark:hover:bg-white/[0.01] transition-all">
                                <td
                                    className="p-8 border-r border-neutral-200 dark:border-white/5 sticky left-0 bg-white/98 dark:bg-neutral-900/98 z-30 font-bold whitespace-nowrap shadow-2xl transition-colors group-hover:bg-neutral-50 dark:group-hover:bg-neutral-800 cursor-pointer hover:text-hotel-gold"
                                    onClick={() => setMassUpdateRoom({ id: room.id, number: room.number })}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-2.5 h-2.5 rounded-full bg-hotel-gold shadow-[0_0_10px_rgba(166,138,93,0.3)] group-hover:scale-125 transition-transform"></div>
                                        <div className="flex flex-col text-left">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg text-neutral-800 dark:text-white font-black tracking-tight leading-tight">{room.internalName || room.name}</span>
                                                <span className="text-sm opacity-0 group-hover:opacity-100 transition-opacity" title="Mass Rate Update">💰</span>
                                            </div>
                                            <div className="text-[9px] text-neutral-500 font-bold uppercase tracking-[0.2em] mt-0.5">{room.number}</div>
                                        </div>
                                    </div>
                                </td>
                                {data.days.map((day: string) => {
                                    // Find a booking that SPANS this day (check-in <= day < check-out)
                                    // Find bookings that SPAN this day (check-in <= day < check-out)
                                    const stayBookings = room.bookings.filter((b: any) => {
                                        const bCheckIn = typeof b.checkIn === 'string' ? b.checkIn.slice(0, 10) : format(new Date(b.checkIn), 'yyyy-MM-dd');
                                        const bCheckOut = typeof b.checkOut === 'string' ? b.checkOut.slice(0, 10) : format(new Date(b.checkOut), 'yyyy-MM-dd');
                                        return (day >= bCheckIn && day < bCheckOut);
                                    });

                                    // Find bookings that CHECK OUT on this day (right-half overlap)
                                    const departingBookings = room.bookings.filter((b: any) => {
                                        const bCheckOut = typeof b.checkOut === 'string' ? b.checkOut.slice(0, 10) : format(new Date(b.checkOut), 'yyyy-MM-dd');
                                        return day === bCheckOut;
                                    });

                                    const isToday = day === todayStr;

                                    // Helper to get check-in/check-out strings
                                    const getDateStr = (b: any, field: 'checkIn' | 'checkOut') =>
                                        typeof b[field] === 'string' ? b[field].slice(0, 10) : format(new Date(b[field]), 'yyyy-MM-dd');

                                    // Get price for this date
                                    const roomPrice = room.prices?.[day]?.price || room.basePrice;
                                    const isEditing = editingCell?.roomId === room.id && editingCell?.date === day;

                                    // Determine if NEITHER booking covers this cell
                                    const hasAnyBooking = stayBookings.length > 0 || departingBookings.length > 0;
                                    const totalBookingsOverlap = stayBookings.length + departingBookings.length;

                                    // Color function for booking blocks
                                    const getBookingColor = (b: any) => (
                                        b.isPrivate ? 'bg-fuchsia-800 text-white' :
                                            b.status === 'BLOCKED' ? 'bg-neutral-800 text-neutral-500' :
                                                b.status === 'CANCELLED' ? 'bg-rose-900/40 text-rose-400' :
                                                    b.status === 'REQUEST' ? 'bg-amber-600 text-white' :
                                                        b.source?.toUpperCase() === 'AIRBNB' ? 'bg-[#FF5A5F] text-white' :
                                                            b.source?.toUpperCase()?.includes('BOOKING') ? 'bg-[#003580] text-white' :
                                                                'bg-alpaca-green text-white'
                                    );

                                    // Compute center day for label rendering (account for half-day check-in)
                                    const getCenterInfo = (b: any, bCheckIn: string, bCheckOut: string) => {
                                        const checkInDate = new Date(bCheckIn + 'T12:00:00');
                                        const checkOutDate = new Date(bCheckOut + 'T12:00:00');
                                        const numNights = Math.round((checkOutDate.getTime() - checkInDate.getTime()) / (24 * 60 * 60 * 1000));
                                        const currentDate = new Date(day + 'T12:00:00');
                                        const dayIndex = Math.round((currentDate.getTime() - checkInDate.getTime()) / (24 * 60 * 60 * 1000));
                                        // Shift center right to account for half-cell on check-in day
                                        const centerIndex = Math.ceil(numNights / 2);
                                        return { isCenterDay: dayIndex === centerIndex, numNights };
                                    };

                                    // Booking label renderer
                                    const renderBookingLabel = (b: any) => {
                                        const icon = b.isPrivate ? '🤫' : b.status === 'BLOCKED' ? '🔒' : b.source?.toUpperCase() === 'AIRBNB' ? '🏠' : b.source?.toUpperCase()?.includes('BOOKING') ? '✈️' : '✨';
                                        const nameText = b.status === 'BLOCKED' ? (b.guestName || 'Blocked') : b.status === 'CANCELLED' ? 'Cancelled' : b.guestName;
                                        return (
                                            <div className="sticky left-0 right-0 flex items-center justify-center gap-1 w-full px-1 overflow-hidden whitespace-nowrap h-full">
                                                <span className="opacity-90 text-[10px] leading-none">{icon}</span>
                                                {b.totalPrice > 0 && !b.isPrivate && (
                                                    <span className="font-bold text-white whitespace-nowrap border-r border-white/30 pr-1 mr-0.5 text-[9px] leading-none">
                                                        {b.totalPrice} zł
                                                    </span>
                                                )}
                                                <span className="truncate max-w-[140px] font-bold tracking-tight leading-none text-[10px]">
                                                    {nameText}
                                                </span>
                                            </div>
                                        );
                                    };

                                    return (
                                        <td
                                            key={day}
                                            className={`p-0 h-20 text-center day-cell relative transition-all group border-r border-neutral-200/50 dark:border-white/[0.03] ${isToday ? 'bg-hotel-gold/[0.02]' : ''
                                                } ${!hasAnyBooking && !isEditing ? 'hover:bg-alpaca-green/[0.05] cursor-pointer' : ''
                                                } ${isEditing ? 'bg-hotel-gold/10' : ''
                                                }`}
                                            onClick={() => {
                                                if (hasDragged) return;
                                                if (stayBookings.length > 0) {
                                                    setSelectedBooking(stayBookings[0]);
                                                } else if (departingBookings.length > 0) {
                                                    setSelectedBooking(departingBookings[0]);
                                                } else if (!isEditing && onCellClick) {
                                                    onCellClick({
                                                        roomNumber: room.number,
                                                        roomId: room.id,
                                                        checkIn: day
                                                    });
                                                }
                                            }}
                                            onDoubleClick={(e) => {
                                                if (hasDragged) return;
                                                if (stayBookings.length > 0) {
                                                    setSelectedBooking(stayBookings[0]);
                                                } else if (departingBookings.length > 0) {
                                                    setSelectedBooking(departingBookings[0]);
                                                } else {
                                                    e.stopPropagation();
                                                    setEditingCell({ roomId: room.id, date: day });
                                                    setTempPrice(roomPrice?.toString() || '');
                                                }
                                            }}
                                        >
                                            {/* Price shown when no booking occupies the full cell */}
                                            {!hasAnyBooking && (
                                                <div className="flex flex-col items-center justify-center h-full">
                                                    {isEditing ? (
                                                        <input
                                                            autoFocus
                                                            type="number"
                                                            className="w-full h-full bg-hotel-gold/20 border-2 border-hotel-gold text-center font-black text-sm outline-none"
                                                            value={tempPrice}
                                                            onChange={(e) => setTempPrice(e.target.value)}
                                                            onBlur={async () => {
                                                                try {
                                                                    await fetch('/api/dashboard/rates', {
                                                                        method: 'POST',
                                                                        headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify({
                                                                            roomId: editingCell?.roomId,
                                                                            date: editingCell?.date,
                                                                            price: tempPrice
                                                                        })
                                                                    });
                                                                    const updatedData = { ...data };
                                                                    const roomIndex = updatedData.rooms.findIndex((r: any) => r.id === editingCell?.roomId);
                                                                    if (roomIndex !== -1) {
                                                                        if (!updatedData.rooms[roomIndex].prices) {
                                                                            updatedData.rooms[roomIndex].prices = {};
                                                                        }
                                                                        updatedData.rooms[roomIndex].prices[editingCell?.date || ''] = {
                                                                            price: parseFloat(tempPrice)
                                                                        };
                                                                        setData(updatedData);
                                                                    }
                                                                } catch (error) {
                                                                    console.error('Failed to save rate:', error);
                                                                } finally {
                                                                    setEditingCell(null);
                                                                }
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.currentTarget.blur();
                                                                } else if (e.key === 'Escape') {
                                                                    setEditingCell(null);
                                                                }
                                                            }}
                                                        />
                                                    ) : (
                                                        <span className="text-[11px] font-black text-neutral-600 group-hover:text-neutral-400 transition-colors">
                                                            {Math.round(roomPrice)} zł
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* DEPARTING bookings — left half of cell (checkout day) */}
                                            {departingBookings.map((departBooking: any, idx: number) => {
                                                const departCheckIn = getDateStr(departBooking, 'checkIn');
                                                const departCheckOut = getDateStr(departBooking, 'checkOut');
                                                const heightPx = 20;
                                                const topOffset = `${idx * 24 + 4}px`;
                                                
                                                return (
                                                    <div
                                                        key={`depart-${departBooking.id}`}
                                                        onClick={(e) => { e.stopPropagation(); setSelectedBooking(departBooking); }}
                                                        style={{
                                                            position: 'absolute',
                                                            top: topOffset,
                                                            bottom: 'auto',
                                                            height: `${heightPx}px`,
                                                            left: '-1px',
                                                            right: '50%',
                                                            borderRadius: '0 4px 4px 0',
                                                            zIndex: 10 + idx,
                                                            border: totalBookingsOverlap > 1 ? '1px solid rgba(255,255,255,0.3)' : 'none',
                                                        }}
                                                        className={`flex items-center justify-center text-[10px] font-black uppercase shadow-sm cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all overflow-hidden ${getBookingColor(departBooking)}`}
                                                    >
                                                        {(() => {
                                                            const { isCenterDay, numNights } = getCenterInfo(departBooking, departCheckIn, departCheckOut);
                                                            return (numNights === 1 || isCenterDay) ? renderBookingLabel(departBooking) : null;
                                                        })()}
                                                    </div>
                                                );
                                            })}

                                            {/* STAYING bookings — right half on check-in day, full on middle days */}
                                            {stayBookings.map((stayBooking: any, idx: number) => {
                                                const stayCheckIn = getDateStr(stayBooking, 'checkIn');
                                                const stayCheckOut = getDateStr(stayBooking, 'checkOut');
                                                const isCheckInDay = day === stayCheckIn;
                                                
                                                // Offset idx by the number of departing bookings so they stack sequentially
                                                const stackIdx = idx + departingBookings.length;
                                                const heightPx = 20;
                                                const topOffset = `${stackIdx * 24 + 4}px`;
                                                
                                                return (
                                                    <div
                                                        key={`stay-${stayBooking.id}`}
                                                        onClick={(e) => { e.stopPropagation(); setSelectedBooking(stayBooking); }}
                                                        style={{
                                                            position: 'absolute',
                                                            top: topOffset,
                                                            bottom: 'auto',
                                                            height: `${heightPx}px`,
                                                            left: isCheckInDay ? '50%' : '-1px',
                                                            right: '-1px',
                                                            borderRadius: isCheckInDay ? '4px 0 0 4px' : '0',
                                                            zIndex: 10 + stackIdx,
                                                            border: totalBookingsOverlap > 1 ? '1px solid rgba(255,255,255,0.3)' : 'none',
                                                        }}
                                                        className={`flex items-center justify-center text-[10px] font-black uppercase shadow-sm cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all overflow-hidden ${getBookingColor(stayBooking)}`}
                                                    >
                                                        {(() => {
                                                            const { isCenterDay } = getCenterInfo(stayBooking, stayCheckIn, stayCheckOut);
                                                            return isCenterDay ? renderBookingLabel(stayBooking) : null;
                                                        })()}
                                                    </div>
                                                );
                                            })}
                                        </td>
                                    );
                                })}

                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {selectedBooking && (
                <BookingModal
                    booking={selectedBooking}
                    onClose={() => setSelectedBooking(null)}
                />
            )}

            {massUpdateRoom && (
                <MassRateUpdateModal
                    roomId={massUpdateRoom.id}
                    roomNumber={massUpdateRoom.number}
                    onClose={() => setMassUpdateRoom(null)}
                    onSave={() => {
                        setLoading(true);
                        fetch('/api/dashboard/tape-chart')
                            .then(res => res.json())
                            .then(d => {
                                setData(d);
                                setLoading(false);
                            });
                    }}
                />
            )}
        </>
    );
}
