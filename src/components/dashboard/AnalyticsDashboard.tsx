'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    TrendingUp,
    TrendingDown,
    Calendar as CalendarIcon,
    DollarSign,
    Moon,
    Users,
    BarChart3,
    Percent,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
} from 'lucide-react';

interface KPI {
    label: string;
    value: number;
    previousValue: number;
    delta: number;
    format: 'currency' | 'number' | 'decimal' | 'percent';
}

interface BreakdownItem {
    label: string;
    bookings: number;
    nights: number;
    revenue: number;
    percentage: number;
}

interface TrendItem {
    month: string;
    revenue: number;
    bookings: number;
    nights: number;
}

interface AnalyticsData {
    period: {
        start: string;
        end: string;
        days: number;
        previousStart: string;
        previousEnd: string;
    };
    kpis: KPI[];
    breakdown: BreakdownItem[];
    channelBreakdown: BreakdownItem[];
    roomBreakdown: BreakdownItem[];
    monthlyTrend: TrendItem[];
    totalRooms: number;
}

const PERIOD_PRESETS = [
    { label: 'This Month', value: 'this_month' },
    { label: 'Last Month', value: 'last_month' },
    { label: 'This Quarter', value: 'this_quarter' },
    { label: 'Year to Date', value: 'ytd' },
    { label: 'Last 12 Months', value: 'last_12' },
    { label: 'Custom', value: 'custom' },
];

function getPresetDates(preset: string) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    switch (preset) {
        case 'this_month':
            return {
                startDate: new Date(y, m, 1).toISOString().split('T')[0],
                endDate: new Date(y, m + 1, 0).toISOString().split('T')[0],
            };
        case 'last_month':
            return {
                startDate: new Date(y, m - 1, 1).toISOString().split('T')[0],
                endDate: new Date(y, m, 0).toISOString().split('T')[0],
            };
        case 'this_quarter': {
            const qStart = Math.floor(m / 3) * 3;
            return {
                startDate: new Date(y, qStart, 1).toISOString().split('T')[0],
                endDate: new Date(y, qStart + 3, 0).toISOString().split('T')[0],
            };
        }
        case 'ytd':
            return {
                startDate: new Date(y, 0, 1).toISOString().split('T')[0],
                endDate: now.toISOString().split('T')[0],
            };
        case 'last_12': {
            const past = new Date(y, m - 11, 1);
            return {
                startDate: past.toISOString().split('T')[0],
                endDate: now.toISOString().split('T')[0],
            };
        }
        default:
            return {
                startDate: new Date(y, m, 1).toISOString().split('T')[0],
                endDate: new Date(y, m + 1, 0).toISOString().split('T')[0],
            };
    }
}

const KPI_ICONS = [DollarSign, Users, Moon, DollarSign, CalendarIcon, Percent];
const KPI_COLORS = [
    'text-hotel-gold',
    'text-sky-400',
    'text-violet-400',
    'text-emerald-400',
    'text-amber-400',
    'text-rose-400',
];

function formatKPIValue(value: number, fmt: string) {
    switch (fmt) {
        case 'currency':
            return `${value.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} zł`;
        case 'number':
            return value.toLocaleString('pl-PL');
        case 'decimal':
            return value.toFixed(1);
        case 'percent':
            return `${value.toFixed(1)}%`;
        default:
            return value.toString();
    }
}

// Channel color mapping
function getChannelColor(channel: string) {
    const c = channel.toUpperCase();
    if (c.includes('AIRBNB')) return { bg: 'bg-rose-500', text: 'text-rose-400', bar: 'bg-rose-500' };
    if (c.includes('BOOKING')) return { bg: 'bg-blue-500', text: 'text-blue-400', bar: 'bg-blue-500' };
    if (c.includes('DIRECT') || c.includes('WEBSITE')) return { bg: 'bg-emerald-500', text: 'text-emerald-400', bar: 'bg-emerald-500' };
    if (c.includes('BEDS24')) return { bg: 'bg-amber-500', text: 'text-amber-400', bar: 'bg-amber-500' };
    return { bg: 'bg-neutral-500', text: 'text-neutral-400', bar: 'bg-neutral-500' };
}

// Room color cycling
const ROOM_COLORS = [
    'bg-hotel-gold',
    'bg-sky-500',
    'bg-violet-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500',
];

