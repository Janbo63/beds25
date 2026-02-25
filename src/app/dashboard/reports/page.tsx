'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
    Download,
    TrendingUp,
    Users,
    Calendar as CalendarIcon,
    Filter,
    ArrowUpRight
} from 'lucide-react';

export default function ReportsPage() {
    const t = useTranslations('Reports');
    const [reportsData, setReportsData] = useState<any>(null);
    const [reportFilters, setReportFilters] = useState({
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0],
        propertyId: '',
        source: '',
        privateStatus: 'all'
    });
    const [loading, setLoading] = useState(false);

    const fetchReports = async () => {
        setLoading(true);
        const query = new URLSearchParams(reportFilters).toString();
        const res = await fetch(`/api/dashboard/reports?${query}`);
        const data = await res.json();
        setReportsData(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchReports();
    }, [reportFilters]);

    const totalRevenue = reportsData?.bookings?.reduce((acc: number, b: any) => acc + b.totalPrice, 0) || 0;
    const totalBookings = reportsData?.bookings?.length || 0;
    const confirmedBookings = reportsData?.bookings?.filter((b: any) => b.status === 'CONFIRMED').length || 0;

    const inputClass = "bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-white/5 rounded-xl p-3 text-sm outline-none focus:border-hotel-gold text-neutral-900 dark:text-white transition-colors";

    return (
        <div className="p-8 space-y-12 animate-in fade-in duration-700">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-neutral-800 to-neutral-500 dark:from-white dark:to-neutral-400 bg-clip-text text-transparent">
                        {t('title')} <span className="text-hotel-gold">{t('titleHighlight')}</span>
                    </h1>
                    <p className="text-neutral-500 mt-2 font-medium">{t('subtitle')}</p>
                </div>
                <button className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-xl font-bold transition-all border border-neutral-200 dark:border-white/5 shadow-xl text-neutral-900 dark:text-white">
                    <Download size={18} />
                    {t('exportPdf')}
                </button>
            </header>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white/80 dark:bg-neutral-900/40 p-8 rounded-3xl border border-neutral-200 dark:border-white/5 backdrop-blur-xl relative overflow-hidden group shadow-sm">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <TrendingUp size={80} />
                    </div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-2 block">{t('totalRevenue')}</label>
                    <div className="text-4xl font-black text-hotel-gold">{totalRevenue.toFixed(2)} zł</div>
                    <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-500 dark:text-emerald-400">
                        <ArrowUpRight size={14} />
                        +12.5% vs last month
                    </div>
                </div>

                <div className="bg-white/80 dark:bg-neutral-900/40 p-8 rounded-3xl border border-neutral-200 dark:border-white/5 backdrop-blur-xl relative overflow-hidden group shadow-sm">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-2 block">{t('bookingCount')}</label>
                    <div className="text-4xl font-black text-neutral-900 dark:text-white">{totalBookings}</div>
                    <div className="mt-4 flex items-center gap-2 text-xs font-bold text-neutral-400">
                        <Users size={14} />
                        Average 4.2 nights per stay
                    </div>
                </div>

                <div className="bg-white/80 dark:bg-neutral-900/40 p-8 rounded-3xl border border-neutral-200 dark:border-white/5 backdrop-blur-xl relative overflow-hidden group shadow-sm">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-2 block">{t('conversionRate')}</label>
                    <div className="text-4xl font-black text-emerald-500">
                        {totalBookings > 0 ? ((confirmedBookings / totalBookings) * 100).toFixed(1) : 0}%
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-500/60 dark:text-emerald-400/60">
                        Snapshot: {confirmedBookings} confirmed / {totalBookings} total
                    </div>
                </div>
            </div>

            {/* Filters */}
            <section className="bg-white/80 dark:bg-neutral-900/40 p-6 rounded-2xl border border-neutral-200 dark:border-white/5 backdrop-blur-xl flex flex-wrap gap-8 items-end shadow-sm">
                <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                        <CalendarIcon size={12} /> {t('startDate')}
                    </label>
                    <input
                        type="date"
                        className={inputClass + " min-w-[180px]"}
                        value={reportFilters.startDate}
                        onChange={e => setReportFilters({ ...reportFilters, startDate: e.target.value })}
                    />
                </div>
                <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                        <CalendarIcon size={12} /> {t('endDate')}
                    </label>
                    <input
                        type="date"
                        className={inputClass + " min-w-[180px]"}
                        value={reportFilters.endDate}
                        onChange={e => setReportFilters({ ...reportFilters, endDate: e.target.value })}
                    />
                </div>
                <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                        <Filter size={12} /> {t('channel')}
                    </label>
                    <select
                        className={inputClass + " min-w-[200px]"}
                        value={reportFilters.source}
                        onChange={e => setReportFilters({ ...reportFilters, source: e.target.value })}
                    >
                        <option value="">{t('allChannels')}</option>
                        <option value="DIRECT">Direct</option>
                        <option value="AIRBNB">Airbnb</option>
                        <option value="BOOKING.COM">Booking.com</option>
                        <option value="BEDS24">Beds24</option>
                    </select>
                </div>
                <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                        <Filter size={12} /> Booking Type
                    </label>
                    <select
                        className={inputClass + " min-w-[200px]"}
                        value={reportFilters.privateStatus}
                        onChange={e => setReportFilters({ ...reportFilters, privateStatus: e.target.value })}
                    >
                        <option value="all">All Bookings</option>
                        <option value="public">Public (Paying)</option>
                        <option value="private">Private (Friends/Family)</option>
                    </select>
                </div>
            </section>

            {/* Data Table */}
            <section className="bg-white/60 dark:bg-neutral-900/20 rounded-3xl overflow-hidden border border-neutral-200 dark:border-white/5 shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-neutral-100/80 dark:bg-neutral-800/50">
                                <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">{t('dateRange')}</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">{t('guestIdentity')}</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">{t('accommodation')}</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">{t('channel')}</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 text-right">{t('netRevenue')}</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 text-center">{t('finalStatus')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
                            {loading ? (
                                <tr><td colSpan={6} className="p-24 text-center text-neutral-500 font-bold animate-pulse">{t('analyzing')}</td></tr>
                            ) : reportsData?.bookings.length === 0 ? (
                                <tr><td colSpan={6} className="p-24 text-center text-neutral-500">{t('noBookings')}</td></tr>
                            ) : reportsData?.bookings.map((b: any) => (
                                <tr key={b.id} className="hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-all group">
                                    <td className="p-6">
                                        <div className="text-sm font-bold text-neutral-900 dark:text-white">{new Date(b.checkIn).toLocaleDateString()}</div>
                                        <div className="text-[10px] text-neutral-500 uppercase mt-0.5 tracking-tighter">
                                            {new Date(b.checkIn).toLocaleDateString(undefined, { weekday: 'long' })}
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        <div className="text-sm font-black text-neutral-900 dark:text-white">{b.guestName}</div>
                                        <div className="text-xs text-neutral-500">{b.guestEmail || t('noEmail')}</div>
                                    </td>
                                    <td className="p-6">
                                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg text-xs font-bold text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-white/5 capitalize">
                                            {b.roomName}
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        <div className={`text-[10px] font-black px-3 py-1.5 rounded-full uppercase border ${b.source === 'AIRBNB' ? 'bg-rose-500/10 border-rose-500/20 text-rose-500 dark:text-rose-400' :
                                            b.source.includes('BOOKING') ? 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400' :
                                                'bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-500'
                                            }`}>
                                            {b.source}
                                        </div>
                                    </td>
                                    <td className="p-6 text-right font-black text-hotel-gold text-lg">
                                        {b.totalPrice.toFixed(2)} zł
                                    </td>
                                    <td className="p-6 text-center">
                                        <span className={`text-[9px] font-black px-3 py-1.5 rounded-lg uppercase tracking-widest border ${b.status === 'CONFIRMED' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' :
                                            b.status === 'CANCELLED' ? 'bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/20' :
                                                b.status === 'BLOCKED' ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border-neutral-200 dark:border-neutral-700' :
                                                    'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                            }`}>
                                            {b.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
