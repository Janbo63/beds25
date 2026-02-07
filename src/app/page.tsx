import Link from 'next/link';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function BookingPage() {
  const rooms = await prisma.room.findMany({
    include: {
      media: true
    }
  });

  return (
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-hotel-gold/30">
      {/* Hero Section */}
      <section className="relative h-[70vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1518398046578-8ccaad622617?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-40 scale-105"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-alpaca-green/60 to-neutral-950"></div>

        <div className="relative z-10 text-center space-y-6 px-4">
          <div className="flex justify-center mb-4">
            <div className="bg-alpaca-green p-4 rounded-full shadow-2xl border-2 border-hotel-gold/50 text-3xl">🦙</div>
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white drop-shadow-xl">
            Zagroda <span className="text-hotel-gold italic">Alpakoterapii</span>
          </h1>
          <p className="text-lg md:text-xl text-neutral-300 font-light max-w-2xl mx-auto backdrop-blur-sm bg-black/20 p-4 rounded-xl">
            Doświadcz magii alpakoterapii w naszym spokojnym gospodarstwie.
          </p>
          <a href="/dashboard" className="inline-block mt-8 bg-hotel-gold hover:bg-yellow-600 text-black px-12 py-4 rounded-full font-bold text-lg shadow-2xl transition-all hover:scale-105">
            Zarządzaj Rezerwacjami
          </a>
        </div>
      </section>

      {/* Booking Widget Placeholder */}
      <section className="max-w-4xl mx-auto -mt-12 relative z-20 px-4">
        <div className="glass p-8 rounded-3xl shadow-2xl flex flex-col md:flex-row gap-6 items-end border-white/10">
          <div className="flex-1 space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Data przyjazdu / wyjazdu</label>
            <input type="text" placeholder="Wybierz termin" className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 focus:ring-2 focus:ring-hotel-gold outline-none transition-all text-white" />
          </div>
          <div className="flex-1 space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Liczba gości</label>
            <select className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 focus:ring-2 focus:ring-hotel-gold outline-none appearance-none transition-all text-white">
              <option>1 Osoba</option>
              <option>2 Osoby</option>
              <option>Więcej</option>
            </select>
          </div>
          <button className="w-full md:w-auto bg-alpaca-green text-white font-bold uppercase tracking-widest py-4 px-10 rounded-xl hover:bg-green-700 transition-all shadow-xl shadow-green-900/20">
            Szukaj noclegu
          </button>
        </div>
      </section>

      {/* Room Showcase */}
      <section className="max-w-6xl mx-auto py-24 px-4 space-y-16">
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-bold">Nasze Pokoje i Apartamenty</h2>
          <div className="w-24 h-1 bg-hotel-gold mx-auto rounded-full"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {rooms.map((room) => (
            <div key={room.id} className="group cursor-pointer">
              <div className="aspect-[16/10] overflow-hidden rounded-3xl bg-neutral-900 border border-neutral-800 shadow-2xl relative">
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent z-10 opacity-60"></div>
                <img
                  src={room.media[0]?.url || 'https://images.unsplash.com/photo-1590059132718-5ec9e32abc32?q=80&w=1974&auto=format&fit=crop'}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  alt={room.name || room.number || ''}
                />
              </div>
              <div className="mt-6 flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold group-hover:text-hotel-gold transition-colors">
                    {room.name} {room.number ? `(${room.number})` : ''}
                  </h3>
                  <p className="text-neutral-500 text-sm mt-1">Cena od {room.basePrice} zł / noc</p>
                </div>
                <span className="bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-3 py-1 rounded-full border border-emerald-500/20 uppercase">Dostępny</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="py-12 border-t border-neutral-900 text-center text-neutral-600 text-sm">
        <Link href="/dashboard" className="hover:text-neutral-400 transition-colors">Admin Dashboard</Link>
      </footer>
    </div>
  );
}
