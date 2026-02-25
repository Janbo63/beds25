'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { Upload, Trash2, Eye, EyeOff, ChevronUp, ChevronDown, Image as ImageIcon } from 'lucide-react';


interface RoomImage {
    id: string;
    url: string;
    type: string;
    altText: string | null;
    sortOrder: number;
    active: boolean;
}

interface RoomImageManagerProps {
    images: RoomImage[];
    roomId: string;
    onImagesChange: () => void;
}

const IMAGE_TYPES = ['HERO', 'GALLERY', 'THUMBNAIL'] as const;

const typeLabels: Record<string, string> = {
    HERO: 'Hero',
    GALLERY: 'Gallery',
    THUMBNAIL: 'Thumbnail',
};

const typeColors: Record<string, string> = {
    HERO: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    GALLERY: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    THUMBNAIL: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

const typeColorsLight: Record<string, string> = {
    HERO: 'bg-amber-100 text-amber-700 border-amber-300',
    GALLERY: 'bg-blue-100 text-blue-700 border-blue-300',
    THUMBNAIL: 'bg-purple-100 text-purple-700 border-purple-300',
};

export default function RoomImageManager({ images, roomId, onImagesChange }: RoomImageManagerProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadType, setUploadType] = useState<string>('GALLERY');
    const [editingAlt, setEditingAlt] = useState<string | null>(null);
    const [altBuffer, setAltBuffer] = useState('');

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('roomId', roomId);
        formData.append('type', uploadType);

        try {
            const res = await fetch('/api/admin/room-images', {
                method: 'POST',
                body: formData,
            });
            if (res.ok) onImagesChange();
        } catch (err) {
            console.error('Upload failed:', err);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await fetch(`/api/admin/room-images?id=${id}`, { method: 'DELETE' });
            onImagesChange();
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    const handleToggleActive = async (id: string, currentActive: boolean) => {
        try {
            await fetch('/api/admin/room-images', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, active: !currentActive }),
            });
            onImagesChange();
        } catch (err) {
            console.error('Toggle failed:', err);
        }
    };

    const handleChangeType = async (id: string, newType: string) => {
        try {
            await fetch('/api/admin/room-images', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, type: newType }),
            });
            onImagesChange();
        } catch (err) {
            console.error('Type change failed:', err);
        }
    };

    const handleMove = async (id: string, direction: 'up' | 'down') => {
        const idx = images.findIndex(img => img.id === id);
        if (idx < 0) return;
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= images.length) return;

        const a = images[idx];
        const b = images[swapIdx];

        try {
            await Promise.all([
                fetch('/api/admin/room-images', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: a.id, sortOrder: b.sortOrder }),
                }),
                fetch('/api/admin/room-images', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: b.id, sortOrder: a.sortOrder }),
                }),
            ]);
            onImagesChange();
        } catch (err) {
            console.error('Reorder failed:', err);
        }
    };

    const handleSaveAlt = async (id: string) => {
        try {
            await fetch('/api/admin/room-images', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, altText: altBuffer }),
            });
            setEditingAlt(null);
            onImagesChange();
        } catch (err) {
            console.error('Alt text save failed:', err);
        }
    };

    // Group images by type for display
    const grouped = IMAGE_TYPES.reduce((acc, type) => {
        acc[type] = images.filter(img => img.type === type);
        return acc;
    }, {} as Record<string, RoomImage[]>);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase text-neutral-500 font-bold tracking-widest flex items-center gap-1.5">
                    <ImageIcon size={12} />
                    Booking Images
                </label>
                <div className="flex items-center gap-2">
                    <select
                        value={uploadType}
                        onChange={(e) => setUploadType(e.target.value)}
                        className="text-xs bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg px-2 py-1.5 text-neutral-700 dark:text-neutral-300"
                    >
                        {IMAGE_TYPES.map(type => (
                            <option key={type} value={type}>{typeLabels[type]}</option>
                        ))}
                    </select>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-1 text-xs font-bold bg-hotel-gold/20 text-hotel-gold hover:bg-hotel-gold/30 border border-hotel-gold/30 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                    >
                        <Upload size={12} />
                        {uploading ? '...' : 'Upload'}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleUpload}
                        className="hidden"
                    />
                </div>
            </div>

            {images.length === 0 && (
                <div className="text-center py-8 text-neutral-400 dark:text-neutral-600 text-sm">
                    No booking images yet. Upload images by type for the alpaca site booking widget.
                </div>
            )}

            {IMAGE_TYPES.map(type => {
                const items = grouped[type];
                if (!items || items.length === 0) return null;

                return (
                    <div key={type} className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${typeColorsLight[type]} dark:${typeColors[type]}`}>
                                {typeLabels[type]}
                            </span>
                            <span className="text-[10px] text-neutral-400">{items.length} image{items.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                            {items.map((img, idx) => (
                                <div
                                    key={img.id}
                                    className={`relative group rounded-xl overflow-hidden border transition-all ${img.active
                                        ? 'border-neutral-200 dark:border-neutral-700'
                                        : 'border-red-300 dark:border-red-800 opacity-50'
                                        }`}
                                >
                                    <Image
                                        src={img.url}
                                        alt={img.altText || ''}
                                        width={200}
                                        height={112}
                                        className="w-full h-28 object-cover"
                                    />

                                    {/* Overlay controls */}
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1.5">
                                        {/* Top row: type picker + delete */}
                                        <div className="flex items-center justify-between">
                                            <select
                                                value={img.type}
                                                onChange={(e) => handleChangeType(img.id, e.target.value)}
                                                className="text-[9px] bg-white/20 text-white border border-white/20 rounded px-1 py-0.5"
                                            >
                                                {IMAGE_TYPES.map(t => (
                                                    <option key={t} value={t} className="text-black">{typeLabels[t]}</option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() => handleDelete(img.id)}
                                                className="p-1 text-red-400 hover:text-red-300 transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>

                                        {/* Bottom row: active toggle + reorder */}
                                        <div className="flex items-center justify-between">
                                            <button
                                                onClick={() => handleToggleActive(img.id, img.active)}
                                                className={`p-1 transition-colors ${img.active ? 'text-green-400' : 'text-red-400'}`}
                                                title={img.active ? 'Deactivate' : 'Activate'}
                                            >
                                                {img.active ? <Eye size={14} /> : <EyeOff size={14} />}
                                            </button>
                                            <div className="flex gap-0.5">
                                                <button
                                                    onClick={() => handleMove(img.id, 'up')}
                                                    disabled={idx === 0}
                                                    className="p-0.5 text-white/60 hover:text-white disabled:text-white/20 transition-colors"
                                                >
                                                    <ChevronUp size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleMove(img.id, 'down')}
                                                    disabled={idx === items.length - 1}
                                                    className="p-0.5 text-white/60 hover:text-white disabled:text-white/20 transition-colors"
                                                >
                                                    <ChevronDown size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Inactive badge */}
                                    {!img.active && (
                                        <div className="absolute top-1 left-1 bg-red-500/90 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">
                                            HIDDEN
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}

            {/* Alt text editor (inline) */}
            {editingAlt && (
                <div className="flex items-center gap-2 mt-2 p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
                    <input
                        type="text"
                        value={altBuffer}
                        onChange={(e) => setAltBuffer(e.target.value)}
                        placeholder="Alt text..."
                        className="flex-1 text-xs bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 text-neutral-900 dark:text-white"
                    />
                    <button
                        onClick={() => handleSaveAlt(editingAlt)}
                        className="text-xs font-bold text-hotel-gold hover:text-hotel-gold/80"
                    >
                        Save
                    </button>
                    <button
                        onClick={() => setEditingAlt(null)}
                        className="text-xs text-neutral-400 hover:text-neutral-300"
                    >
                        ✕
                    </button>
                </div>
            )}
        </div>
    );
}
