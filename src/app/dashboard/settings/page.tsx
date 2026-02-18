'use client';

import { useState, useEffect } from 'react';
import MediaGallery from '@/components/dashboard/MediaGallery';

export default function AdminSettings() {
    const [rooms, setRooms] = useState<any[]>([]);
    const [propertyId, setPropertyId] = useState<string>('');
    const [loading, setLoading] = useState(true);

    // Form states
    const [propertyDetails, setPropertyDetails] = useState({
        bookingComId: '',
        airbnbId: '',
        name: ''
    });
    const [newRoom, setNewRoom] = useState({
        number: '',
        name: '',
        basePrice: '0',
        capacity: '2',
        maxAdults: '2',
        maxChildren: '0',
        minNights: '1',
        airbnbUrl: '',
        bookingUrl: ''
    });
    const [beds24InviteCode, setBeds24InviteCode] = useState('');
    const [importing, setImporting] = useState(false);
    const [importStatus, setImportStatus] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    const [uploading, setUploading] = useState(false);
    const [activeTab, setActiveTab] = useState<'general' | 'units' | 'migration' | 'zoho'>('general');
    const [syncing, setSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        fetch('/api/admin/rooms')
            .then(res => res.json())
            .then(data => {
                setRooms(data);
                if (data.length > 0 && !propertyId) {
                    const firstRoom = data[0];
                    setPropertyId(firstRoom.propertyId);
                    // Property details will be fetched separately or from the first room
                }
                setLoading(false);
            });
    }, []);


    const handleAddRoom = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('/api/admin/rooms', {
            method: 'POST',
            body: JSON.stringify(newRoom),
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            window.location.reload();
        }
    };

    const handleBeds24Import = async (e: React.FormEvent) => {
        e.preventDefault();
        setImporting(true);
        setImportStatus(null);
        try {
            const res = await fetch('/api/admin/beds24/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inviteCode: beds24InviteCode })
            });
            const data = await res.json();
            if (res.ok) {
                setImportStatus({ message: 'Data imported successfully! Refreshing...', type: 'success' });
                setTimeout(() => window.location.reload(), 2000);
            } else {
                setImportStatus({ message: data.error || 'Import failed', type: 'error' });
            }
        } catch (err) {
            setImportStatus({ message: 'An unexpected error occurred', type: 'error' });
        } finally {
            setImporting(false);
        }
    };

    const handleUpdateProperty = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('/api/admin/property', {
            method: 'PATCH',
            body: JSON.stringify({
                id: propertyId,
                bookingComId: propertyDetails.bookingComId,
                airbnbId: propertyDetails.airbnbId
            }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            setImportStatus({ message: 'Property updated successfully!', type: 'success' });
        }
    };

    const handleDeleteRoom = async (id: string) => {
        if (!confirm('Are you sure you want to delete this room/unit?')) return;
        try {
            const res = await fetch(`/api/admin/rooms?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                // Refresh data
                fetch('/api/admin/rooms')
                    .then(res => res.json())
                    .then(data => setRooms(data));
            }
        } catch (err) {
            console.error('Delete failed', err);
        }
    };

    const handleUpdateMarkup = async (roomId: string, channel: string, multiplier: number) => {
        await fetch('/api/admin/channel-settings', {
            method: 'POST',
            body: JSON.stringify({ roomId, channel, multiplier }),
            headers: { 'Content-Type': 'application/json' }
        });
        // Refresh local data
        fetch('/api/admin/rooms')
            .then(res => res.json())
            .then(data => setRooms(data));
    };

    const handleUpdateRoom = async (roomId: string, updates: any) => {
        const res = await fetch('/api/admin/rooms', {
            method: 'PATCH',
            body: JSON.stringify({ id: roomId, ...updates }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            // Refresh local data
            fetch('/api/admin/rooms')
                .then(res => res.json())
                .then(data => setRooms(data));
        }
    };

    const handleZohoSync = async (entity: 'all' | 'bookings' | 'rooms') => {
        setSyncing(true);
        setSyncStatus(null);
        try {
            const res = await fetch(`/api/admin/zoho-sync?entity=${entity}`, {
                method: 'POST'
            });
            const data = await res.json();
            if (res.ok) {
                setSyncStatus({
                    message: `Synced: ${JSON.stringify(data.synced)}`,
                    type: 'success'
                });
                // Refresh local data
                if (entity === 'all' || entity === 'rooms') {
                    fetch('/api/admin/rooms')
                        .then(res => res.json())
                        .then(data => setRooms(data));
                }
            } else {
                setSyncStatus({ message: data.error || 'Sync failed', type: 'error' });
            }
        } catch (err) {
            setSyncStatus({ message: 'An unexpected error occurred', type: 'error' });
        } finally {
            setSyncing(false);
        }
    };

    const handleUploadMedia = async (file: File, roomId?: string) => {
        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        if (roomId) formData.append('roomId', roomId);
        else if (propertyId) formData.append('propertyId', propertyId);

        try {
            const res = await fetch('/api/admin/media', {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                // Refresh data
                fetch('/api/admin/rooms')
                    .then(res => res.json())
                    .then(data => setRooms(data));
            }
        } catch (err) {
            console.error('Upload failed', err);
        } finally {
            setUploading(false);
        }
    };


    if (loading) return <div className="p-8 text-neutral-400">Loading...</div>;

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-700">
            <header className="flex flex-col sm:flex-row justify-between items-center gap-6">
                <div>
                    <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-white to-neutral-500 bg-clip-text text-transparent">
                        Global <span className="text-hotel-gold">Settings</span>
                    </h1>
                    <p className="text-neutral-500 mt-2 font-medium">Configure property parameters and channel synchronization.</p>
                </div>
            </header>

            {/* Tab Navigation */}
            <div className="flex flex-wrap gap-2 p-1 bg-neutral-900/50 border border-neutral-800 rounded-xl mb-12 backdrop-blur-md">
                {[
                    { id: 'general', label: 'General', icon: '🏨' },
                    { id: 'units', label: 'Rooms & Sync', icon: '📡' },
                    { id: 'zoho', label: 'Zoho CRM', icon: '🔄' },
                    { id: 'migration', label: 'Migration', icon: '⚡' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-bold transition-all ${activeTab === tab.id
                            ? 'bg-hotel-gold text-black shadow-lg shadow-hotel-gold/20 scale-105'
                            : 'text-neutral-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <span>{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="space-y-12">
                {activeTab === 'general' && (
                    <section className="glass p-8 rounded-3xl border-white/5 bg-white/5 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                            <span className="w-2 h-6 bg-hotel-gold rounded-full"></span>
                            External Global IDs
                        </h2>
                        <form onSubmit={handleUpdateProperty} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-2 font-bold">Booking.com Property ID (Bhid)</label>
                                <input
                                    type="text"
                                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-3 outline-none focus:border-blue-500 transition-colors"
                                    value={propertyDetails.bookingComId}
                                    onChange={e => setPropertyDetails({ ...propertyDetails, bookingComId: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs uppercase tracking-widest text-neutral-500 mb-2 font-bold">Airbnb Property ID</label>
                                <input
                                    type="text"
                                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-3 outline-none focus:border-rose-500 transition-colors"
                                    value={propertyDetails.airbnbId}
                                    onChange={e => setPropertyDetails({ ...propertyDetails, airbnbId: e.target.value })}
                                />
                            </div>
                            <div className="flex items-end">
                                <button className="w-full bg-hotel-gold text-black p-3 rounded-lg font-bold hover:bg-yellow-500 transition-all">
                                    Update Global Settings
                                </button>
                            </div>
                        </form>
                    </section>
                )}


                {activeTab === 'units' && (
                    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <section className="glass p-8 rounded-3xl bg-blue-500/5 border-blue-500/10 shadow-2xl">
                            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                                <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                                Register New Room
                            </h2>
                            <form onSubmit={handleAddRoom} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <input
                                        type="text"
                                        placeholder="Room Number (e.g. 101)"
                                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 outline-none focus:border-hotel-gold transition-colors"
                                        value={newRoom.number}
                                        onChange={e => setNewRoom({ ...newRoom, number: e.target.value })}
                                        required
                                    />
                                    <input
                                        type="text"
                                        placeholder="Internal Name (e.g. Deluxe Suite)"
                                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 outline-none focus:border-hotel-gold transition-colors"
                                        value={newRoom.name}
                                        onChange={e => setNewRoom({ ...newRoom, name: e.target.value })}
                                        required
                                    />
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] uppercase text-neutral-500 font-bold ml-1">Base Price (zł)</label>
                                            <input
                                                type="number"
                                                placeholder="e.g. 450"
                                                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 outline-none focus:border-hotel-gold transition-colors"
                                                value={newRoom.basePrice}
                                                onChange={e => setNewRoom({ ...newRoom, basePrice: e.target.value })}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] uppercase text-neutral-500 font-bold ml-1">Total Capacity</label>
                                            <input
                                                type="number"
                                                placeholder="e.g. 4"
                                                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 outline-none focus:border-hotel-gold transition-colors"
                                                value={newRoom.capacity}
                                                onChange={e => setNewRoom({ ...newRoom, capacity: e.target.value })}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] uppercase text-neutral-500 font-bold ml-1">Max Adults</label>
                                            <input
                                                type="number"
                                                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 outline-none focus:border-hotel-gold transition-colors"
                                                value={newRoom.maxAdults}
                                                onChange={e => setNewRoom({ ...newRoom, maxAdults: e.target.value })}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] uppercase text-neutral-500 font-bold ml-1">Max Children</label>
                                            <input
                                                type="number"
                                                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 outline-none focus:border-hotel-gold transition-colors"
                                                value={newRoom.maxChildren}
                                                onChange={e => setNewRoom({ ...newRoom, maxChildren: e.target.value })}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] uppercase text-neutral-500 font-bold ml-1">Min Nights</label>
                                            <input
                                                type="number"
                                                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 outline-none focus:border-hotel-gold transition-colors"
                                                value={newRoom.minNights}
                                                onChange={e => setNewRoom({ ...newRoom, minNights: e.target.value })}
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <input
                                        type="url"
                                        placeholder="Airbnb iCal URL"
                                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 outline-none focus:border-rose-500/50 transition-colors"
                                        value={newRoom.airbnbUrl}
                                        onChange={e => setNewRoom({ ...newRoom, airbnbUrl: e.target.value })}
                                    />
                                    <input
                                        type="url"
                                        placeholder="Booking.com iCal URL"
                                        className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 outline-none focus:border-blue-500/50 transition-colors"
                                        value={newRoom.bookingUrl}
                                        onChange={e => setNewRoom({ ...newRoom, bookingUrl: e.target.value })}
                                    />
                                    <button className="w-full bg-blue-600 hover:bg-blue-500 p-4 rounded-xl font-bold transition-all shadow-xl shadow-blue-500/20 active:scale-95">
                                        Add Room
                                    </button>
                                </div>
                            </form>
                        </section>

                        <section className="glass p-8 rounded-3xl border-white/5 bg-white/5 shadow-2xl">
                            <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                                <span className="w-2 h-6 bg-hotel-gold rounded-full"></span>
                                Managing Rooms & Media
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {rooms.map((room: any) => (
                                    <div key={room.id} className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4">
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-4 flex-1">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="text-[9px] text-neutral-600 uppercase font-bold">Room #</label>
                                                        <input
                                                            type="text"
                                                            className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-sm font-bold"
                                                            defaultValue={room.number}
                                                            onBlur={(e) => handleUpdateRoom(room.id, { number: e.target.value })}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] text-neutral-600 uppercase font-bold">Base price (zł)</label>
                                                        <input
                                                            type="number"
                                                            className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-sm font-bold text-hotel-gold"
                                                            defaultValue={room.basePrice}
                                                            onBlur={(e) => handleUpdateRoom(room.id, { basePrice: parseFloat(e.target.value) })}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-4 gap-2">
                                                    <div>
                                                        <label className="text-[9px] text-neutral-600 uppercase font-bold">Adults</label>
                                                        <input
                                                            type="number"
                                                            className="w-full bg-neutral-950 border border-neutral-800 rounded p-1.5 text-xs text-neutral-300"
                                                            defaultValue={room.maxAdults}
                                                            onBlur={(e) => handleUpdateRoom(room.id, { maxAdults: parseInt(e.target.value) })}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] text-neutral-600 uppercase font-bold">Children</label>
                                                        <input
                                                            type="number"
                                                            className="w-full bg-neutral-950 border border-neutral-800 rounded p-1.5 text-xs text-neutral-300"
                                                            defaultValue={room.maxChildren}
                                                            onBlur={(e) => handleUpdateRoom(room.id, { maxChildren: parseInt(e.target.value) })}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] text-neutral-600 uppercase font-bold">Total</label>
                                                        <input
                                                            type="number"
                                                            className="w-full bg-neutral-950 border border-neutral-800 rounded p-1.5 text-xs text-neutral-300"
                                                            defaultValue={room.capacity}
                                                            onBlur={(e) => handleUpdateRoom(room.id, { capacity: parseInt(e.target.value) })}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] text-neutral-600 uppercase font-bold">Stay</label>
                                                        <input
                                                            type="number"
                                                            className="w-full bg-neutral-950 border border-neutral-800 rounded p-1.5 text-xs text-neutral-300"
                                                            defaultValue={room.minNights}
                                                            onBlur={(e) => handleUpdateRoom(room.id, { minNights: parseInt(e.target.value) })}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteRoom(room.id)}
                                                className="p-2 text-neutral-500 hover:text-red-500 transition-colors ml-4"
                                            >
                                                🗑️
                                            </button>
                                        </div>

                                        <div className="space-y-3 pt-3 border-t border-white/5">
                                            <MediaGallery
                                                media={room.media || []}
                                                roomId={room.id}
                                                onMediaChange={() => {
                                                    fetch('/api/admin/rooms')
                                                        .then(res => res.json())
                                                        .then(data => setRooms(data));
                                                }}
                                            />
                                        </div>

                                        <div className="space-y-3 pt-3 border-t border-white/5">
                                            <label className="text-[10px] uppercase text-neutral-500 font-bold tracking-widest">Markup Settings</label>
                                            <div className="flex items-center gap-4">
                                                <div className="flex-1">
                                                    <div className="text-[9px] text-neutral-600 mb-1">Booking.com</div>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-xs"
                                                        defaultValue={room.channelSettings?.find((s: any) => s.channel === 'BOOKING.COM')?.multiplier || 1.15}
                                                        onBlur={(e) => handleUpdateMarkup(room.id, 'BOOKING.COM', parseFloat(e.target.value))}
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="text-[9px] text-neutral-600 mb-1">Airbnb</div>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-xs"
                                                        defaultValue={room.channelSettings?.find((s: any) => s.channel === 'AIRBNB')?.multiplier || 1.10}
                                                        onBlur={(e) => handleUpdateMarkup(room.id, 'AIRBNB', parseFloat(e.target.value))}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                )}

                {activeTab === 'zoho' && (
                    <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <section className="glass p-8 rounded-3xl bg-purple-600/10 border-purple-500/20 shadow-2xl shadow-purple-900/10">
                            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                                <span className="w-2 h-6 bg-purple-500 rounded-full"></span>
                                Zoho CRM Synchronization
                            </h2>
                            <p className="text-sm text-neutral-400 mb-8 max-w-2xl leading-relaxed">
                                Your booking system is now integrated with <strong>Zoho CRM</strong>. All bookings and room data are stored in Zoho CRM as the source of truth, with a local cache for performance.
                            </p>

                            <div className="space-y-6">
                                {/* Sync Status */}
                                {syncStatus && (
                                    <div className={`p-4 rounded-xl flex items-center gap-3 animate-in fade-in zoom-in-95 duration-300 ${syncStatus.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                        <div className={`w-2 h-2 rounded-full ${syncStatus.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                        <span className="text-sm font-medium">{syncStatus.message}</span>
                                    </div>
                                )}

                                {/* Sync Buttons */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <button
                                        onClick={() => handleZohoSync('all')}
                                        disabled={syncing}
                                        className={`px-6 py-4 rounded-xl font-bold transition-all shadow-lg ${syncing
                                            ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                                            : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-500/20 active:scale-95'
                                            }`}
                                    >
                                        {syncing ? '⏳ Syncing...' : '🔄 Sync All'}
                                    </button>
                                    <button
                                        onClick={() => handleZohoSync('bookings')}
                                        disabled={syncing}
                                        className={`px-6 py-4 rounded-xl font-bold transition-all shadow-lg ${syncing
                                            ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20 active:scale-95'
                                            }`}
                                    >
                                        {syncing ? '⏳ Syncing...' : '📅 Sync Bookings'}
                                    </button>
                                    <button
                                        onClick={() => handleZohoSync('rooms')}
                                        disabled={syncing}
                                        className={`px-6 py-4 rounded-xl font-bold transition-all shadow-lg ${syncing
                                            ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                                            : 'bg-green-600 hover:bg-green-500 text-white shadow-green-500/20 active:scale-95'
                                            }`}
                                    >
                                        {syncing ? '⏳ Syncing...' : '🏠 Sync Rooms'}
                                    </button>
                                </div>

                                {/* Info Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                                    <div className="p-4 bg-neutral-900/50 border border-neutral-800 rounded-xl">
                                        <h3 className="text-sm font-bold text-purple-400 mb-2">✅ Write Strategy</h3>
                                        <p className="text-xs text-neutral-400">All booking and room changes are written to Zoho CRM first, then synced to your local database.</p>
                                    </div>
                                    <div className="p-4 bg-neutral-900/50 border border-neutral-800 rounded-xl">
                                        <h3 className="text-sm font-bold text-purple-400 mb-2">⚡ Read Strategy</h3>
                                        <p className="text-xs text-neutral-400">The dashboard reads from your local cache for instant performance, while staying in sync with Zoho.</p>
                                    </div>
                                </div>

                                {/* Configuration Note */}
                                <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
                                    <h3 className="text-sm font-bold text-yellow-400 mb-2">🔑 API Configuration</h3>
                                    <p className="text-xs text-neutral-400">
                                        Update your Zoho credentials in the <code className="bg-neutral-900 px-2 py-1 rounded">.env</code> file:
                                    </p>
                                    <ul className="text-[10px] text-neutral-500 mt-2 space-y-1 font-mono">
                                        <li>• ZOHO_CLIENT_ID</li>
                                        <li>• ZOHO_CLIENT_SECRET</li>
                                        <li>• ZOHO_REFRESH_TOKEN</li>
                                    </ul>
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                {activeTab === 'migration' && (
                    <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <section className="glass p-8 rounded-3xl bg-blue-600/10 border-blue-500/20 shadow-2xl shadow-blue-900/10">
                            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                                <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                                Beds24 Data Migration
                            </h2>
                            <p className="text-sm text-neutral-400 mb-8 max-w-2xl leading-relaxed">
                                Enter your Beds24 **Invite Code** to automatically import your properties, room categories, and current listings.
                            </p>
                            <form onSubmit={handleBeds24Import} className="flex flex-col md:flex-row gap-4">
                                <input
                                    type="text"
                                    placeholder="Enter Invite Code"
                                    className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl p-4 outline-none focus:border-blue-500 transition-colors"
                                    value={beds24InviteCode}
                                    onChange={e => setBeds24InviteCode(e.target.value)}
                                    required
                                />
                                <button
                                    type="submit"
                                    disabled={importing}
                                    className={`px-10 py-4 rounded-xl font-bold transition-all shadow-lg ${importing
                                        ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20 active:scale-95'
                                        }`}
                                >
                                    {importing ? 'Importing...' : 'Start Import'}
                                </button>
                            </form>
                            {importStatus && (
                                <div className={`mt-6 p-4 rounded-xl flex items-center gap-3 animate-in fade-in zoom-in-95 duration-300 ${importStatus.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                    <div className={`w-2 h-2 rounded-full ${importStatus.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                    <span className="text-sm font-medium">{importStatus.message}</span>
                                </div>
                            )}
                        </section>
                    </div>
                )}

            </div>
        </div>
    );
}
