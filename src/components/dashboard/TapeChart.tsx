'use client';

import React, { useEffect, useState, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { enUS, pl } from 'date-fns/locale';
import { useTranslations, useLocale } from 'next-intl';
import BookingModal from './BookingModal';
import MassRateUpdateModal from './MassRateUpdateModal';

// Icons for tooltip styling
const iconMap: Record<string, string> = {
    AIRBNB: '🏠',
    BOOKING: '✈️',
    PRIVATE: '🤫',
    BLOCKED: '🔒',
    CANCELLED: '❌',
    DIRECT: '✨'
};

interface TapeChartProps {
    onCellClick?: (data: { roomNumber: string; roomId: string; checkIn: string }) => void;
}

export default function TapeChart({ onCellClick }: TapeChartProps) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [selectedBooking, setSelectedBooking] = useState<any>(null);
    const [massUpdateRoom, setMassUpdateRoom] = useState<{ id: string, number: string } | null>(null);
    
    // Quick price edit
    const [editingCell, setEditingCell] = useState<{ roomId: string, date: string } | null>(null);
    const [tempPrice, setTempPrice] = useState<string>('');
    
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const t = useTranslations('Dashboard');
    const locale = useLocale();
    const dateLocale = locale === 'pl' ? pl : enUS;

    // Draggable scroll state
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

        // Threshold to distinguish click vs drag
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
                setTimeout(() => {
                    const todayCell = document.querySelector('.today-indicator');
                    if (todayCell && scrollContainerRef.current) {
                        // Scroll to the today cell horizontally, putting it near the center
                        // Use inline: 'center' to center horizontally, block: 'nearest' to avoid vertical jumps
                        todayCell.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                    }
                }, 600); // Increased timeout slightly to ensure grid is fully painted
            });
    }, []);

    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    // Layout Engine: Row placement for overlapping bookings
    const bookingRows = React.useMemo(() => {
        if (!data?.rooms) return {};
        const rowMap: Record<number, Record<number, number>> = {};
        
        data.rooms.forEach((room: any) => {
            rowMap[room.id] = {};
            
            // Sort: active before cancelled, then chronological
            const sortedBookings = [...room.bookings].sort((a: any, b: any) => {
                const checkInA = new Date(a.checkIn).getTime();
                const checkInB = new Date(b.checkIn).getTime();
                
                if (a.status !== 'CANCELLED' && b.status === 'CANCELLED') return -1;
                if (a.status === 'CANCELLED' && b.status !== 'CANCELLED') return 1;
                return checkInA - checkInB;
            });

            // Greedy fit
            const rowsActive: any[][] = [];
            sortedBookings.forEach((b: any) => {
                let rowFound = -1;
                for (let r = 0; r < rowsActive.length; r++) {
                    const overlaps = rowsActive[r].some(existingB => {
                        return (new Date(b.checkIn) < new Date(existingB.checkOut) && new Date(b.checkOut) > new Date(existingB.checkIn));
                    });
                    if (!overlaps) {
                        rowFound = r;
                        break;
                    }
                }
                if (rowFound === -1) {
                    rowFound = rowsActive.length;
                    rowsActive.push([]);
                }
                rowsActive[rowFound].push(b);
                rowMap[room.id][b.id] = rowFound;
            });
        });
        return rowMap;
    }, [data]);

    if (loading || !data || !mounted) return <div className="p-8 text-neutral-500 font-bold uppercase tracking-widest text-sm animate-pulse">{t('timeline')}...</div>;

    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // Build month headers based on consecutive days
    const months = data.days.reduce((acc: any[], day: string) => {
        const monthName = format(parseISO(day), 'MMMM yyyy', { locale: dateLocale });
        if (acc.length === 0 || acc[acc.length - 1].name !== monthName) {
            acc.push({ name: monthName, count: 1 });
        } else {
            acc[acc.length - 1].count++;
        }
        return acc;
    }, []);

    // CSS Grid Column Math helper (Half-Day Resolution)
    const getGridSpan = (bCheckIn: string, bCheckOut: string, windowDays: string[]) => {
        const windowStartStr = windowDays[0];
        const windowEndStr = windowDays[windowDays.length - 1];

        const inStr = typeof bCheckIn === 'string' ? bCheckIn.slice(0, 10) : format(new Date(bCheckIn), 'yyyy-MM-dd');
        const outStr = typeof bCheckOut === 'string' ? bCheckOut.slice(0, 10) : format(new Date(bCheckOut), 'yyyy-MM-dd');

        if (outStr <= windowStartStr) return null;
        if (inStr > windowEndStr) return null;

        let startLine = 1;
        let endLine = windowDays.length * 2 + 1;

        const startIndex = windowDays.indexOf(inStr);
        if (startIndex !== -1) {
            startLine = startIndex * 2 + 2; // Check-in strictly begins Afternoon (PM)
        }

        const endIndex = windowDays.indexOf(outStr);
        if (endIndex !== -1) {
            endLine = endIndex * 2 + 2; // Check-out strictly ends after Morning (AM)
        }

        if (startLine >= endLine) return null;
        return `${startLine} / ${endLine}`;
    };

    const getBookingColor = (b: any) => {
        if (b.status === 'CANCELLED') return 'bg-neutral-200 text-neutral-500 border border-neutral-300 opacity-80';
        if (b.isPrivate) return 'bg-neutral-900 text-white shadow-md border-b-2 border-black/20';
        if (b.status === 'BLOCKED') return 'bg-neutral-200 text-neutral-500 border border-neutral-300 ring-2 ring-inset ring-neutral-300 pattern-diagonal-lines-sm opacity-60';
        if (b.status === 'REQUEST') return 'bg-amber-500 text-white shadow-md border-b-2 border-black/20';
        if (b.source?.toUpperCase() === 'AIRBNB') return 'bg-[#FF5A5F] text-white shadow-md border-b-2 border-black/20';
        if (b.source?.toUpperCase()?.includes('BOOKING')) return 'bg-[#003580] text-white shadow-md border-b-2 border-black/20';
        return 'bg-alpaca-green text-white shadow-md border-b-2 border-black/20';
    };

    const getIcon = (b: any) => {
        if (b.status === 'CANCELLED') return iconMap.CANCELLED;
        if (b.isPrivate) return iconMap.PRIVATE;
        if (b.status === 'BLOCKED') return iconMap.BLOCKED;
        if (b.source?.toUpperCase() === 'AIRBNB') return iconMap.AIRBNB;
        if (b.source?.toUpperCase()?.includes('BOOKING')) return iconMap.BOOKING;
        return iconMap.DIRECT;
    };

    return (
        <div className="flex flex-col rounded-2xl border border-neutral-200 dark:border-white/5 bg-white shadow-2xl overflow-hidden h-[85vh]">
            
            {/* Scrollable Container */}
            <div
                ref={scrollContainerRef}
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeaveOrUp}
                onMouseUp={handleMouseLeaveOrUp}
                onMouseMove={handleMouseMove}
                className={`flex-1 overflow-x-auto overflow-y-auto relative select-none cursor-grab active:cursor-grabbing ${isDragging ? 'grabbing' : ''}`}
            >
                {/* Global Header Layout Container */}
                <div className="flex bg-neutral-100/95 sticky top-0 z-50 backdrop-blur-md border-b-2 border-neutral-300 shadow-[0_4px_10px_-5px_rgba(0,0,0,0.1)] min-w-max">
                    
                    {/* Top Left Fixed Header */}
                    <div className="w-[300px] shrink-0 sticky left-0 z-50 bg-inherit border-r border-neutral-300 p-6 flex flex-col justify-end">
                        <span className="text-[12px] font-black uppercase text-neutral-400 tracking-[0.3em]">{t('timeline')}</span>
                        <span className="text-[10px] font-bold text-neutral-500">{data.rooms.length} Units</span>
                    </div>

                    {/* Top Right Grid Column (Months & Days) */}
                    <div className="flex-1 flex flex-col min-w-max relative z-20">
                        
                        {/* Months Top Bar */}
                        <div className="grid h-12 border-b border-neutral-200 items-end" style={{ gridTemplateColumns: `repeat(${data.days.length * 2}, 45px)` }}>
                            {months.map((m: any, i: number) => (
                                <div key={i} style={{ gridColumn: `span ${m.count * 2}` }} className="border-r border-neutral-200 pb-2 relative overflow-hidden h-full flex items-end">
                                    <div className="sticky left-0 flex px-6 z-10">
                                        <span className="text-[10px] font-black uppercase text-hotel-gold bg-white/90 backdrop-blur-sm px-4 py-1 rounded-full shadow-sm tracking-[0.2em] whitespace-nowrap border border-hotel-gold/20">{m.name}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        {/* Days Grid */}
                        <div className="grid h-[70px]" style={{ gridTemplateColumns: `repeat(${data.days.length * 2}, 45px)` }}>
                            {data.days.map((day: string) => {
                                const isToday = day === todayStr;
                                return (
                                    <div key={day} className={`col-span-2 border-r border-neutral-200 flex flex-col items-center justify-center relative ${isToday ? 'bg-hotel-gold/10 today-indicator' : ''}`}>
                                        <span className={`text-[10px] uppercase font-bold tracking-widest leading-none ${isToday ? 'text-hotel-gold' : 'text-neutral-500'}`}>
                                            {format(parseISO(day), 'EEE', { locale: dateLocale })}
                                        </span>
                                        <span className={`text-2xl font-black mt-1.5 leading-none ${isToday ? 'text-hotel-gold' : 'text-neutral-800'}`}>
                                            {format(parseISO(day), 'd')}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Rooms Content Scroll Area */}
                <div className="flex flex-col min-w-max pb-32">
                    {data.rooms.map((room: any) => (
                        <div key={room.id} className="flex border-b border-neutral-200 group/room min-h-[96px] bg-white">
                            
                            {/* Left Room Header - Fixed */}
                            <div 
                                className="w-[300px] shrink-0 sticky left-0 z-40 bg-inherit border-r border-neutral-200 flex flex-col justify-center px-6 py-4 transition-colors shadow-[2px_0_15px_-3px_rgba(0,0,0,0.05)] cursor-pointer group-hover/room:bg-neutral-50"
                                onClick={() => setMassUpdateRoom({ id: room.id, number: room.number })}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-hotel-gold shadow-[0_0_10px_rgba(166,138,93,0.3)] shrink-0"></div>
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="text-lg text-neutral-800 font-black tracking-tight leading-tight group-hover/room:text-hotel-gold transition-colors truncate w-full" title={room.internalName || room.name}>
                                            {room.internalName || room.name}
                                        </span>
                                        <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-[0.2em] mt-1 shrink-0">{room.number}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Right Grid Content (Bookings & Dates) */}
                            <div className="flex-1 relative group-hover/room:bg-neutral-50/50 transition-colors">
                                
                                {/* Background Cells Grid (Absolute so it spans full height) */}
                                <div className="absolute inset-0 grid h-full z-0" style={{ gridTemplateColumns: `repeat(${data.days.length * 2}, 45px)` }}>
                                    {data.days.map((day: string) => {
                                        const isToday = day === todayStr;
                                        const price = room.prices?.[day]?.price || room.basePrice || 0;
                                        const isEditing = editingCell?.roomId === room.id && editingCell?.date === day;
                                        
                                        return (
                                            <div 
                                                key={day} 
                                                className={`col-span-2 border-r border-neutral-100 flex flex-col justify-end items-center pb-2 cursor-pointer hover:bg-black/[0.03] transition-colors group/cell ${isToday ? 'bg-hotel-gold/[0.03]' : ''} ${isEditing ? 'bg-hotel-gold/5 z-50' : ''}`}
                                                onDoubleClick={() => {
                                                    if (hasDragged) return;
                                                    setEditingCell({ roomId: room.id, date: day });
                                                    setTempPrice(price.toString());
                                                }}
                                                onClick={() => {
                                                    if (!hasDragged && onCellClick && !isEditing) {
                                                        // Pass checkIn event
                                                        onCellClick({ roomNumber: room.number, roomId: room.id, checkIn: day });
                                                    }
                                                }}
                                            >
                                                {/* Price indicator */}
                                                <div className={`text-[10px] font-bold opacity-30 group-hover/cell:opacity-100 transition-opacity ${isEditing ? 'opacity-100 text-hotel-gold' : ''}`}>
                                                    {isEditing ? (
                                                        <input
                                                            autoFocus
                                                            type="number"
                                                            className="w-16 bg-white border border-hotel-gold text-center font-black text-sm outline-none rounded-sm shadow-sm"
                                                            value={tempPrice}
                                                            onChange={(e) => setTempPrice(e.target.value)}
                                                            onBlur={async () => {
                                                                try {
                                                                    await fetch('/api/dashboard/rates', {
                                                                        method: 'POST',
                                                                        headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify({ roomId: room.id, date: day, price: tempPrice })
                                                                    });
                                                                    const updatedData = { ...data };
                                                                    const roomIndex = updatedData.rooms.findIndex((r: any) => r.id === room.id);
                                                                    if (roomIndex !== -1) {
                                                                        if (!updatedData.rooms[roomIndex].prices) updatedData.rooms[roomIndex].prices = {};
                                                                        updatedData.rooms[roomIndex].prices[day] = { price: parseFloat(tempPrice) };
                                                                        setData(updatedData);
                                                                    }
                                                                } finally {
                                                                    setEditingCell(null);
                                                                }
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') e.currentTarget.blur();
                                                                if (e.key === 'Escape') setEditingCell(null);
                                                            }}
                                                        />
                                                    ) : (
                                                        `${Math.round(price)} zł`
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Interactive Bookings Area - Stacking Grid Rows */}
                                <div 
                                    className="relative grid h-full w-full py-3 px-[2px] gap-y-1.5 z-10 pointer-events-none" 
                                    style={{ 
                                        gridTemplateColumns: `repeat(${data.days.length * 2}, 45px)`,
                                        gridAutoRows: 'max-content'
                                    }}
                                >
                                    {room.bookings.map((b: any) => {
                                        const span = getGridSpan(b.checkIn, b.checkOut, data.days);
                                        if (!span) return null; // Outside viewport
                                        
                                        const rowTrack = (bookingRows[room.id]?.[b.id] ?? 0) + 1;
                                        const colorStr = getBookingColor(b);
                                        const iconStr = getIcon(b);
                                        
                                        const isCancelled = b.status === 'CANCELLED';
                                        const bCheckInDay = typeof b.checkIn === 'string' ? b.checkIn.slice(0, 10) : format(new Date(b.checkIn), 'yyyy-MM-dd');
                                        const bCheckOutDay = typeof b.checkOut === 'string' ? b.checkOut.slice(0, 10) : format(new Date(b.checkOut), 'yyyy-MM-dd');
                                        const nameText = b.status === 'BLOCKED' ? (b.guestName || 'Blocked') : isCancelled ? `${b.guestName} (Cancelled)` : b.guestName;

                                        return (
                                            <div 
                                                key={b.id}
                                                style={{ gridColumn: span, gridRow: rowTrack }}
                                                className={`pointer-events-auto h-[34px] rounded-[4px] flex items-center px-3 cursor-pointer transition-all active:scale-[0.99] hover:brightness-110 overflow-hidden relative z-20 ${colorStr} ${isCancelled ? 'z-10 bg-[length:10px_10px] bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(0,0,0,0.05)_5px,rgba(0,0,0,0.05)_10px)]' : ''}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!hasDragged) setSelectedBooking(b);
                                                }}
                                                title={`${nameText} | ${bCheckInDay} to ${bCheckOutDay} | ${b.totalPrice > 0 ? b.totalPrice + ' zł' : ''}`}
                                            >
                                               <span className="text-[12px] mr-1.5 opacity-90 shrink-0 leading-none">{iconStr}</span>
                                               <span className={`text-[11px] font-black uppercase tracking-wide truncate leading-none mt-0.5 ${isCancelled ? 'line-through opacity-70' : ''}`}>
                                                   {nameText}
                                               </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {selectedBooking && (
                <BookingModal booking={selectedBooking} onClose={() => setSelectedBooking(null)} />
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
                            .then(d => { setData(d); setLoading(false); });
                    }}
                />
            )}
        </div>
    );
}
