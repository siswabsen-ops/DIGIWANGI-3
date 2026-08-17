import React, { useState, useEffect } from 'react';
import { Shield, Key, Eye, EyeOff, Check, AlertCircle, Info, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '../types';
import { USER_DEMO_ACCOUNTS } from '../lib/demoData';

import digiwangiLogo from '../assets/images/logo_digiwangi3_official.png';
import digiwangiMascot from '../assets/images/mascot_digiwangi_1780544448389.png';
import { DIGIWANGI_LOGO_BASE64 } from '../assets/logoBase64';
import { DIGIWANGI_MASCOT_BASE64 } from '../assets/mascotBase64';

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
  accountsList: { user: User; pin: string }[];
}

export default function LoginScreen({ onLoginSuccess, accountsList }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeSlide, setActiveSlide] = useState(0);

  // Promo slides content showcasing SDN 3 Karamatwangi
  const promoSlides = [
    {
      title: "PRESISI QR KODE KILAT",
      desc: "Pindai kartu QR Code Anda ke depan kamera laptop atau HP! Kehadiran terekam dalam < 1 detik super cepat.",
      icon: "⚡",
      badge: "QUICK SCAN"
    },
    {
      title: "NOTIFIKASI WHATSAPP",
      desc: "Orang tua tenang & terbantu! Kirim konfirmasi kehadiran otomatis langsung ke handphone wali murid seketika.",
      icon: "💬",
      badge: "INTEGRASI WA"
    },
    {
      title: "SINKRONISASI EVALUASI",
      desc: "Terbuka lewat awan! Saling terhubung HP & Laptop. Entry guru piket ter-update real-time ke wali kelas & kepsek.",
      icon: "☁️",
      badge: "CLOUD SYNC"
    },
    {
      title: "SISTEM LAPORAN TERPADU",
      desc: "Unduh file rekapitulasi presensi harian & bulanan siap cetak dalam satu klik agar administrasi sekolah lancar.",
      icon: "📊",
      badge: "ANALITIK LAPORAN"
    }
  ];

  // Auto scroll promo slides
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % promoSlides.length);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const triggerMascotTrick = () => {
    setActiveSlide((prev) => (prev + 1) % promoSlides.length);
  };

  // Manual login handler
  const handleManualLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanUsername = username.trim().toLowerCase();
    const cleanPin = pin.trim();

    if (!cleanUsername || !cleanPin) {
      setErrorMsg('Username dan PIN wajib diisi.');
      return;
    }

    // Combine accountsList and fallback USER_DEMO_ACCOUNTS
    const allAccounts = [...accountsList];
    USER_DEMO_ACCOUNTS.forEach((demoAcc) => {
      if (!allAccounts.some((a) => a.user.username.toLowerCase() === demoAcc.user.username.toLowerCase())) {
        allAccounts.push(demoAcc);
      }
    });

    const matched = allAccounts.find(
      (acc) => acc.user.username.toLowerCase() === cleanUsername && acc.pin === cleanPin
    );

    if (matched) {
      onLoginSuccess(matched.user);
    } else {
      setErrorMsg('Kombinasi Username dan PIN salah. Silakan periksa username & PIN Anda.');
    }
  };

  // Demo user trigger (instant login)
  const handleDemoLogin = (user: User) => {
    onLoginSuccess(user);
  };

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center bg-slate-50 px-4 py-12 relative overflow-hidden">
      {/* Visual background decoration items */}
      <div className="absolute top-10 left-10 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />

      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-12 bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden relative z-10 animate-in fade-in-50 duration-300">
        {/* Left Aspect: Branding & Information (School Theme with Animated Mascot Promo) */}
        <div className="md:col-span-5 bg-gradient-to-br from-[#0b1329] via-[#14234c] to-[#1b3d6d] p-8 text-white flex flex-col justify-between relative overflow-hidden">
          {/* Elegant top right badge */}
          <div className="absolute top-0 right-0 p-3 z-10">
            <span className="text-[9px] bg-white/10 backdrop-blur-md text-blue-100 font-bold px-2 py-0.5 rounded-full border border-white/20 uppercase tracking-widest">
              PRIMARY ED
            </span>
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center p-1 shadow-md border border-white/30 shrink-0 overflow-hidden">
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
                <h2 className="text-2xl font-black tracking-tighter leading-none font-display flex items-center gap-[0.5px]">
                  {Array.from("DIGIWANGI 3").map((char, index) => (
                    <motion.span
                      key={index}
                      className="inline-block hover:text-amber-300 transition-colors cursor-pointer select-none"
                      animate={{
                        y: [0, -3.5, 0],
                        scale: [1, 1.05, 1],
                        textShadow: [
                          "0 0 0px rgba(255,255,255,0)",
                          "0 0 8px rgba(147,197,253,0.4)",
                          "0 0 0px rgba(255,255,255,0)",
                        ]
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 3.2,
                        ease: "easeInOut",
                        delay: index * 0.12,
                      }}
                      whileHover={{ scale: 1.3, y: -5, color: "#fbbf24" }}
                    >
                      {char === ' ' ? '\u00A0' : char}
                    </motion.span>
                  ))}
                </h2>
                <p className="text-[9px] font-semibold text-blue-200 mt-1 uppercase tracking-widest leading-none">Digital Karamatwangi 3</p>
              </div>
            </div>
            <p className="text-[10px] text-blue-100/80 leading-tight">
              Sistem manajemen kehadiran digital handal SDN 3 Karamatwangi, Kec. Cisurupan, Garut.
            </p>
            
            {/* Elegant Luxury Slogan Badges */}
            <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap gap-1.5 justify-start">
              <span className="text-[9px] font-black bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-400 text-slate-950 px-2 py-0.5 rounded-md shadow-md shadow-amber-500/10 uppercase tracking-wider">⚡ Cepat</span>
              <span className="text-[9px] font-black bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-400 text-slate-950 px-2 py-0.5 rounded-md shadow-md shadow-amber-500/10 uppercase tracking-wider">🎯 Akurat</span>
              <span className="text-[9px] font-black bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-400 text-slate-950 px-2 py-0.5 rounded-md shadow-md shadow-amber-500/10 uppercase tracking-wider">👁️ Transparansi</span>
              <span className="text-[9px] font-black bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-400 text-slate-950 px-2 py-0.5 rounded-md shadow-md shadow-amber-500/10 uppercase tracking-wider">🛡️ Terintegritas</span>
            </div>
          </div>

          {/* CHERISHED ANIMATED MASCOT PROMO BOX */}
          <div className="my-auto py-5 flex flex-col items-center justify-center relative z-10">
            {/* Spinning Glow Backdrop */}
            <div className="absolute w-40 h-40 bg-blue-500/25 rounded-full blur-3xl animate-pulse" />
            <div className="absolute w-28 h-28 border border-white/10 bg-blue-400/5 rounded-full -z-10 animate-[spin_15s_linear_infinite]" />
            
            {/* Floating and Bouncing Mascot */}
            <motion.div
              animate={{ 
                y: [0, -10, 0],
                rotate: [-1.5, 1.5, -1.5],
                scale: [1, 1.015, 1]
              }}
              transition={{ 
                repeat: Infinity, 
                duration: 4.5, 
                ease: "easeInOut" 
              }}
              whileHover={{ scale: 1.08, rotate: 3 }}
              onClick={triggerMascotTrick}
              className="relative w-32 h-32 cursor-pointer transform transition-all select-none drop-shadow-[0_10px_15px_rgba(30,58,138,0.4)]"
              title="Klik aku untuk melihat keunggulan!"
            >
              <img 
                src={digiwangiMascot || DIGIWANGI_MASCOT_BASE64 || '/mascot.png'} 
                alt="Mascot DigiWangi 3" 
                referrerPolicy="no-referrer"
                loading="eager"
                decoding="sync"
                onError={(e) => { 
                  const target = e.currentTarget as HTMLImageElement;
                  target.src = DIGIWANGI_MASCOT_BASE64;
                }}
                className="w-full h-full object-contain"
              />
              
              {/* Floating Little Sparkle Label */}
              <div className="absolute -top-1 -right-2 bg-amber-400 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded-full shadow-md border border-amber-300 animate-bounce leading-none">
                PROMO ✨
              </div>
            </motion.div>

            {/* Bubble chat box */}
            <div className="mt-4 w-full relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSlide}
                  initial={{ opacity: 0, y: 15, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -15, scale: 0.96 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="bg-white/10 backdrop-blur-md border border-white/15 p-3.5 rounded-2xl relative shadow-lg text-left"
                >
                  {/* Talk tail pointer pointing upwards */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-white/10" />

                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-xs">{promoSlides[activeSlide].icon}</span>
                    <span className="text-[8px] font-black tracking-widest text-amber-300 uppercase">
                      {promoSlides[activeSlide].badge}
                    </span>
                  </div>
                  <h4 className="text-xs font-black text-white font-display uppercase tracking-tight leading-none mb-1">
                    {promoSlides[activeSlide].title}
                  </h4>
                  <p className="text-[10px] text-blue-105/90 leading-relaxed font-semibold">
                    {promoSlides[activeSlide].desc}
                  </p>
                </motion.div>
              </AnimatePresence>

              {/* Slide Navigation Dots */}
              <div className="flex items-center justify-center gap-1.5 mt-2.5">
                {promoSlides.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveSlide(idx)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      activeSlide === idx 
                        ? 'w-5 bg-amber-400' 
                        : 'w-1.5 bg-white/30 hover:bg-white/55'
                    }`}
                    title={`Lihat Fitur ${idx + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4 my-1 relative z-10">
            <div className="py-2 px-3 bg-blue-950/45 rounded-xl border border-white/5 backdrop-blur-xs text-center">
              <p className="text-blue-150 text-[10px] font-bold">
                💡 Ketuk Maskot Pintar kami di atas untuk tips instan
              </p>
            </div>
          </div>

          <div className="text-[10px] text-blue-200 border-t border-blue-500/20 pt-3 flex items-center justify-between relative z-10">
            <span>SDN 3 Karamatwangi © 2026</span>
            <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">GARUT</span>
          </div>
        </div>

        {/* Right Aspect: Authentication Terminal */}
        <div className="md:col-span-7 p-8 sm:p-10 flex flex-col justify-center">
          <div className="mb-6">
            <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2 font-display">
              <Lock className="w-5 h-5 text-blue-700" />
              Masuk Sistem Presensi
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Silakan gunakan PIN demo cepat atau masukkan username & PIN terdaftar untuk masuk.
            </p>
          </div>

          {/* Quick Demo Access Buttons Grid */}
          <div className="mb-6 bg-slate-50 border border-slate-200 p-4 rounded-2xl">
            <span className="text-[10px] font-black tracking-wider text-blue-700 block mb-2.5 uppercase font-display">
              🚀 AKSES CEPAT (AKUN DEMO SEJAHTERA)
            </span>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
              {accountsList.map((acc) => {
                const getRoleColor = (role: string) => {
                  switch (role) {
                    case 'admin':
                      return 'bg-blue-700 hover:bg-blue-800 text-white';
                    case 'kepsek':
                      return 'bg-indigo-650 hover:bg-indigo-700 text-white';
                    case 'guru':
                      return 'bg-emerald-650 hover:bg-emerald-750 text-white';
                    default:
                      return 'bg-amber-600 hover:bg-amber-700 text-white';
                  }
                };
                const getRoleLabels = (user: User) => {
                  if (user.role === 'admin') return 'Admin';
                  if (user.role === 'kepsek') return 'Kepsek';
                  if (user.role === 'guru') return user.kelasSpesifik || 'Guru';
                  return 'Piket';
                };

                return (
                  <button
                    key={acc.user.id}
                    type="button"
                    id={`btn-login-demo-${acc.user.username}`}
                    onClick={() => handleDemoLogin(acc.user)}
                    className={`flex flex-col items-start p-2.5 rounded-xl text-white transition-all transform hover:-translate-y-0.5 shadow-sm hover:shadow active:translate-y-0 cursor-pointer ${getRoleColor(
                      acc.user.role
                    )}`}
                  >
                    <span className="text-[9px] font-black bg-white/20 px-1.5 py-0.2 rounded uppercase mb-1 font-mono tracking-wider">
                      {getRoleLabels(acc.user)}
                    </span>
                    <span className="font-extrabold text-xs truncate w-full tracking-tight">{acc.user.namaLengkap}</span>
                    <div className="flex items-center justify-between w-full text-[9px] opacity-90 mt-1 font-mono border-t border-white/20 pt-1">
                      <span>User: <strong>{acc.user.username}</strong></span>
                      <span>PIN: <strong>{acc.pin}</strong></span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-4 text-[10px] text-slate-400 font-extrabold tracking-wider uppercase font-display">ATAU MANUAL</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* Manual Login Form */}
          <form onSubmit={handleManualLogin} className="space-y-4 mt-4">
            {errorMsg && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-extrabold text-slate-600 uppercase tracking-wider mb-1.5">Username</label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Isi username akun (misal: admin, piket)"
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all font-medium placeholder-slate-400 shadow-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-extrabold text-slate-600 uppercase tracking-wider mb-1.5">PIN Keamanan</label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Isi 4 digit PIN (misal: 1234)"
                  maxLength={6}
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all font-mono font-bold placeholder-slate-400 tracking-widest shadow-sm"
                />
                <button
                  type="button"
                  id="btn-toggle-show-pin"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3.5 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              id="btn-submit-login"
              className="w-full bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-100 text-white rounded-xl py-2.5 font-bold text-sm transition-all shadow-md hover:shadow-lg transform active:scale-[0.99] cursor-pointer block text-center"
            >
              Masuk ke Aplikasi &rarr;
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
