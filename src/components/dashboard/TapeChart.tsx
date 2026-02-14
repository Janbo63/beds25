'use client';

import React, { useEffect, useState, useRef } from 'react';
import { format, addDays, isSameDay, parseISO } from 'date-fns';
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
        const monthName = format(parseISO(day), 'MMMM yyyy');
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
                className={`overflow-x-auto relative rounded-3xl border border-white/5 bg-neutral-900/20 backdrop-blur-sm shadow-2xl select-none cursor-grab active:cursor-grabbing ${isDragging ? 'grabbing' : ''}`}
            >
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-neutral-800/60">
                            <th className="border-r border-white/5 sticky left-0 bg-neutral-900 z-50 w-[300px] min-w-[300px] p-4 text-left shadow-2xl">
                                <span className="text-[10px] font-black uppercase text-neutral-500 tracking-[0.2em]">Inventory Timeline</span>
                            </th>
                            {months.map((month: any, i: number) => (
                                <th
                                    key={i}
                                    colSpan={month.count}
                                    className="p-0 border-r border-white/5 bg-neutral-900/40 relative h-12"
                                >
                                    <div className="sticky left-[300px] right-0 flex justify-center px-4 w-[calc(100vw-350px)] max-w-full">
                                        <div className="bg-neutral-800/80 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10 shadow-lg flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-hotel-gold animate-pulse"></span>
                                            <span className="text-[10px] font-black uppercase text-hotel-gold tracking-widest whitespace-nowrap">
                                                {month.name}
                                            </span>
                                        </div>
                                    </div>
                                </th>
                            ))}
                        </tr>
                        <tr className="bg-neutral-800/20">
                            <th className="p-8 text-left border-r border-white/5 sticky left-0 bg-neutral-900 z-50 w-[300px] min-w-[300px]">
                                <span className="text-[9px] uppercase font-black tracking-[0.3em] text-neutral-600">Accommodation Unit</span>
                            </th>
                            {data.days.map((day: string) => {
                                const isToday = day === todayStr;
                                return (
                                    <th key={day} className={`p-6 border-r border-white/5 text-center min-w-[120px] transition-colors ${isToday ? 'bg-hotel-gold/5' : ''}`}>
                                        <div className={`text-[10px] uppercase font-bold tracking-widest ${isToday ? 'text-hotel-gold' : 'text-neutral-600'}`}>
                                            {format(parseISO(day), 'EEE')}
                                        </div>
                                        <div className={`text-xl font-black ${isToday ? 'text-hotel-gold' : 'text-white/80'}`}>
                                            {format(parseISO(day), 'd')}
                                        </div>
                                        {isToday && <div className="today-indicator text-[8px] font-black text-hotel-gold uppercase mt-1 px-2 py-0.5 bg-hotel-gold/10 rounded-full">Today</div>}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {data.rooms.map((room: any) => (
                            <tr key={room.id} className="group hover:bg-white/[0.01] transition-all">
                                <td
                                    className="p-8 border-r border-white/5 sticky left-0 bg-neutral-900/98 z-30 font-bold whitespace-nowrap shadow-2xl transition-colors group-hover:bg-neutral-800 cursor-pointer hover:text-hotel-gold"
                                    onClick={() => setMassUpdateRoom({ id: room.id, number: room.number })}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-2.5 h-2.5 rounded-full bg-hotel-gold shadow-[0_0_10px_rgba(166,138,93,0.3)] group-hover:scale-125 transition-transform"></div>
                                        <div className="flex flex-col text-left">
                                            <div className="text-lg text-white font-black tracking-tight leading-tight">{room.name}</div>
                                            <div className="text-[9px] text-neutral-500 font-bold uppercase tracking-[0.2em] mt-0.5">{room.number}</div>
                                        </div>
                                    </div>
                                </td>
                                {data.days.map((day: string) => {
                                    const booking = room.bookings.find((b: any) => {
                                        const bCheckIn = typeof b.checkIn === 'string' ? b.checkIn.slice(0, 10) : format(new Date(b.checkIn), 'yyyy-MM-dd');
                                        const bCheckOut = typeof b.checkOut === 'string' ? b.checkOut.slice(0, 10) : format(new Date(b.checkOut), 'yyyy-MM-dd');
                                        return (day >= bCheckIn && day < bCheckOut);
                                    });

                                    const isToday = day === todayStr;

                                    // Use simple string slicing to avoid timezone issues with parseISO/format
                                    const checkInStr = booking ? (typeof booking.checkIn === 'string' ? booking.checkIn.slice(0, 10) : format(new Date(booking.checkIn), 'yyyy-MM-dd')) : '';
                                    const checkOutStr = booking ? (typeof booking.checkOut === 'string' ? booking.checkOut.slice(0, 10) : format(new Date(booking.checkOut), 'yyyy-MM-dd')) : '';

                                    // Compute the day AFTER the current cell
                                    const nextDay = format(addDays(new Date(day + 'T12:00:00'), 1), 'yyyy-MM-dd');

                                    const isFirstDay = booking && day === checkInStr;
                                    const isLastDay = booking && nextDay === checkOutStr;
                                    const isSingleDay = isFirstDay && isLastDay;


                                    // Get price for this date
                                    const roomPrice = room.prices?.[day]?.price || room.basePrice;
                                    const isEditing = editingCell?.roomId === room.id && editingCell?.date === day;

                                    // Compute booking block inline styles for seamless pill shape
                                    const bookingStyle: React.CSSProperties = booking ? {
                                        position: 'absolute',
                                        top: '6px',
                                        bottom: '6px',
                                        left: isSingleDay ? '3px' : isFirstDay ? '3px' : '-1px',
                                        right: isSingleDay ? '3px' : isLastDay ? '3px' : '-1px',
                                        borderRadius: isSingleDay ? '9999px' :
                                            isFirstDay ? '9999px 0 0 9999px' :
                                                isLastDay ? '0 9999px 9999px 0' : '0',
                                        zIndex: 10,
                                    } : {};

                                    // Color classes for booking blocks
                                    const bookingColorClass = booking ? (
                                        booking.status === 'BLOCKED' ? 'bg-neutral-800 text-neutral-500' :
                                            booking.status === 'CANCELLED' ? 'bg-rose-900/40 text-rose-400' :
                                                booking.status === 'REQUEST' ? 'bg-amber-600 text-white' :
                                                    booking.source?.toUpperCase() === 'AIRBNB' ? 'bg-[#FF5A5F] text-white' :
                                                        booking.source?.toUpperCase().includes('BOOKING') ? 'bg-[#003580] text-white' :
                                                            'bg-alpaca-green text-white'
                                    ) : '';

                                    return (
                                        <td
                                            key={day}
                                            className={`p-0 h-28 text-center day-cell relative transition-all group ${isToday ? 'bg-hotel-gold/[0.02]' : ''
                                                } ${!booking && !isEditing ? 'hover:bg-alpaca-green/[0.05] cursor-pointer border-r border-white/[0.03]' : ''
                                                } ${isEditing ? 'bg-hotel-gold/10 border-r border-white/[0.03]' : ''
                                                } ${booking ? 'border-r-0' : ''
                                                }`}
                                            onClick={() => {
                                                if (hasDragged) return; // Ignore clicks if user was dragging
                                                if (booking) {
                                                    setSelectedBooking(booking);
                                                } else if (!isEditing && onCellClick) {
                                                    onCellClick({
                                                        roomNumber: room.number,
                                                        roomId: room.id,
                                                        checkIn: day
                                                    });
                                                }
                                            }}
                                            onDoubleClick={(e) => {
                                                if (hasDragged) return; // Ignore double-clicks if user was dragging
                                                if (!booking) {
                                                    e.stopPropagation();
                                                    setEditingCell({ roomId: room.id, date: day });
                                                    setTempPrice(roomPrice?.toString() || '');
                                                } else {
                                                    setSelectedBooking(booking);
                                                }
                                            }}
                                        >
                                            {!booking && (
                                                <div className="flex flex-col items-center justify-center h-full">
                                                    {isEditing ? (
                                                        <input
                                                            autoFocus
                                                            type="number"
                                                            className="w-full h-full bg-hotel-gold/20 border-2 border-hotel-gold text-center font-black text-sm outline-none"
                                                            value={tempPrice}
                                                            onChange={(e) => setTempPrice(e.target.value)}
                                                            onBlur={async () => {
                                                                // Save the price
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
                                                                    // Update local state
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
                                            {booking && (
                                                <div
                                                    onClick={(e) => {
                                                        // Allow the td onClick to handle it for broader click area
                                                    }}
                                                    onDoubleClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedBooking(booking);
                                                    }}
                                                    style={bookingStyle}
                                                    className={`flex flex-col items-center justify-center text-[10px] font-black uppercase px-3 shadow-lg cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all overflow-hidden ${bookingColorClass}`}
                                                >
                                                    <div className="sticky left-0 right-0 flex flex-col items-center gap-1 w-full px-2">
                                                        <div className="flex items-center gap-1.5 opacity-90">
                                                            <span className="scale-110">{booking.status === 'BLOCKED' ? '🔒' :
                                                                booking.source?.toUpperCase() === 'AIRBNB' ? '🏠' :
                                                                    booking.source?.toUpperCase().includes('BOOKING') ? '✈️' : '✨'}</span>
                                                            {(isFirstDay || booking.totalPrice > 0) && (
                                                                <span className="font-black text-white whitespace-nowrap">
                                                                    {booking.totalPrice > 0 ? `${booking.totalPrice} zł` : ''}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="truncate w-full text-center font-black tracking-tight leading-none">
                                                            {booking.status === 'BLOCKED' ? 'Blocked' :
                                                                booking.status === 'CANCELLED' ? 'Cancelled' : booking.guestName}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
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
