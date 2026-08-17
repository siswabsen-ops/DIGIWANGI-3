import { useState, useEffect } from 'react';
import { MessageSquare, Bell, Smartphone, X, Check, CheckCheck, Minimize2, ChevronUp, Sparkles, Send } from 'lucide-react';
import { Presensi } from '../types';

interface WhatsAppSimulatorProps {
  logs: Presensi[];
  onClearLogs: () => void;
}

export default function WhatsAppSimulator({ logs, onClearLogs }: WhatsAppSimulatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeToast, setActiveToast] = useState<Presensi | null>(null);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [autoOpenOnScan, setAutoOpenOnScan] = useState(false); // Default false so it NEVER blocks scanning

  // Show non-intrusive toast instead of full modal when new log arrives
  useEffect(() => {
    if (logs.length > 0) {
      const latestLog = logs[logs.length - 1];
      setHasNewMessage(true);
      
      // If user explicitly enabled auto-open, open modal; otherwise show mini toast
      if (autoOpenOnScan) {
        setIsOpen(true);
      } else {
        // Show compact non-intrusive toast for 3.5 seconds
        setActiveToast(latestLog);
        const timer = setTimeout(() => {
          setActiveToast(null);
        }, 3500);
        return () => clearTimeout(timer);
      }
    }
  }, [logs, autoOpenOnScan]);

  useEffect(() => {
    if (isOpen) {
      setHasNewMessage(false);
      setActiveToast(null); // Dismiss toast if modal is open
    }
  }, [isOpen]);

  // Extract parent phone number from log or raw text
  const extractParentPhone = (pesan?: string) => {
    if (!pesan) return '08123456789';
    const match = pesan.match(/\((0\d+|62\d+|\+?62\d+)\)/);
    if (match) return match[1];
    
    // Look for Indonesian phone number formats like 08 or 62 inside strings
    const firstMatch = pesan.match(/\b(08\d+|62\d+)\b/);
    if (firstMatch) return firstMatch[1];
    return '08123456789';
  };

  // Construct message content
  const formatPesan = (p: Presensi) => {
    const formattedTime = p.waktu.slice(0, 5); // Ambil jam:menit
    const labelStatus = p.status.toUpperCase();
    return `🔔 *NOTIFIKASI KEHADIRAN AKTIF - SDN 3 KARAMATWANGI*
    
Yth. Orang Tua / Wali Murid dari *${p.nama}* (NIS: ${p.nis}).

Dengan hormat, kami menginfokan bahwa siswa tersebut telah tercatat *${labelStatus}* pada jam masuk hari ini pukul *${formattedTime}* WIB.

Pesan ini dikirim otomatis melalui Server Utama WA Gateway. Terima kasih atas kerja samanya.`;
  };

  const getWaLinkInput = (p: Presensi, targetPhone: string) => {
    let phone = targetPhone.replace(/\D/g, '');
    if (phone.startsWith('0')) {
      phone = '62' + phone.substring(1);
    }
    const textEncoded = encodeURIComponent(formatPesan(p));
    return `https://api.whatsapp.com/send?phone=${phone}&text=${textEncoded}`;
  };

  return (
    <>
      {/* Non-intrusive floating toast bar when student scans (does NOT block camera or scan buttons) */}
      {!isOpen && activeToast && (
        <div
          id="wa-gateway-mini-toast"
          className="fixed bottom-20 right-4 sm:right-6 z-40 max-w-[340px] bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-2xl shadow-2xl border border-emerald-500/40 flex items-center gap-3 animate-in slide-in-from-bottom-3 fade-in duration-200 pointer-events-auto"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-md">
            <Send className="w-4 h-4 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                WA Gateway Sent
              </span>
              <span className="text-[9px] text-slate-400 font-mono">{activeToast.waktu.slice(0, 5)} WIB</span>
            </div>
            <p className="text-xs font-bold text-slate-100 truncate">{activeToast.nama}</p>
            <p className="text-[10px] text-slate-300 truncate">
              Status: <span className="font-bold text-emerald-300">{activeToast.status}</span> • Ortu: {extractParentPhone(activeToast.pesanTerkirim)}
            </p>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="text-[9px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded-lg transition-colors cursor-pointer"
            >
              Lihat
            </button>
            <button
              type="button"
              onClick={() => setActiveToast(null)}
              className="text-slate-400 hover:text-white p-0.5 self-center"
              title="Tutup notifikasi"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        type="button"
        id="btn-whatsapp-simulator-toggle"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-2xl transition-all duration-300 transform hover:scale-105 select-none focus:outline-none border-2 border-emerald-400/40"
      >
        <div className="relative">
          <MessageSquare className="w-5 h-5" />
          {hasNewMessage && (
            <span className="absolute -top-2 -right-2 w-3 h-3 bg-rose-500 rounded-full animate-bounce border-2 border-emerald-600" />
          )}
        </div>
        <span className="font-bold text-xs tracking-wide">WA Gateway (Live)</span>
        <span className="text-[10px] bg-emerald-900/60 px-2 py-0.5 rounded-full font-mono font-bold">
          {logs.length} Notif
        </span>
      </button>

      {/* Simulator Modal Box */}
      {isOpen && (
        <div
          id="wa-simulator-modal"
          className="fixed bottom-24 right-4 sm:right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] bg-[#E5DDD5] rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800 flex flex-col h-[520px] max-h-[calc(100vh-8rem)] animate-in slide-in-from-bottom-5 duration-200"
        >
          {/* Virtual Phone Header */}
          <div className="bg-[#075E54] text-white p-3.5 flex items-center justify-between border-b border-[#128C7E] shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold shadow-sm">
                WA
              </div>
              <div>
                <h4 className="font-bold text-xs tracking-wide flex items-center gap-1">
                  Server Utama WA Gateway
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </h4>
                <p className="text-[10px] text-emerald-100 opacity-90 font-mono font-bold">No. Gateway: 087844651559</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                id="btn-wa-clear-logs"
                onClick={onClearLogs}
                className="text-[9px] bg-emerald-800/90 hover:bg-emerald-900 text-emerald-100 px-2 py-1 rounded-lg font-bold transition-colors"
                title="Hapus riwayat pesan simulasi"
              >
                Reset Chat
              </button>
              <button
                type="button"
                id="btn-wa-simulator-close"
                onClick={() => setIsOpen(false)}
                className="text-white hover:text-emerald-200 p-1.5 rounded-lg hover:bg-emerald-800/60 transition-colors"
                title="Tutup (Minimize)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Notice Banner on Top of Chat */}
          <div className="bg-emerald-900/90 text-emerald-100 px-3 py-1.5 text-[10px] flex items-center justify-between border-b border-emerald-700/50">
            <span className="flex items-center gap-1 font-medium">
              <Sparkles className="w-3 h-3 text-amber-300" />
              Mode Antrean Aman: Tidak Menutupi Layar
            </span>
            <label className="flex items-center gap-1 cursor-pointer select-none text-[9px]">
              <input
                type="checkbox"
                checked={autoOpenOnScan}
                onChange={(e) => setAutoOpenOnScan(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-0 w-3 h-3 cursor-pointer"
              />
              Auto-PopUp
            </label>
          </div>

          {/* Chat Logs Content (Screen Area) */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col-reverse justify-start">
            {logs.length === 0 ? (
              <div className="my-auto text-center px-4">
                <span className="inline-block p-3 bg-white/80 rounded-full text-emerald-600 mb-2 shadow-sm">
                  <Bell className="w-6 h-6 animate-pulse" />
                </span>
                <p className="text-gray-700 font-bold text-xs">Belum Ada Presensi Hari Ini</p>
                <p className="text-gray-500 text-[11px] mt-1 leading-relaxed">
                  Saat QR Code siswa dipindai, notifikasi otomatis terkirim melalui Server Utama (087844651559) dan tercatat di sini secara aman tanpa mengganggu proses pemindaian.
                </p>
              </div>
            ) : (
              [...logs].reverse().map((log) => {
                const formattedTime = log.waktu.slice(0, 5);
                const isSent = log.waStatus === 'Terkirim';
                const parentPhone = extractParentPhone(log.pesanTerkirim);

                return (
                  <div
                    key={log.id}
                    className="self-end w-full max-w-[92%] bg-[#DCF8C6] p-3 rounded-2xl shadow-sm text-gray-800 relative text-xs animate-in zoom-in-95 duration-150 border border-emerald-200/60"
                  >
                    {/* Routing Header Label */}
                    <div className="text-[9px] font-black tracking-tight text-emerald-800 mb-1.5 pb-1 border-b border-emerald-300/40 flex flex-col gap-0.5">
                      <div className="flex justify-between">
                        <span>📡 SERVER UTAMA WA:</span>
                        <span className="font-mono text-indigo-700">087844651559</span>
                      </div>
                      <div className="flex justify-between">
                        <span>🎯 TUJUAN ORANG TUA:</span>
                        <span className="font-mono text-rose-700 font-bold">{parentPhone}</span>
                      </div>
                    </div>

                    {/* Konten template WA */}
                    <p className="whitespace-pre-line font-sans text-[11px] text-gray-800 leading-normal bg-white/60 p-2 rounded-xl border border-white/60">
                      🔔 *NOTIFIKASI KEHADIRAN*
                      <br />
                      Yth. Orang Tua/Wali Murid dari *{log.nama}* (NIS: {log.nis}).
                      <br />
                      Siswa telah tercatat *{log.status.toUpperCase()}* pukul {formattedTime} WIB.
                    </p>

                    {/* Metadata Kaki Pesan */}
                    <div className="flex items-center justify-between text-[9px] text-gray-500 mt-2">
                      <span className="text-slate-600 font-mono">Operator: {log.operator.split(',')[0]}</span>
                      <div className="flex items-center gap-1 font-mono font-bold">
                        <span>{formattedTime}</span>
                        {isSent ? (
                          <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-gray-400" />
                        )}
                      </div>
                    </div>

                    {/* Tombol Klik Uji Kirim Pintar */}
                    <div className="mt-2.5 pt-2 border-t border-emerald-300/40 flex flex-col gap-1 text-[10px]">
                      <span className="text-[8px] font-bold text-emerald-800 bg-emerald-100/80 p-1 rounded-lg text-center">
                        API STATUS: PASSED THRU GATEWAY
                      </span>
                      <div className="grid grid-cols-2 gap-1.5 mt-1">
                        <a
                          href={getWaLinkInput(log, '087844651559')}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-[#075E54] hover:bg-[#128C7E] text-white py-1 px-1.5 rounded-lg text-center text-[9px] font-black transition-all hover:scale-[1.02] flex items-center justify-center gap-0.5"
                          title="Uji kirim manual ke nomor Server Utama"
                        >
                          Uji ke Gateway &rarr;
                        </a>
                        <a
                          href={getWaLinkInput(log, parentPhone)}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-sky-600 hover:bg-sky-700 text-white py-1 px-1.5 rounded-lg text-center text-[9px] font-black transition-all hover:scale-[1.02] flex items-center justify-center gap-0.5"
                          title="Uji kirim manual ke nomor Orang Tua wali asli"
                        >
                          Uji ke Orang Tua &rarr;
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Simulated WhatsApp Keyboard/Input area */}
          <div className="bg-[#F0F2F5] p-2 border-t border-gray-200 flex items-center gap-2 shrink-0">
            <Smartphone className="w-5 h-5 text-gray-500 ml-1.5" />
            <div className="flex-1 bg-white text-gray-400 px-3 py-1.5 rounded-full text-xs select-none border border-gray-300">
              Otomatis mengirim notifikasi...
            </div>
            <div className="w-8 h-8 rounded-full bg-[#128C7E] flex items-center justify-center text-white cursor-pointer hover:bg-[#075E54]">
              <CheckCheck className="w-4 h-4" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
