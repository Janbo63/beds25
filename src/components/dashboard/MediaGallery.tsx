'use client';

import { useState, useRef, useCallback } from 'react';

interface MediaItem {
    id: string;
    url: string;
    alt: string | null;
    type: string;
    sortOrder: number;
    caption: string | null;
    isHero: boolean;
}

interface MediaGalleryProps {
    media: MediaItem[];
    roomId?: string;
    propertyId?: string;
    onMediaChange: () => void;
}

export default function MediaGallery({ media, roomId, propertyId, onMediaChange }: MediaGalleryProps) {
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editCaption, setEditCaption] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUpload = useCallback(async (files: FileList | File[]) => {
        setUploading(true);
        try {
            for (const file of Array.from(files)) {
                const formData = new FormData();
                formData.append('file', file);
                if (roomId) formData.append('roomId', roomId);
                if (propertyId) formData.append('propertyId', propertyId);

                await fetch('/api/admin/media', {
                    method: 'POST',
                    body: formData,
                });
            }
            onMediaChange();
        } catch (err) {
            console.error('Upload failed:', err);
        } finally {
            setUploading(false);
        }
    }, [roomId, propertyId, onMediaChange]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) {
            handleUpload(e.dataTransfer.files);
        }
    }, [handleUpload]);

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this media item?')) return;
        await fetch(`/api/admin/media?id=${id}`, { method: 'DELETE' });
        onMediaChange();
    };

    const handleToggleHero = async (id: string, currentHero: boolean) => {
        await fetch('/api/admin/media', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, isHero: !currentHero }),
        });
        onMediaChange();
    };

    const handleSaveCaption = async (id: string) => {
        await fetch('/api/admin/media', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, caption: editCaption }),
        });
        setEditingId(null);
        onMediaChange();
    };

    const handleMoveOrder = async (id: string, direction: 'up' | 'down') => {
        const currentIndex = media.findIndex(m => m.id === id);
        const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (swapIndex < 0 || swapIndex >= media.length) return;

        const current = media[currentIndex];
        const swap = media[swapIndex];

        // Swap sort orders
        await Promise.all([
            fetch('/api/admin/media', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: current.id, sortOrder: swap.sortOrder }),
            }),
            fetch('/api/admin/media', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: swap.id, sortOrder: current.sortOrder }),
            }),
        ]);
        onMediaChange();
    };

    const sorted = [...media].sort((a, b) => a.sortOrder - b.sortOrder);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase text-neutral-500 font-bold tracking-widest">
                    📸 Media ({media.length})
                </label>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="text-[10px] uppercase font-bold px-3 py-1 rounded-lg bg-hotel-gold/10 text-hotel-gold hover:bg-hotel-gold/20 transition-colors disabled:opacity-50"
                >
                    {uploading ? '⏳ Uploading...' : '+ Add'}
                </button>
            </div>

            {/* Drop zone */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`relative rounded-xl border-2 border-dashed transition-all duration-200 ${dragOver
                        ? 'border-hotel-gold bg-hotel-gold/5 scale-[1.02]'
                        : 'border-neutral-800 hover:border-neutral-700'
                    } ${sorted.length === 0 ? 'p-8' : 'p-2'}`}
            >
                {sorted.length === 0 ? (
                    <div className="text-center text-neutral-600 text-sm">
                        <p className="text-2xl mb-2">📷</p>
                        <p className="font-medium">Drop photos or videos here</p>
                        <p className="text-xs mt-1">or click + Add above</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-2">
                        {sorted.map((item, index) => (
                            <div
                                key={item.id}
                                className="group relative aspect-square rounded-lg overflow-hidden bg-neutral-950 border border-neutral-800"
                            >
                                {/* Media preview */}
                                {item.type === 'VIDEO' ? (
                                    <video
                                        src={item.url}
                                        className="w-full h-full object-cover"
                                        muted
                                        playsInline
                                        onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                                        onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                                    />
                                ) : (
                                    <img
                                        src={item.url}
                                        alt={item.alt || ''}
                                        className="w-full h-full object-cover"
                                    />
                                )}

                                {/* Hero badge */}
                                {item.isHero && (
                                    <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-hotel-gold text-black text-[8px] font-black rounded uppercase">
                                        Hero
                                    </div>
                                )}

                                {/* Video badge */}
                                {item.type === 'VIDEO' && (
                                    <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-blue-500 text-white text-[8px] font-black rounded uppercase">
                                        ▶ Video
                                    </div>
                                )}

                                {/* Caption overlay */}
                                {item.caption && (
                                    <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/70 text-[9px] text-neutral-300 truncate">
                                        {item.caption}
                                    </div>
                                )}

                                {/* Hover controls */}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                                    {/* Move order */}
                                    {index > 0 && (
                                        <button
                                            onClick={() => handleMoveOrder(item.id, 'up')}
                                            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs"
                                            title="Move left"
                                        >
                                            ◀
                                        </button>
                                    )}

                                    {/* Hero toggle */}
                                    <button
                                        onClick={() => handleToggleHero(item.id, item.isHero)}
                                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${item.isHero ? 'bg-hotel-gold text-black' : 'bg-white/10 hover:bg-hotel-gold/30'
                                            }`}
                                        title={item.isHero ? 'Remove hero' : 'Set as hero'}
                                    >
                                        ⭐
                                    </button>

                                    {/* Caption edit */}
                                    <button
                                        onClick={() => { setEditingId(item.id); setEditCaption(item.caption || ''); }}
                                        className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs"
                                        title="Edit caption"
                                    >
                                        ✏️
                                    </button>

                                    {/* Delete */}
                                    <button
                                        onClick={() => handleDelete(item.id)}
                                        className="w-7 h-7 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-400 flex items-center justify-center text-xs"
                                        title="Delete"
                                    >
                                        🗑
                                    </button>

                                    {index < sorted.length - 1 && (
                                        <button
                                            onClick={() => handleMoveOrder(item.id, 'down')}
                                            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs"
                                            title="Move right"
                                        >
                                            ▶
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Add button tile */}
                        <label className="aspect-square rounded-lg border-2 border-dashed border-neutral-800 hover:border-hotel-gold cursor-pointer flex flex-col items-center justify-center gap-1 transition-colors">
                            <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                multiple
                                accept="image/*,video/*"
                                onChange={(e) => e.target.files?.length && handleUpload(e.target.files)}
                            />
                            <span className="text-neutral-600 text-lg">+</span>
                            <span className="text-neutral-600 text-[9px] font-bold uppercase">Upload</span>
                        </label>
                    </div>
                )}
            </div>

            {/* Caption editing modal */}
            {editingId && (
                <div className="flex gap-2 animate-in fade-in duration-200">
                    <input
                        type="text"
                        value={editCaption}
                        onChange={(e) => setEditCaption(e.target.value)}
                        placeholder="Enter caption..."
                        className="flex-1 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-hotel-gold"
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveCaption(editingId);
                            if (e.key === 'Escape') setEditingId(null);
                        }}
                    />
                    <button
                        onClick={() => handleSaveCaption(editingId)}
                        className="px-3 py-2 bg-hotel-gold text-black text-xs font-bold rounded-lg hover:bg-yellow-500"
                    >
                        Save
                    </button>
                    <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-2 bg-neutral-800 text-neutral-400 text-xs font-bold rounded-lg hover:bg-neutral-700"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {/* Hidden file input (for the + Add button) */}
            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept="image/*,video/*"
                onChange={(e) => {
                    if (e.target.files?.length) handleUpload(e.target.files);
                    e.target.value = '';
                }}
            />
        </div>
    );
}
