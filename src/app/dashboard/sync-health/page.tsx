'use client';

import { useState } from 'react';

interface SyncIssue {
    beds25Id: string;
    guest: string;
    dates: string;
    room: string;
    issue: string;
    detail?: string;
}

interface SyncHealthData {
    timestamp: string;
    total: number;
    allSynced: boolean;
    zoho: { checked: number; ok: number; missing: number };
    beds24: { checked: number; ok: number; missing: number };
    issueCount: number;
    issues: SyncIssue[];
}

const ISSUE_LABELS: Record<string, { label: string; color: string }> = {
    missing_zoho_id: { label: 'Missing in Zoho', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    missing_beds24_id: { label: 'Missing in Beds24', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
    zoho_date_mismatch: { label: 'Date Mismatch', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
    zoho_status_mismatch: { label: 'Status Mismatch', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
    zoho_record_not_found: { label: 'Zoho Record Gone', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    zoho_fetch_error: { label: 'Zoho Error', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
};

export default function SyncHealthPage() {
    const [data, setData] = useState<SyncHealthData | null>(null);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<string | null>(null);

    const runHealthCheck = async () => {
        setLoading(true);
        setSyncResult(null);
        try {
            const res = await fetch('/api/admin/sync-health');
            const result = await res.json();
            setData(result);
        } catch (err) {
            console.error('Health check failed:', err);
        }
        setLoading(false);
    };

    const runReSync = async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const res = await fetch('/api/admin/reconcile?forceZohoSync=true', { method: 'POST' });
            const result = await res.json();
            setSyncResult(`Synced ${result.summary.zohoSynced} bookings. Created: ${result.summary.created}, Updated: ${result.summary.updated}, Errors: ${result.summary.errors}`);
            // Re-run health check after sync
            await runHealthCheck();
        } catch (err) {
            setSyncResult('Sync failed — check console');
            console.error('Sync failed:', err);
        }
        setSyncing(false);
    };

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-700">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-neutral-800 to-neutral-500 dark:from-white dark:to-neutral-500 bg-clip-text text-transparent">
                        Sync <span className="text-hotel-gold">Health</span>
                    </h1>
                    <p className="text-neutral-400 dark:text-neutral-500 mt-2 font-medium">
                        Compare bookings across Beds25, Zoho, and Beds24 from today forward.
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={runHealthCheck}
                        disabled={loading}
                        className="px-6 py-2.5 bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-all border border-neutral-200 dark:border-white/5 font-bold text-xs shadow-xl flex items-center gap-2 text-neutral-700 dark:text-neutral-200 disabled:opacity-50"
                    >
                        {loading ? '⏳ Checking...' : '🔍 Run Health Check'}
                    </button>
                    <button
                        onClick={runReSync}
                        disabled={syncing}
                        className="px-6 py-2.5 bg-hotel-gold text-black hover:bg-yellow-500 rounded-xl transition-all font-black text-xs shadow-xl shadow-hotel-gold/20 flex items-center gap-2 disabled:opacity-50"
                    >
                        {syncing ? '⏳ Syncing...' : '🔄 Force Re-Sync All'}
                    </button>
                </div>
            </header>

            {syncResult && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-blue-800 dark:text-blue-300 text-sm font-medium">
                    {syncResult}
                </div>
            )}

            {!data && !loading && (
                <div className="text-center py-20">
                    <p className="text-6xl mb-4">🏥</p>
                    <p className="text-neutral-400 dark:text-neutral-500 text-lg font-medium">Click &quot;Run Health Check&quot; to compare all systems</p>
                </div>
            )}

            {data && (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className={`p-6 rounded-xl border shadow-lg ${
                            data.allSynced
                                ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                                : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                        }`}>
                            <div className="text-4xl mb-2">{data.allSynced ? '✅' : '⚠️'}</div>
                            <div className="text-2xl font-black text-neutral-800 dark:text-white">{data.total} Bookings</div>
                            <div className={`text-sm font-bold ${data.allSynced ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {data.allSynced ? 'All systems in sync' : `${data.issueCount} issue${data.issueCount !== 1 ? 's' : ''} found`}
                            </div>
                        </div>

                        <div className="p-6 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg">
                            <div className="text-4xl mb-2">📋</div>
                            <div className="text-2xl font-black text-neutral-800 dark:text-white">
                                Zoho: {data.zoho.ok}/{data.zoho.checked + data.zoho.missing}
                            </div>
                            <div className="text-sm font-bold text-neutral-500">
                                {data.zoho.missing === 0 ? '✅ All linked' : `❌ ${data.zoho.missing} not linked`}
                            </div>
                        </div>

                        <div className="p-6 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg">
                            <div className="text-4xl mb-2">🏨</div>
                            <div className="text-2xl font-black text-neutral-800 dark:text-white">
                                Beds24: {data.beds24.ok}/{data.beds24.checked + data.beds24.missing}
                            </div>
                            <div className="text-sm font-bold text-neutral-500">
                                {data.beds24.missing === 0 ? '✅ All linked' : `❌ ${data.beds24.missing} not linked`}
                            </div>
                        </div>
                    </div>

                    {/* Issues Table */}
                    {data.issues.length > 0 && (
                        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-2xl">
                            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
                                <h2 className="text-xl font-semibold text-neutral-800 dark:text-white">
                                    Issues ({data.issues.length})
                                </h2>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-500 dark:text-neutral-400 text-xs uppercase">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-bold">Guest</th>
                                            <th className="px-4 py-3 text-left font-bold">Dates</th>
                                            <th className="px-4 py-3 text-left font-bold">Room</th>
                                            <th className="px-4 py-3 text-left font-bold">Issue</th>
                                            <th className="px-4 py-3 text-left font-bold">Detail</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                                        {data.issues.map((issue, i) => {
                                            const issueInfo = ISSUE_LABELS[issue.issue] || { label: issue.issue, color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' };
                                            return (
                                                <tr key={i} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                                                    <td className="px-4 py-3 font-semibold text-neutral-800 dark:text-white">{issue.guest}</td>
                                                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">{issue.dates}</td>
                                                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400 text-xs">{issue.room}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${issueInfo.color}`}>
                                                            {issueInfo.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-neutral-500 dark:text-neutral-500 text-xs">{issue.detail}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    {data.issues.length === 0 && (
                        <div className="text-center py-12 bg-green-50 dark:bg-green-900/10 rounded-xl border border-green-200 dark:border-green-800">
                            <p className="text-6xl mb-4">🎉</p>
                            <p className="text-green-700 dark:text-green-400 text-xl font-black">All Systems Perfectly Synced</p>
                            <p className="text-green-600/70 dark:text-green-500/70 text-sm mt-2">
                                {data.total} bookings checked — Beds25, Zoho, and Beds24 are all aligned.
                            </p>
                        </div>
                    )}

                    <div className="text-xs text-neutral-400 dark:text-neutral-600">
                        Last checked: {new Date(data.timestamp).toLocaleString()}
                    </div>
                </>
            )}
        </div>
    );
}
