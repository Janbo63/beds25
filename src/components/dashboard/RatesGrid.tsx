'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { useTranslations } from 'next-intl';

export default function RatesGrid() {
    const t = useTranslations('Rates');
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [editingCell, setEditingCell] = useState<{ roomId: string, date: string } | null>(null);
    const [tempPrice, setTempPrice] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const fetchRates = useCallback((month: Date) => {
        setLoading(true);
        const start = format(startOfMonth(month), 'yyyy-MM-dd');
        const end = format(endOfMonth(month), 'yyyy-MM-dd');
        fetch(`/api/dashboard/rates?start=${start}&end=${end}`)
            .then(res => res.json())
            .then(d => {
                setData(d);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        fetchRates(currentMonth);
    }, [currentMonth, fetchRates]);

    const goToPreviousMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
    const goToNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
    const goToToday = () => setCurrentMonth(new Date());

    const handleEdit = (roomId: string, date: string, currentPrice: number) => {
        setEditingCell({ roomId, date });
        setTempPrice(currentPrice.toString());
    };

    const handleSave = async () => {
        if (!editingCell) return;
        setSaving(true);

        try {
            const res = await fetch('/api/dashboard/rates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: editingCell.roomId,
                    date: editingCell.date,
                    price: tempPrice
                })
            });

            if (res.ok) {
                const updatedData = { ...data };
                const roomIndex = updatedData.rooms.findIndex((r: any) => r.id === editingCell.roomId);
                if (roomIndex !== -1) {
                    updatedData.rooms[roomIndex].prices[editingCell.date] = {
                        price: parseFloat(tempPrice)
                    };
                    setData(updatedData);
                }
            }
        } catch (error) {
            console.error('Failed to save rate:', error);
        } finally {
            setSaving(false);
            setEditingCell(null);
        }
    };

    const handleBlock = async () => {
        if (!editingCell) return;
        setSaving(true);

        try {
            const res = await fetch(`/api/dashboard/rates?roomId=${editingCell.roomId}&date=${editingCell.date}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                const updatedData = { ...data };
                const roomIndex = updatedData.rooms.findIndex((r: any) => r.id === editingCell.roomId);
                if (roomIndex !== -1) {
                    delete updatedData.rooms[roomIndex].prices[editingCell.date];
                    setData(updatedData);
                }
            }
        } catch (error) {
            console.error('Failed to block date:', error);
        } finally {
            setSaving(false);
            setEditingCell(null);
        }
    };

    return (
        <div>
            {/* Month Navigation */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
                <button
                    onClick={goToPreviousMonth}
                    className="px-4 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-bold transition-colors"
                >
                    ← {format(subMonths(currentMonth, 1), 'MMM')}
                </button>

                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
                        {format(currentMonth, 'MMMM yyyy')}
                    </h3>
                    <button
                        onClick={goToToday}
                        className="px-3 py-1 rounded-lg text-xs font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                    >
                        Today
                    </button>
                </div>

                <button
                    onClick={goToNextMonth}
                    className="px-4 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-bold transition-colors"
                >
                    {format(addMonths(currentMonth, 1), 'MMM')} →
                </button>
            </div>

            {/* Loading state */}
            {loading || !data ? (
                <div className="p-8 text-neutral-500">{t('loading')}</div>
            ) : (
                <div className="overflow-x-auto overflow-y-visible min-h-[400px]">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-neutral-100 dark:bg-neutral-800/50">
                                <th className="p-4 text-left border-r border-neutral-200 dark:border-neutral-800 sticky left-0 bg-neutral-100 dark:bg-neutral-900 z-10 w-48 text-neutral-700 dark:text-neutral-300">
                                    {t('accommodation')}
                                </th>
                                {data.days.map((day: string) => (
                                    <th key={day} className="p-4 border-r border-neutral-200 dark:border-neutral-800 text-center min-w-[100px]">
                                        <div className="text-xs uppercase text-neutral-500">{format(parseISO(day), 'EEE')}</div>
                                        <div className="text-sm font-bold text-neutral-800 dark:text-neutral-200">{format(parseISO(day), 'd MMM')}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(
                                data.rooms.reduce((acc: any, r: any) => {
                                    const pName = r.propertyName || 'Other';
                                    if (!acc[pName]) acc[pName] = [];
                                    acc[pName].push(r);
                                    return acc;
                                }, {})
                            ).map(([propName, rooms]: [string, any]) => (
                                <React.Fragment key={propName}>
                                    <tr className="bg-neutral-50 dark:bg-neutral-800/20">
                                        <td colSpan={data.days.length + 1} className="py-1 px-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500 bg-neutral-100 dark:bg-neutral-950/50 sticky left-0 z-20">
                                            {propName}
                                        </td>
                                    </tr>
                                    {rooms.map((rt: any) => (
                                        <tr key={rt.id} className="border-t border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors">
                                            <td className="p-4 border-r border-neutral-200 dark:border-neutral-800 sticky left-0 bg-white dark:bg-neutral-900 z-10 font-medium">
                                                <div className="text-sm text-neutral-900 dark:text-white">{rt.name}</div>
                                                <div className="text-xs text-neutral-500">{t('base')}: {rt.basePrice} zł</div>
                                            </td>
                                            {data.days.map((day: string) => {
                                                const priceData = rt.prices[day];
                                                const hasPrice = !!priceData;
                                                const price = hasPrice ? priceData.price : null;
                                                const isEditing = editingCell?.roomId === rt.id && editingCell?.date === day;

                                                return (
                                                    <td
                                                        key={day}
                                                        className={`p-4 border-r border-neutral-200 dark:border-neutral-800 text-center cursor-pointer transition-colors ${
                                                            hasPrice 
                                                                ? 'bg-blue-600/5 hover:bg-blue-600/10' 
                                                                : 'bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/30'
                                                        }`}
                                                        onClick={() => !isEditing && handleEdit(rt.id, day, price ?? rt.basePrice)}
                                                    >
                                                        {isEditing ? (
                                                            <div className="flex flex-col gap-1 items-center" onClick={e => e.stopPropagation()}>
                                                                <input
                                                                    autoFocus
                                                                    type="number"
                                                                    className="w-20 bg-white dark:bg-neutral-800 border border-blue-500 rounded px-2 py-1 text-sm text-center focus:outline-none text-neutral-900 dark:text-white"
                                                                    value={tempPrice}
                                                                    onChange={e => setTempPrice(e.target.value)}
                                                                    onKeyDown={e => {
                                                                        if (e.key === 'Enter') handleSave();
                                                                        if (e.key === 'Escape') setEditingCell(null);
                                                                    }}
                                                                />
                                                                <div className="flex gap-1">
                                                                    <button
                                                                        onClick={handleSave}
                                                                        className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-500"
                                                                        disabled={saving}
                                                                    >
                                                                        {saving ? '...' : t('save')}
                                                                    </button>
                                                                    <button
                                                                        onClick={handleBlock}
                                                                        className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded hover:bg-red-500"
                                                                        disabled={saving}
                                                                        title="Remove price and block this date"
                                                                    >
                                                                        🚫
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setEditingCell(null)}
                                                                        className="text-[10px] bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-white px-2 py-0.5 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600"
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col">
                                                                {hasPrice ? (
                                                                    <>
                                                                        <span className="text-lg font-semibold text-neutral-900 dark:text-white">{price} zł</span>
                                                                        <span className="text-[10px] text-blue-500 font-bold uppercase">{t('manual')}</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <span className="text-lg font-semibold text-red-400 dark:text-red-500">—</span>
                                                                        <span className="text-[10px] text-red-400 font-bold uppercase">Blocked</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
