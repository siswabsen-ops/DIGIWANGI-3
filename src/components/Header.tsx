import React, { useState } from 'react';
import { Database, Flame, Wifi, RefreshCw, Camera, Info } from 'lucide-react';
import { motion } from 'motion/react';
import { User, SystemSettings } from '../types';
import digiwangiDefaultImg from '../assets/images/logo_digiwangi3_official.png';
import { DIGIWANGI_LOGO_BASE64 } from '../assets/logoBase64';
import { DEFAULT_DIGIWANGI_LOGO } from '../assets/officialLogos';
import LogoChangeModal from './LogoChangeModal';

interface HeaderProps {
  currentUser: User | null;
  onLogout: () => void;
  isGoogleConnected: boolean;
  isWhatsAppConnected: boolean;
  onSyncNow?: () => void;
  isSyncing?: boolean;
  settings?: SystemSettings;
  onSaveSettings?: (newSettings: SystemSettings) => void;
}

export default function Header({
  currentUser,
  onLogout,
  isGoogleConnected,
  isWhatsAppConnected,
  onSyncNow,
  isSyncing = false,
  settings,
  onSaveSettings
}: HeaderProps) {
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const [adminNotice, setAdminNotice] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  // Resolved DIGIWANGI 3 logo source
  const appLogoSrc = settings?.appLogoUrl || digiwangiDefaultImg || DEFAULT_DIGIWANGI_LOGO || DIGIWANGI_LOGO_BASE64;

  const handleLogoClick = () => {
    if (isAdmin) {
      setIsLogoModalOpen(true);
    } else {
      setAdminNotice('Fitur ganti logo aplikasi hanya dapat diakses oleh Akun Administrator.');
      setTimeout(() => setAdminNotice(null), 4000);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-gradient-to-r from-blue-950 via-[#111e40] to-[#0c152b] text-white shadow-xl border-b border-indigo-950/80">
        {/* Blue & White Fine Motif Accent */}
        <div className="h-1 w-full bg-white opacity-20" />

        {/* Floating non-admin restriction notification */}
        {adminNotice && (
          <div className="bg-amber-500 text-slate-950 text-xs font-bold py-1.5 px-4 text-center flex items-center justify-center gap-2 animate-in fade-in duration-200">
            <Info className="w-4 h-4 shrink-0" />
            <span>{adminNotice}</span>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* LEFT: Logo DIGIWANGI 3 & School Title */}
          <div className="flex items-center gap-3.5 select-none self-start md:self-auto">
            
            {/* Logo DIGIWANGI 3 (Official Emblem with Admin Customization) */}
            <div className="relative group">
              <div 
                id="btn-header-digiwangi-logo"
                onClick={handleLogoClick}
                className="w-13 h-13 bg-white rounded-2xl flex items-center justify-center p-1.5 shadow-md border-2 border-blue-200 shrink-0 overflow-hidden transform hover:scale-105 transition-all duration-300 cursor-pointer relative"
                title={isAdmin ? 'Klik untuk mengganti Logo DIGIWANGI 3 (Khusus Admin)' : 'Logo Resmi DIGIWANGI 3'}
              >
                <img 
                  src={appLogoSrc} 
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

                {/* Admin Hover Overlay Badge */}
                {isAdmin && (
                  <div className="absolute inset-0 bg-blue-900/70 backdrop-blur-2xs opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
                    <Camera className="w-4 h-4 text-amber-300" />
                    <span className="text-[8px] font-black uppercase tracking-tight mt-0.5">Ganti</span>
                  </div>
                )}
              </div>

              {/* Small Admin Quick Button below/beside logo */}
              {isAdmin && (
                <button
                  type="button"
                  id="btn-admin-ganti-logo-digiwangi"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLogoClick();
                  }}
                  className="absolute -bottom-1.5 -right-1 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-full p-1 shadow-md border border-white text-[9px] font-black cursor-pointer transition-transform hover:scale-110 flex items-center justify-center"
                  title="Ganti Logo DIGIWANGI 3"
                >
                  <Camera className="w-3 h-3" />
                </button>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black tracking-widest text-blue-100 uppercase bg-blue-900/60 border border-blue-500/30 px-2 py-0.5 rounded-full">
                  SDN 3 Karamatwangi
                </span>
                <span className="text-[10px] bg-blue-950/60 text-blue-150 border border-blue-500/20 px-1.5 py-0.5 rounded font-mono font-bold tracking-wider">
                  V2.1.0-WEB
                </span>
                {isAdmin && (
                  <span className="text-[9px] bg-amber-400/20 border border-amber-400/40 text-amber-300 font-bold px-1.5 py-0.2 rounded font-sans">
                    Mode Admin
                  </span>
                )}
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

          {/* RIGHT: Status Badges + Cloud Status + Profile */}
          <div className="flex flex-wrap items-center justify-end gap-2.5 sm:gap-3 shrink-0">
            
            {/* Cloud Database Badge */}
            <div
              id="badge-cloud-db-status"
              title="Real-time Cloud Firestore Database Aktif & Terhubung"
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold border bg-blue-900/50 text-blue-100 border-blue-500/30 transition-all shadow-xs"
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline opacity-80 text-[11px]">Cloud:</span>
              <span className="text-[10.5px] font-semibold text-emerald-300">Live</span>
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            {/* Integrasi Google Badge */}
            <div
              id="badge-google-sync-status"
              title="Google Sheets & Google Drive Cloud Sync Status"
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold border transition-all ${
                isGoogleConnected
                  ? 'bg-blue-800/40 text-blue-100 border-blue-500/30'
                  : 'bg-blue-950/50 text-blue-200 border-blue-500/20'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-green-300" />
              <span className="hidden md:inline opacity-80 text-[11px]">Google:</span>
              <span className="text-[10.5px]">{isGoogleConnected ? 'Tersinkron' : 'Siap'}</span>
              <div className={`w-2 h-2 rounded-full ${isGoogleConnected ? 'bg-green-400 animate-pulse' : 'bg-amber-400'}`} />
            </div>

            {/* Integrasi WA Gateway Badge */}
            <div
              id="badge-wa-gateway-status"
              title="WhatsApp Notification Gateway API Connection"
              className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold border transition-all ${
                isWhatsAppConnected
                  ? 'bg-blue-800/40 text-blue-100 border-blue-500/30'
                  : 'bg-blue-950/50 text-blue-200 border-blue-500/20'
              }`}
            >
              <Wifi className="w-3.5 h-3.5 text-sky-300" />
              <span className="text-[10px] font-mono tracking-widest text-emerald-400">
                {isWhatsAppConnected ? 'WA ONLINE' : 'WA AKTIF'}
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
                <span className="text-xs">{isSyncing ? 'Sync...' : 'Sync'}</span>
              </button>
            )}

            {/* User Profile Display */}
            {currentUser && (
              <div className="flex items-center gap-2.5 bg-blue-850/50 border border-blue-650 px-3 py-1.5 rounded-2xl shadow-inner">
                <div className="text-right">
                  <p className="text-xs font-black text-white tracking-tight leading-none truncate max-w-[130px]">
                    {currentUser.namaLengkap}
                  </p>
                  <span className="text-[8px] font-black tracking-widest text-[#1e3a8a] bg-white px-1.5 py-0.5 rounded font-sans inline-block mt-1 uppercase">
                    {currentUser.role === 'admin'
                      ? 'ADMIN'
                      : currentUser.role === 'kepsek'
                      ? 'KEPALA SEKOLAH'
                      : currentUser.role === 'guru'
                      ? `WALI [${currentUser.kelasSpesifik || 'KELAS'}]`
                      : 'PETUGAS PIKET'}
                  </span>
                </div>
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-800 font-black border-2 border-blue-500 select-none text-xs shadow-md shrink-0">
                  {currentUser.namaLengkap.substring(0, 2).toUpperCase()}
                </div>
                <button
                  onClick={onLogout}
                  type="button"
                  id="btn-action-logout"
                  className="text-[10px] font-black text-blue-200 hover:text-white px-2 py-1 rounded bg-blue-800 hover:bg-blue-900 transition-colors uppercase tracking-wider cursor-pointer font-sans"
                  title="Keluar dari sistem"
                >
                  Keluar
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Admin Logo Configuration Modal */}
      {settings && onSaveSettings && (
        <LogoChangeModal
          isOpen={isLogoModalOpen}
          onClose={() => setIsLogoModalOpen(false)}
          currentUser={currentUser}
          settings={settings}
          onSaveSettings={onSaveSettings}
        />
      )}
    </>
  );
}