export default function AnalyticsDashboard() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [preset, setPreset] = useState('this_month');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [groupBy, setGroupBy] = useState('channel');

    const fetchData = useCallback(async () => {
        setLoading(true);
        const dates = preset === 'custom'
            ? { startDate: customStart, endDate: customEnd }
            : getPresetDates(preset);

        if (!dates.startDate || !dates.endDate) { setLoading(false); return; }

        const params = new URLSearchParams({
            startDate: dates.startDate,
            endDate: dates.endDate,
            groupBy,
        });

        try {
            const res = await fetch(`/api/dashboard/analytics?${params}`);
            const json = await res.json();
            setData(json);
        } catch (e) {
            console.error('Failed to fetch analytics:', e);
        }
        setLoading(false);
    }, [preset, customStart, customEnd, groupBy]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const inputClass = "bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-white/5 rounded-xl p-3 text-sm outline-none focus:border-hotel-gold text-neutral-900 dark:text-white transition-colors";

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Period Selector */}
            <section className="bg-white/80 dark:bg-neutral-900/40 p-5 rounded-2xl border border-neutral-200 dark:border-white/5 backdrop-blur-xl flex flex-wrap gap-6 items-end shadow-sm">
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 flex items-center gap-2">
                        <CalendarIcon size={12} /> Period
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {PERIOD_PRESETS.map(p => (
                            <button
                                key={p.value}
                                onClick={() => setPreset(p.value)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                                    preset === p.value
                                        ? 'bg-hotel-gold text-black border-hotel-gold shadow-lg shadow-hotel-gold/20'
                                        : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-white/5 hover:border-hotel-gold/50'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                {preset === 'custom' && (
                    <>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">From</label>
                            <input type="date" className={inputClass} value={customStart} onChange={e => setCustomStart(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">To</label>
                            <input type="date" className={inputClass} value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                        </div>
                    </>
                )}

                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 flex items-center gap-2">
                        <BarChart3 size={12} /> Group By
                    </label>
                    <select
                        className={inputClass + " min-w-[160px]"}
                        value={groupBy}
                        onChange={e => setGroupBy(e.target.value)}
                    >
                        <option value="channel">Channel</option>
                        <option value="room">Room</option>
                        <option value="private">Booking Type</option>
                    </select>
                </div>
            </section>

            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <div className="text-neutral-500 font-bold animate-pulse text-lg">Analyzing financial data...</div>
                </div>
            ) : !data ? (
                <div className="text-center py-24 text-neutral-500">No data available.</div>
            ) : (
                <>
                    {/* Period context */}
                    <div className="text-xs text-neutral-500 font-medium px-1">
                        Showing <span className="text-hotel-gold font-bold">{data.period.start}</span> → <span className="text-hotel-gold font-bold">{data.period.end}</span>
                        <span className="mx-2 text-neutral-600">|</span>
                        Compared to <span className="text-neutral-400">{data.period.previousStart}</span> → <span className="text-neutral-400">{data.period.previousEnd}</span>
                    </div>

                    {/* KPI Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
                        {data.kpis.map((kpi, i) => {
                            const Icon = KPI_ICONS[i] || TrendingUp;
                            const color = KPI_COLORS[i] || 'text-hotel-gold';
                            const isPositive = kpi.delta > 0;
                            const isNeutral = kpi.delta === 0;

                            return (
                                <div
                                    key={kpi.label}
                                    className="bg-white/80 dark:bg-neutral-900/40 p-6 rounded-3xl border border-neutral-200 dark:border-white/5 backdrop-blur-xl relative overflow-hidden group shadow-sm hover:shadow-lg transition-shadow duration-300"
                                >
                                    <div className="absolute top-0 right-0 p-4 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity">
                                        <Icon size={72} />
                                    </div>
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-2 block">
                                        {kpi.label}
                                    </label>
                                    <div className={`text-3xl font-black ${color} mt-1`}>
                                        {formatKPIValue(kpi.value, kpi.format)}
                                    </div>
                                    <div className={`mt-3 flex items-center gap-1.5 text-xs font-bold ${
                                        isNeutral ? 'text-neutral-400' : isPositive ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
                                    }`}>
                                        {isNeutral ? <Minus size={13} /> : isPositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                                        {isNeutral ? 'No change' : `${isPositive ? '+' : ''}${kpi.delta.toFixed(1)}% vs prev period`}
                                    </div>
                                    <div className="mt-1 text-[10px] text-neutral-500">
                                        Prev: {formatKPIValue(kpi.previousValue, kpi.format)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Charts Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Revenue by Channel */}
                        <div className="bg-white/80 dark:bg-neutral-900/40 p-6 rounded-3xl border border-neutral-200 dark:border-white/5 backdrop-blur-xl shadow-sm">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-5">Revenue by Channel</h3>
                            <div className="space-y-4">
                                {data.channelBreakdown.length === 0 ? (
                                    <p className="text-sm text-neutral-500">No bookings in this period.</p>
                                ) : data.channelBreakdown.map(item => {
                                    const colors = getChannelColor(item.label);
                                    return (
                                        <div key={item.label} className="space-y-1.5">
                                            <div className="flex justify-between items-center">
                                                <span className={`text-xs font-bold ${colors.text}`}>{item.label}</span>
                                                <span className="text-xs font-black text-neutral-700 dark:text-neutral-200">
                                                    {item.revenue.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} zł
                                                    <span className="text-[10px] text-neutral-500 ml-1.5">({item.bookings} bookings)</span>
                                                </span>
                                            </div>
                                            <div className="h-3 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${colors.bar} rounded-full transition-all duration-700 ease-out`}
                                                    style={{ width: `${Math.max(item.percentage, 2)}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Revenue by Room */}
                        <div className="bg-white/80 dark:bg-neutral-900/40 p-6 rounded-3xl border border-neutral-200 dark:border-white/5 backdrop-blur-xl shadow-sm">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-5">Revenue by Room</h3>
                            <div className="space-y-4">
                                {data.roomBreakdown.length === 0 ? (
                                    <p className="text-sm text-neutral-500">No bookings in this period.</p>
                                ) : data.roomBreakdown.map((item, i) => (
                                    <div key={item.label} className="space-y-1.5">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300 truncate max-w-[180px]">{item.label}</span>
                                            <span className="text-xs font-black text-neutral-700 dark:text-neutral-200">
                                                {item.revenue.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} zł
                                                <span className="text-[10px] text-neutral-500 ml-1.5">· {item.nights} nights</span>
                                            </span>
                                        </div>
                                        <div className="h-3 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full ${ROOM_COLORS[i % ROOM_COLORS.length]} rounded-full transition-all duration-700 ease-out`}
                                                style={{ width: `${Math.max(item.percentage, 2)}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Monthly Trend */}
                    <div className="bg-white/80 dark:bg-neutral-900/40 p-6 rounded-3xl border border-neutral-200 dark:border-white/5 backdrop-blur-xl shadow-sm">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-5">Monthly Revenue Trend (Last 12 Months)</h3>
                        <div className="flex items-end gap-2 h-40">
                            {(() => {
                                const maxRevenue = Math.max(...data.monthlyTrend.map(t => t.revenue), 1);
                                return data.monthlyTrend.map((t, i) => (
                                    <div key={t.month} className="flex-1 flex flex-col items-center gap-1 group" title={`${t.month}: ${t.revenue.toLocaleString('pl-PL')} zł (${t.bookings} bookings, ${t.nights} nights)`}>
                                        <div className="text-[9px] font-bold text-hotel-gold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                            {t.revenue.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} zł
                                        </div>
                                        <div className="w-full flex-1 flex items-end">
                                            <div
                                                className={`w-full rounded-t-lg transition-all duration-500 ease-out ${
                                                    t.revenue > 0 ? 'bg-hotel-gold/70 group-hover:bg-hotel-gold' : 'bg-neutral-200 dark:bg-neutral-800'
                                                }`}
                                                style={{ height: `${Math.max((t.revenue / maxRevenue) * 100, 4)}%` }}
                                            />
                                        </div>
                                        <div className="text-[8px] font-bold text-neutral-400 whitespace-nowrap mt-1 rotate-[-45deg] origin-top-left translate-y-1">
                                            {t.month.split(' ')[0]}
                                        </div>
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>

                    {/* Breakdown Table */}
                    <div className="bg-white/60 dark:bg-neutral-900/20 rounded-3xl overflow-hidden border border-neutral-200 dark:border-white/5 shadow-2xl">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-neutral-100/80 dark:bg-neutral-800/50">
                                    <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
                                        {groupBy === 'channel' ? 'Channel' : groupBy === 'room' ? 'Room' : 'Type'}
                                    </th>
                                    <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 text-right">Bookings</th>
                                    <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 text-right">Nights</th>
                                    <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 text-right">Revenue</th>
                                    <th className="p-5 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 text-right">Share</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
                                {data.breakdown.map(item => (
                                    <tr key={item.label} className="hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-all">
                                        <td className="p-5 text-sm font-bold text-neutral-900 dark:text-white">{item.label}</td>
                                        <td className="p-5 text-sm font-bold text-neutral-700 dark:text-neutral-200 text-right">{item.bookings}</td>
                                        <td className="p-5 text-sm font-bold text-neutral-700 dark:text-neutral-200 text-right">{item.nights}</td>
                                        <td className="p-5 text-sm font-black text-hotel-gold text-right">
                                            {item.revenue.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} zł
                                        </td>
                                        <td className="p-5 text-right">
                                            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-hotel-gold/10 text-hotel-gold border border-hotel-gold/20">
                                                {item.percentage.toFixed(1)}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {data.breakdown.length === 0 && (
                                    <tr><td colSpan={5} className="p-16 text-center text-neutral-500">No bookings found for this period.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
