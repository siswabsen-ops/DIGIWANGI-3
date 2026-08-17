import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, MessageSquare, ChevronRight, ChevronLeft, Volume2, X, HelpCircle, GraduationCap } from 'lucide-react';

import digiwangiMascot from '../assets/images/mascot_digiwangi_1780544448389.png';
import { DIGIWANGI_MASCOT_BASE64 } from '../assets/mascotBase64';

export default function MascotPromoAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [showBubble, setShowBubble] = useState(true);
  const [bubbleText, setBubbleText] = useState('Pagi! Aku Digi-Wangi - Maskot Pintar SDN 3 Karamatwangi 🤖⚡');

  // Interactive Chiptune Audio Synthesizer (No MP3 dependencies - completely built with Web Audio API)
  const playChiptune = (type: 'chime' | 'jump' | 'sparkle') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      if (type === 'chime') {
        // Double sweet higher frequency bells (Ting!)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5 standard pitch
        osc1.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15); // E6
        
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(440, ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.18, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        
        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 0.45);
        osc2.stop(ctx.currentTime + 0.45);
      } else if (type === 'jump') {
        // Sweeping upward glitch jump (Boing!)
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(850, ctx.currentTime + 0.25);
        
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else if (type === 'sparkle') {
        // Fast succession of tiny high beeps (Sparkly stars)
        const notes = [1046.5, 1318.5, 1568, 2093]; // C6, E6, G6, C7 chirp
        notes.forEach((freq, index) => {
          const osc = ctx.createOscillator();
          const gainNode = ctx.createGain();
          osc.connect(gainNode);
          gainNode.connect(ctx.destination);
          
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + index * 0.08);
          
          gainNode.gain.setValueAtTime(0.12, ctx.currentTime + index * 0.08);
          gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + index * 0.08 + 0.12);
          
          osc.start(ctx.currentTime + index * 0.08);
          osc.stop(ctx.currentTime + index * 0.08 + 0.15);
        });
      }
    } catch (e) {
      console.warn("AudioContext block prevention:", e);
    }
  };

  const promoSlides = [
    {
      title: "Presensi QR Kilat (1 Detik)",
      desc: "Anak didik hanya perlu mendekatkan kartu QR Code ke kamera! Sistem membaca NIS secara instan tanpa tunda internet.",
      benefit: "Sangat Cocok untuk Atasi Antrian Masuk Gerbang Pagi",
      badge: "PENGAKUAN CEPAT"
    },
    {
      title: "WhatsApp Notif Orang Tua",
      desc: "Wali murid menerima chat konfirmasi waktu kedatangan putra-putri seketika. Hubungan dan kepercayaan wali terjaga erat.",
      benefit: "Transparansi Absensi Sampai ke Handphone Rumah",
      badge: "KOMUNIKASI ERAT"
    },
    {
      title: "Sinkron Real-Time Cloud",
      desc: "Bekerja di HP & laptop bersamaan! Edit database murid baru di PC admin, otomatis ter-update di portal guru seketika.",
      benefit: "Bebas Repot Oper-Mengoper File Manual",
      badge: "CLOUD INTELLIGENCE"
    },
    {
      title: "Resiliensi Mode Offline",
      desc: "Internet mati mendadak? Santai! Aplikasi menyimpan nomor scan lokal secara cerdas dan men-sync-nya kembali saat online.",
      benefit: "Garansi Zero-Data Loss Walau Kuota Habis",
      badge: "INTERNET INDEPENDENT"
    }
  ];

  const floatingTips = [
    "Sudah laminating kartu QR siswa? Agar tahan air & kilat disorot kamera! 🌟",
    "Udaranya Kecamatan Cisurupan sejuk sekali hari ini, ayo semangat belajar! 🇮🇩",
    "Pencatatan kami dwi-perangkat. Mengetik di laptop, sinkron ke HP pak guru! ☁️",
    "Selamat menyambut generasi cerdas melek teknologi di Karamatwangi-Garut! 🗺️",
    "Tekan aku untuk mendengar suara nada chiptune unyu milikku! 🎵"
  ];

  // Rotate small floating helpful bubble speech
  useEffect(() => {
    const bubbleInterval = setInterval(() => {
      const randomText = floatingTips[Math.floor(Math.random() * floatingTips.length)];
      setBubbleText(randomText);
      setShowBubble(true);
      // Auto fade out bubble after 5.5 seconds to look organic
      setTimeout(() => {
        if (!isOpen) setShowBubble(false);
      }, 5500);
    }, 13000);

    return () => clearInterval(bubbleInterval);
  }, [isOpen]);

  const toggleOpen = () => {
    if (!isOpen) {
      playChiptune('jump');
    } else {
      playChiptune('chime');
    }
    setIsOpen(!isOpen);
    setShowBubble(true);
  };

  const nextSlide = () => {
    playChiptune('sparkle');
    setActiveSlide((prev) => (prev + 1) % promoSlides.length);
  };

  const prevSlide = () => {
    playChiptune('sparkle');
    setActiveSlide((prev) => (prev - 1 + promoSlides.length) % promoSlides.length);
  };

  return (
    <>
      {/* FLOATING COMPANION AVATAR (BOTTOM-LEFT) */}
      <div className="fixed bottom-6 left-6 z-40 flex flex-col items-start gap-2.5 max-w-sm select-none font-sans">
        
        {/* COMPACT BUBBLE SPEAKER BOX */}
        <AnimatePresence>
          {showBubble && (
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 10 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              onClick={() => {
                playChiptune('chime');
                setIsOpen(true);
              }}
              className="bg-white border-2 border-blue-600/30 text-slate-800 p-3 rounded-2xl shadow-xl text-xs font-bold leading-normal relative w-60 cursor-pointer hover:bg-slate-50 transition-all text-left"
            >
              {/* Talk Pointer Tail */}
              <div className="absolute -bottom-1.5 left-6 w-3 h-3 bg-white border-r-2 border-b-2 border-blue-600/30 rotate-45" />
              
              <div className="flex items-center gap-1 text-blue-700 font-extrabold text-[9px] uppercase tracking-wider mb-0.5">
                <Sparkles className="w-3 h-3 shrink-0 animate-spin" />
                <span>Digi-Wangi Promo</span>
              </div>
              <p className="text-[11px] leading-snug">{bubbleText}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CLICAKBLE MASCOT */}
        <div className="flex items-center gap-3">
          <motion.button
            onClick={toggleOpen}
            animate={isOpen ? {
              y: [0, -4, 0],
              scale: [1, 1.05, 1],
              rotate: [0, -3, 3, 0]
            } : {
              y: [0, -8, 0],
              rotate: [-1, 1, -1]
            }}
            transition={isOpen ? {
              repeat: Infinity,
              duration: 2.5,
              ease: "easeInOut"
            } : {
              repeat: Infinity,
              duration: 4.5,
              ease: "easeInOut"
            }}
            whileHover={{ scale: 1.15, rotate: 6 }}
            className={`w-14 h-14 rounded-full flex items-center justify-center p-0.5 border-2 shadow-2xl relative cursor-pointer outline-none ${
              isOpen 
                ? 'bg-blue-700 border-white ring-4 ring-blue-200' 
                : 'bg-white border-blue-600 hover:border-amber-400'
            }`}
            title="Klik aku untuk asisten & promo!"
          >
            <img 
              src={digiwangiMascot || DIGIWANGI_MASCOT_BASE64 || '/mascot.png'} 
              alt="Mascot Digi-Wangi" 
              referrerPolicy="no-referrer"
              loading="eager"
              decoding="sync"
              onError={(e) => { 
                const target = e.currentTarget as HTMLImageElement;
                target.src = DIGIWANGI_MASCOT_BASE64;
              }}
              className="w-full h-full object-contain rounded-full"
            />
            
            {/* Mascot Status Spark indicator */}
            <span className="absolute -bottom-1 -right-1 bg-amber-400 border border-white text-slate-950 text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-black shadow animate-bounce">
              💡
            </span>
          </motion.button>
          
          {!isOpen && (
            <div 
              onClick={toggleOpen}
              className="bg-slate-900/90 hover:bg-slate-900 text-white border border-white/10 px-3.5 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase cursor-pointer shadow-lg backdrop-blur-md hover:border-blue-400 transition-all flex items-center gap-1"
            >
              <HelpCircle className="w-3 h-3 text-blue-400" />
              <span>PROMO & TIPS</span>
            </div>
          )}
        </div>
      </div>

      {/* FULL EXPANDED GLASSMORPHIC CARD PANEL */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: -20, y: 15 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, x: -25, y: 15 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed bottom-24 left-6 z-50 w-[350px] max-w-full bg-slate-900/95 text-white backdrop-blur-md rounded-3xl border border-white/15 p-5 shadow-2xl text-left flex flex-col gap-4 font-sans leading-relaxed"
          >
            {/* Header section */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center border border-blue-400/35">
                  <GraduationCap className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-blue-400 leading-none">DIGIWANGI 3</h3>
                  <span className="text-[10px] text-slate-300 font-bold block mt-1">Asisten Promo & Panduan</span>
                </div>
              </div>
              <button
                onClick={toggleOpen}
                className="p-1 px-2 rounded-lg bg-white/5 hover:bg-white/15 hover:text-rose-400 border border-white/5 transition-all text-xs font-extrabold cursor-pointer"
                title="Sembunyikan Panel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Slider container */}
            <div className="bg-white/5 border border-white/5 p-4 rounded-2xl relative overflow-hidden">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[8px] font-black text-amber-400 bg-amber-950/50 border border-amber-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {promoSlides[activeSlide].badge}
                </span>
                <span className="text-[9px] font-mono text-slate-400 font-extrabold">
                  {activeSlide + 1} / {promoSlides.length}
                </span>
              </div>

              {/* Slide text details */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSlide}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-1"
                >
                  <h4 className="text-xs font-black text-white uppercase tracking-tight">{promoSlides[activeSlide].title}</h4>
                  <p className="text-[11px] text-slate-300 font-medium leading-relaxed mt-1">
                    {promoSlides[activeSlide].desc}
                  </p>
                  <div className="mt-2 text-[9px] text-emerald-400 bg-emerald-950/20 py-1 px-2 rounded-lg border border-emerald-500/20 inline-block font-extrabold leading-none">
                    ⭐ Performa: {promoSlides[activeSlide].benefit}
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Prev / Next controls */}
              <div className="flex items-center justify-between mt-4 pt-2.5 border-t border-white/5">
                <button
                  onClick={prevSlide}
                  className="p-1 rounded bg-white/5 hover:bg-white/10 text-white cursor-pointer transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <div className="flex gap-1.5">
                  {promoSlides.map((_, idx) => (
                    <span 
                      key={idx}
                      className={`h-1.5 rounded-full transition-all duration-300 ${activeSlide === idx ? 'w-4 bg-blue-500' : 'w-1.5 bg-white/20'}`}
                    />
                  ))}
                </div>
                <button
                  onClick={nextSlide}
                  className="p-1 rounded bg-white/5 hover:bg-white/10 text-white cursor-pointer transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* SOUND EFFECT PLAYROOM */}
            <div className="space-y-2 border-t border-white/10 pt-3">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                🎵 Papan Tuts Chiptune Digi-Wangi:
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => {
                    playChiptune('chime');
                    setBubbleText("Ting! Nada bel modern siap menyambut scan Anda! 🔔");
                  }}
                  className="bg-blue-900/40 hover:bg-blue-800 border border-blue-500/30 text-[9px] font-black tracking-wider py-1.5 px-2 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1 uppercase"
                >
                  <Volume2 className="w-3 h-3 shrink-0 text-blue-400" />
                  <span>TING!</span>
                </button>
                <button
                  onClick={() => {
                    playChiptune('jump');
                    setBubbleText("Boing! DigiWangi menembus awan dengan lincah! 🚀");
                  }}
                  className="bg-indigo-900/40 hover:bg-indigo-800 border border-indigo-500/30 text-[9px] font-black tracking-wider py-1.5 px-2 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1 uppercase"
                >
                  <Volume2 className="w-3 h-3 shrink-0 text-indigo-400" />
                  <span>BOING!</span>
                </button>
                <button
                  onClick={() => {
                    playChiptune('sparkle');
                    setBubbleText("Selesai! Seluruh data sukses dwi-perangkat! ✨");
                  }}
                  className="bg-emerald-950/40 hover:bg-emerald-900 border border-emerald-500/30 text-[9px] font-black tracking-wider py-1.5 px-2 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1 uppercase"
                >
                  <Volume2 className="w-3 h-3 shrink-0 text-emerald-400" />
                  <span>SPARK!</span>
                </button>
              </div>
            </div>

            {/* Footer school identity */}
            <div className="text-[9px] text-slate-500 border-t border-white/5 pt-2 flex items-center justify-between">
              <span>Maju Bersama Digiwangi</span>
              <span className="font-mono text-blue-400/80 font-bold">Kec. Cisurupan</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
