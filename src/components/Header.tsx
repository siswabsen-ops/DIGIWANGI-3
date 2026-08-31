import { Database, Flame, Wifi, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { User } from '../types';

import digiwangiLogo from '../assets/images/logo_digiwangi3_official.png';
import { DIGIWANGI_LOGO_BASE64 } from '../assets/logoBase64';

interface HeaderProps {
  currentUser: User | null;
  onLogout: () => void;
  isGoogleConnected: boolean;
  isWhatsAppConnected: boolean;
  onSyncNow?: () => void;
  isSyncing?: boolean;
}

export default function Header({
  currentUser,
  onLogout,
  isGoogleConnected,
  isWhatsAppConnected,
  onSyncNow,
  isSyncing = false
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-gradient-to-r from-blue-950 via-[#111e40] to-[#0c152b] text-white shadow-xl border-b border-indigo-950/80">
      {/* Blue & White Fine Motif Accent */}
      <div className="h-1 w-full bg-white opacity-20" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Logo & School Title */}
        <div className="flex items-center gap-3.5 select-none self-start md:self-auto">
          {/* Logo DIGIWANGI 3 (Official Emblem) */}
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center p-1 shadow-md border border-blue-200 shrink-0 overflow-hidden transform hover:scale-105 transition-all duration-300 cursor-pointer" title="Logo Resmi DIGIWANGI 3">
            <img 
              src={digiwangiLogo || DIGIWANGI_LOGO_BASE64 || '/logo.png'} 
              alt="Logo DIGIWANGI 3" 
              referrerPolicy="no-referrer"
              loading="eager"
              decoding="sync"
              onError={(e) => { 
                const target = e.currentTarget as HTMLImageElement;
                target.src = DIGIWANGI_LOGO_BASE64;
              }}
              className="w-full h-full object-contain"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black tracking-widest text-blue-100 uppercase bg-blue-900/60 border border-blue-500/30 px-2 py-0.5 rounded-full">
                SDN 3 Karamatwangi
              </span>
              <span className="text-[10px] bg-blue-950/60 text-blue-150 border border-blue-500/20 px-1.5 py-0.5 rounded font-mono font-bold tracking-wider">
                V2.1.0-WEB
              </span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tighter leading-none mt-1 flex items-center gap-2">
              <span className="flex items-center gap-[0.5px]">
                {Array.from("DIGIWANGI 3").map((char, index) => (
                  <motion.span
                    key={index}
                    className="inline-block hover:text-amber-300 transition-colors cursor-pointer select-none"
                    animate={{
                      y: [0, -3.5, 0],
                      scale: [1, 1.05, 1],
                      textShadow: [
                        "0 0 0px rgba(255,255,255,0)",
                        "0 0 8px rgba(147,197,253,0.6)",
                        "0 0 0px rgba(255,255,255,0)",
                      ]
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 3.2,
                      ease: "easeInOut",
                      delay: index * 0.12,
                    }}
                    whileHover={{ scale: 1.3, y: -6, color: "#fbbf24" }}
                  >
                    {char === ' ' ? '\u00A0' : char}
                  </motion.span>
                ))}
              </span>
              <span className="text-blue-300 font-extralight text-lg">|</span>
              <span className="text-xs font-semibold text-blue-100 tracking-wide self-end mb-0.5">
                Presensi & Notifikasi Terpadu
              </span>
            </h1>
            <p className="text-[9px] text-blue-150 font-medium tracking-widest uppercase opacity-80 mt-0.5">
              Kec. Cisurupan, Kabupaten Garut, Jawa Barat
            </p>
          </div>
        </div>

        {/* Dynamic Integration Badges & Sync Action */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 shrink-0">
          {/* Cloud Database Badge */}
          <div
            id="badge-cloud-db-status"
            title="Real-time Cloud Firestore Database Aktif & Terhubung"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border bg-blue-900/50 text-blue-100 border-blue-500/30 transition-all shadow-xs"
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline opacity-80">Cloud DB:</span>
            <span className="text-[11px] font-semibold text-emerald-300">Live</span>
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          {/* Integrasi Google Badge */}
          <div
            id="badge-google-sync-status"
            title="Google Sheets & Google Drive Cloud Sync Status"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
              isGoogleConnected
                ? 'bg-blue-800/40 text-blue-100 border-blue-500/30'
                : 'bg-blue-950/50 text-blue-200 border-blue-500/20'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-green-300" />
            <span className="hidden sm:inline opacity-80">Google:</span>
            <span>{isGoogleConnected ? 'Tersinkron' : 'Lokal/Siap'}</span>
            <div className={`w-2 h-2 rounded-full ${isGoogleConnected ? 'bg-green-400 animate-pulse' : 'bg-amber-400'}`} />
          </div>

          {/* Integrasi WA Gateway Badge */}
          <div
            id="badge-wa-gateway-status"
            title="WhatsApp Notification Gateway API Connection"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
              isWhatsAppConnected
                ? 'bg-blue-800/40 text-blue-100 border-blue-500/30'
                : 'bg-blue-950/50 text-blue-200 border-blue-500/20'
            }`}
          >
            <Wifi className="w-3.5 h-3.5 text-sky-300" />
            <span className="hidden sm:inline opacity-80 font-bold">WA Gateway:</span>
            <span className="text-[10px] font-mono tracking-widest text-emerald-400">
              {isWhatsAppConnected ? 'ONLINE' : 'AKTIF'}
            </span>
          </div>

          {/* Sync Button */}
          {onSyncNow && (
            <button
              id="btn-header-sync-now"
              onClick={onSyncNow}
              disabled={isSyncing}
              className="flex items-center gap-1.5 bg-blue-800/60 hover:bg-blue-900/80 disabled:bg-blue-950/30 text-white border border-blue-600/50 py-1.5 px-3 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-200' : ''}`} />
              <span>{isSyncing ? 'Menyinkron...' : 'Sync Data'}</span>
            </button>
          )}

          {/* User Profile Display */}
          {currentUser && (
            <div className="flex items-center gap-3 bg-blue-850/50 border border-blue-650 px-3.5 py-1.5 rounded-2xl ml-2 shadow-inner">
              <div className="text-right">
                <p className="text-xs font-black text-white tracking-tight leading-none">
                  {currentUser.namaLengkap}
                </p>
                <span className="text-[8px] font-black tracking-widest text-[#1e3a8a] bg-white px-1.5 py-0.5 rounded font-sans inline-block mt-1 uppercase">
                  {currentUser.role === 'admin'
                    ? 'ADMIN'
                    : currentUser.role === 'kepsek'
                    ? 'KEPALA SEKOLAH'
                    : currentUser.role === 'guru'
                    ? `WALI KELAS [${currentUser.kelasSpesifik || 'KELAS'}]`
                    : 'PETUGAS PIKET'}
                </span>
              </div>
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-800 font-black border-2 border-blue-500 select-none text-sm shadow-md shrink-0">
                {currentUser.namaLengkap.substring(0, 2).toUpperCase()}
              </div>
              <button
                onClick={onLogout}
                type="button"
                id="btn-action-logout"
                className="text-[10px] font-black text-blue-200 hover:text-white px-2.5 py-1 rounded bg-blue-800 hover:bg-blue-900 transition-colors uppercase tracking-wider cursor-pointer font-sans"
                title="Keluar dari sistem"
              >
                Keluar
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
