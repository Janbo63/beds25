'use client';

import React, { useEffect, useState } from 'react';
import { format, parseISO, addDays } from 'date-fns';

export default function RatesGrid() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [editingCell, setEditingCell] = useState<{ roomId: string, date: string } | null>(null);
    const [tempPrice, setTempPrice] = useState<string>('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch('/api/dashboard/rates')
            .then(res => res.json())
            .then(d => {
                setData(d);
                setLoading(false);
            });
    }, []);

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
                // Update local state
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

    if (loading || !data) return <div className="p-8 text-neutral-500">Loading...</div>;

    return (
        <div className="overflow-x-auto overflow-y-visible min-h-[400px]">
            <table className="w-full border-collapse">
                <thead>
                    <tr className="bg-neutral-800/50">
                        <th className="p-4 text-left border-r border-neutral-800 sticky left-0 bg-neutral-900 z-10 w-48">Accommodation</th>
                        {data.days.map((day: string) => (
                            <th key={day} className="p-4 border-r border-neutral-800 text-center min-w-[100px]">
                                <div className="text-xs uppercase text-neutral-500">{format(parseISO(day), 'EEE')}</div>
                                <div className="text-sm font-bold">{format(parseISO(day), 'd MMM')}</div>
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
                            <tr className="bg-neutral-800/20">
                                <td colSpan={data.days.length + 1} className="py-1 px-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500 bg-neutral-950/50 sticky left-0 z-20">
                                    {propName}
                                </td>
                            </tr>
                            {rooms.map((rt: any) => (
                                <tr key={rt.id} className="border-t border-neutral-800 hover:bg-neutral-800/30 transition-colors">
                                    <td className="p-4 border-r border-neutral-800 sticky left-0 bg-neutral-900 z-10 font-medium">
                                        <div className="text-sm">{rt.name}</div>
                                        <div className="text-xs text-neutral-500">Base: {rt.basePrice} zł</div>
                                    </td>
                                    {data.days.map((day: string) => {
                                        const priceData = rt.prices[day];
                                        const price = priceData ? priceData.price : rt.basePrice;
                                        const isEditing = editingCell?.roomId === rt.id && editingCell?.date === day;

                                        return (
                                            <td
                                                key={day}
                                                className={`p-4 border-r border-neutral-800 text-center cursor-pointer hover:bg-blue-600/10 transition-colors ${priceData ? 'bg-blue-600/5' : ''}`}
                                                onClick={() => !isEditing && handleEdit(rt.id, day, price)}
                                            >
                                                {isEditing ? (
                                                    <div className="flex flex-col gap-1 items-center" onClick={e => e.stopPropagation()}>
                                                        <input
                                                            autoFocus
                                                            type="number"
                                                            className="w-20 bg-neutral-800 border border-blue-500 rounded px-2 py-1 text-sm text-center focus:outline-none"
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
                                                                className="text-[10px] bg-blue-600 px-2 py-0.5 rounded hover:bg-blue-500"
                                                                disabled={saving}
                                                            >
                                                                {saving ? '...' : 'Save'}
                                                            </button>
                                                            <button
                                                                onClick={() => setEditingCell(null)}
                                                                className="text-[10px] bg-neutral-700 px-2 py-0.5 rounded hover:bg-neutral-600"
                                                            >
                                                                X
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col">
                                                        <span className="text-lg font-semibold">{price} zł</span>
                                                        {priceData && <span className="text-[10px] text-blue-500 font-bold uppercase">Manual</span>}
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
    );
}
