import { useState, useEffect, useMemo, memo } from 'react';
import {
  MessageSquare,
  Bell,
  Smartphone,
  X,
  Check,
  CheckCheck,
  Send,
  Sparkles,
  Copy,
  ExternalLink,
  Phone,
  Search,
  Filter,
  CheckCircle2,
  Share2,
  Users
} from 'lucide-react';
import { Presensi, Siswa, SystemSettings, isRecordMatchStudent } from '../types';
import { getLocalDateString } from '../lib/attendanceUtils';

interface WhatsAppSimulatorProps {
  logs: Presensi[];
  onClearLogs: () => void;
  siswaList?: Siswa[];
  settings?: SystemSettings;
}

function WhatsAppSimulator({ logs, onClearLogs, siswaList = [], settings }: WhatsAppSimulatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeToast, setActiveToast] = useState<Presensi | null>(null);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [autoOpenOnScan, setAutoOpenOnScan] = useState(false);
  const [autoDirectSendPrompt, setAutoDirectSendPrompt] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('Semua Kelas');

  // Find pupil by attendance record
  const getPupilForPresensi = (p: Presensi): Siswa | undefined => {
    return siswaList.find(s => 
      s.id === p.siswaId || 
      (s.nis && p.nis && s.nis.trim() === p.nis.trim()) ||
      (s.nik && p.nik && s.nik.trim() === p.nik.trim()) ||
      (s.nama.trim().toLowerCase() === p.nama.trim().toLowerCase())
    );
  };

  // Resolve target parent phone number
  const resolveParentPhone = (p: Presensi): string => {
    const matchedPupil = getPupilForPresensi(p);
    if (matchedPupil?.waOrangTua && matchedPupil.waOrangTua.trim()) {
      return matchedPupil.waOrangTua.trim();
    }
    // Fallback: extract from pesanTerkirim if contains phone number
    if (p.pesanTerkirim) {
      const matchBracket = p.pesanTerkirim.match(/\((08\d+|628\d+|\+?62\d+)\)/);
      if (matchBracket) return matchBracket[1];
      const matchRaw = p.pesanTerkirim.match(/\b(08\d{8,12}|628\d{8,12})\b/);
      if (matchRaw) return matchRaw[1];
    }
    return '081234567890';
  };

  // Clean phone number to WhatsApp international standard (628...)
  const formatPhoneForWhatsApp = (rawPhone: string): string => {
    let clean = rawPhone.replace(/\D/g, '');
    if (clean.startsWith('0')) {
      clean = '62' + clean.substring(1);
    } else if (clean.startsWith('+62')) {
      clean = '62' + clean.substring(3);
    } else if (!clean.startsWith('62')) {
      clean = '62' + clean;
    }
    return clean;
  };

  // Construct message content from template or default format
  const formatPesanWhatsApp = (p: Presensi): string => {
    const timeFormatted = p.waktu ? p.waktu.slice(0, 5) : '07:00';
    const statusLabel = p.status ? p.status.toUpperCase() : 'HADIR';
    const dateFormatted = p.tanggal || getLocalDateString();

    if (settings?.templatePesan && settings.templatePesan.includes('{nama}')) {
      return settings.templatePesan
        .replace(/{nama}/g, p.nama)
        .replace(/{status}/g, statusLabel)
        .replace(/{waktu}/g, timeFormatted)
        .replace(/{kelas}/g, p.kelas)
        .replace(/{tanggal}/g, dateFormatted);
    }

    return `🔔 *NOTIFIKASI KEHADIRAN SISWA - SDN 3 KARAMATWANGI*
    
Yth. Orang Tua / Wali Murid dari:
👤 *Nama Siswa:* ${p.nama}
🏷️ *Kelas:* ${p.kelas}
📌 *NIS / ID:* ${p.nis || p.nik || '-'}

Dengan ini kami menginformasikan bahwa ananda telah tercatat *${statusLabel}* pada presensi sekolah hari ini:
📅 Tanggal: ${dateFormatted}
⏰ Pukul: ${timeFormatted} WIB
👨‍🏫 Petugas/Operator: ${p.operator ? p.operator.split(',')[0] : 'Operator Gerbang'}

Pesan ini dikirimkan otomatis melalui Server Layanan WA Gateway SDN 3 Karamatwangi. Terima kasih atas perhatian dan kerja sama Bapak/Ibu.`;
  };

  // Direct WhatsApp Link
  const getDirectWhatsAppUrl = (p: Presensi, phone: string) => {
    const cleanPhone = formatPhoneForWhatsApp(phone);
    const message = formatPesanWhatsApp(p);
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  };

  // Handle incoming new presensi records
  useEffect(() => {
    if (logs.length > 0) {
      const latestLog = logs[logs.length - 1];
      setHasNewMessage(true);

      const targetPhone = resolveParentPhone(latestLog);

      // If user enabled automatic direct dispatch prompt
      if (autoDirectSendPrompt) {
        const directUrl = getDirectWhatsAppUrl(latestLog, targetPhone);
        window.open(directUrl, '_blank', 'noopener,noreferrer');
      }

      if (autoOpenOnScan) {
        setIsOpen(true);
      } else {
        setActiveToast(latestLog);
        const timer = setTimeout(() => {
          setActiveToast(null);
        }, 4000);
        return () => clearTimeout(timer);
      }
    }
  }, [logs.length, autoOpenOnScan, autoDirectSendPrompt]);

  useEffect(() => {
    if (isOpen) {
      setHasNewMessage(false);
      setActiveToast(null);
    }
  }, [isOpen]);

  // Copy message to clipboard
  const handleCopyMessage = async (p: Presensi) => {
    const text = formatPesanWhatsApp(p);
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
      setCopiedId(p.id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      // Fallback
    }
  };

  // Filtered logs for simulator search
  const filteredLogs = useMemo(() => {
    return logs.filter(p => {
      if (selectedClassFilter !== 'Semua Kelas' && p.kelas !== selectedClassFilter) {
        return false;
      }
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const phone = resolveParentPhone(p);
        const matchName = p.nama.toLowerCase().includes(q);
        const matchNis = p.nis ? p.nis.toLowerCase().includes(q) : false;
        const matchPhone = phone.includes(q);
        if (!matchName && !matchNis && !matchPhone) return false;
      }
      return true;
    });
  }, [logs, selectedClassFilter, searchFilter, siswaList]);

  return (
    <>
      {/* Non-intrusive floating toast bar when student scans */}
      {!isOpen && activeToast && (
        <div
          id="wa-gateway-mini-toast"
          className="fixed bottom-20 right-4 sm:right-6 z-40 max-w-[360px] bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-2xl border border-emerald-500/50 flex items-center gap-3 animate-in slide-in-from-bottom-3 fade-in duration-200 pointer-events-auto"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-md">
            <Send className="w-5 h-5 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Otomatis Dikirim ke Ortu
              </span>
              <span className="text-[9px] text-slate-400 font-mono">{activeToast.waktu.slice(0, 5)} WIB</span>
            </div>
            <p className="text-xs font-bold text-slate-100 truncate">{activeToast.nama} ({activeToast.kelas})</p>
            <p className="text-[10px] text-slate-300 truncate">
              Status: <span className="font-bold text-emerald-300">{activeToast.status}</span> • No. Ortu: <span className="font-mono text-amber-300 font-bold">{resolveParentPhone(activeToast)}</span>
            </p>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <a
              href={getDirectWhatsAppUrl(activeToast, resolveParentPhone(activeToast))}
              target="_blank"
              rel="noreferrer"
              className="text-[9px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded-lg transition-colors flex items-center gap-1 shadow-xs"
              title="Buka Chat WhatsApp Orang Tua"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Chat</span>
            </a>
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="text-[9px] font-semibold text-slate-300 hover:text-white underline text-center"
            >
              Detail
            </button>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        type="button"
        id="btn-whatsapp-simulator-toggle"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-2xl transition-all duration-300 transform hover:scale-105 select-none focus:outline-none border-2 border-emerald-400/40 cursor-pointer"
      >
        <div className="relative">
          <MessageSquare className="w-5 h-5" />
          {hasNewMessage && (
            <span className="absolute -top-2 -right-2 w-3 h-3 bg-rose-500 rounded-full animate-bounce border-2 border-emerald-600" />
          )}
        </div>
        <span className="font-bold text-xs tracking-wide">WA Gateway (Live)</span>
        <span className="text-[10px] bg-emerald-900/60 px-2 py-0.5 rounded-full font-mono font-bold">
          {logs.length} Terkirim
        </span>
      </button>

      {/* Simulator Modal Box */}
      {isOpen && (
        <div
          id="wa-simulator-modal"
          className="fixed bottom-24 right-4 sm:right-6 z-50 w-[420px] max-w-[calc(100vw-2rem)] bg-[#E5DDD5] rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800 flex flex-col h-[560px] max-h-[calc(100vh-8rem)] animate-in slide-in-from-bottom-5 duration-200"
        >
          {/* Virtual Phone Header */}
          <div className="bg-[#075E54] text-white p-3.5 flex items-center justify-between border-b border-[#128C7E] shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold shadow-sm">
                <Smartphone className="w-5 h-5 text-emerald-800" />
              </div>
              <div>
                <h4 className="font-bold text-xs tracking-wide flex items-center gap-1">
                  Server Otomatis WA Gateway
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </h4>
                <p className="text-[10px] text-emerald-100 opacity-90 font-mono font-bold">
                  Kirim Otomatis ke Nomor WA Orang Tua Siswa
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                id="btn-wa-clear-logs"
                onClick={onClearLogs}
                className="text-[9px] bg-emerald-800/90 hover:bg-emerald-900 text-emerald-100 px-2 py-1 rounded-lg font-bold transition-colors cursor-pointer"
                title="Hapus riwayat pesan simulasi"
              >
                Reset Chat
              </button>
              <button
                type="button"
                id="btn-wa-simulator-close"
                onClick={() => setIsOpen(false)}
                className="text-white hover:text-emerald-200 p-1.5 rounded-lg hover:bg-emerald-800/60 transition-colors cursor-pointer"
                title="Tutup (Minimize)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Controls Banner */}
          <div className="bg-emerald-900/95 text-emerald-100 px-3 py-2 text-[10px] flex flex-col gap-1.5 border-b border-emerald-700/50">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 font-bold text-emerald-200">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                Status: Otomatis Dispatched ke Nomor HP Ortu
              </span>
              <span className="text-[9px] font-mono bg-emerald-800 px-1.5 py-0.5 rounded text-emerald-200">
                {filteredLogs.length} Pesan
              </span>
            </div>

            {/* Quick Search and Filter */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Cari siswa atau nomor ortu..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full bg-emerald-950/80 text-white placeholder-emerald-400/70 text-[10px] py-1 px-2 rounded-lg border border-emerald-700/60 focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium"
                />
              </div>
              <label className="flex items-center gap-1 cursor-pointer select-none text-[9px] bg-emerald-950/80 px-2 py-1 rounded-lg border border-emerald-700/60 shrink-0">
                <input
                  type="checkbox"
                  checked={autoDirectSendPrompt}
                  onChange={(e) => setAutoDirectSendPrompt(e.target.checked)}
                  className="rounded text-emerald-500 focus:ring-0 w-3 h-3 cursor-pointer"
                />
                <span>Direct Pop-Up WA</span>
              </label>
            </div>
          </div>

          {/* Chat Logs Content (Screen Area) */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 flex flex-col-reverse justify-start">
            {filteredLogs.length === 0 ? (
              <div className="my-auto text-center px-4 py-6 bg-white/70 rounded-2xl border border-dashed border-slate-300">
                <span className="inline-block p-3 bg-emerald-50 rounded-full text-emerald-600 mb-2 shadow-xs">
                  <Bell className="w-6 h-6 animate-pulse" />
                </span>
                <p className="text-gray-800 font-extrabold text-xs">Belum Ada Presensi yang Masuk</p>
                <p className="text-gray-600 text-[11px] mt-1 leading-relaxed">
                  Setiap siswa melakukan absensi (Scan QR atau Manual Guru), sistem akan langsung otomatis menyusun format notifikasi dan menyalurkannya ke nomor WhatsApp Orang Tua yang tertera di profil siswa.
                </p>
              </div>
            ) : (
              [...filteredLogs].reverse().map((log) => {
                const formattedTime = log.waktu ? log.waktu.slice(0, 5) : '07:00';
                const isSent = log.waStatus === 'Terkirim';
                const parentPhone = resolveParentPhone(log);
                const isCopied = copiedId === log.id;
                const directUrl = getDirectWhatsAppUrl(log, parentPhone);

                return (
                  <div
                    key={log.id}
                    className="self-end w-full max-w-[96%] bg-[#DCF8C6] p-3 rounded-2xl shadow-sm text-gray-800 relative text-xs animate-in zoom-in-95 duration-150 border border-emerald-300/70"
                  >
                    {/* Routing Header Label */}
                    <div className="text-[9px] font-black tracking-tight text-emerald-900 mb-1.5 pb-1.5 border-b border-emerald-300/60 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                        <span className="uppercase">Otomatis Terkirim ke WA Ortu:</span>
                      </div>
                      <span className="font-mono text-emerald-950 font-black bg-emerald-200/90 px-1.5 py-0.2 rounded border border-emerald-300">
                        {parentPhone}
                      </span>
                    </div>

                    {/* Konten template WA */}
                    <div className="font-sans text-[11px] text-gray-800 leading-relaxed bg-white/80 p-2.5 rounded-xl border border-white shadow-2xs space-y-1">
                      <p className="font-bold text-emerald-900 text-[11px]">
                        🔔 NOTIFIKASI KEHADIRAN SISWA
                      </p>
                      <p className="text-gray-700">
                        Yth. Orang Tua / Wali dari <b>{log.nama}</b> ({log.kelas}).
                      </p>
                      <p className="text-gray-700">
                        Telah tercatat status: <span className="font-black text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded uppercase">{log.status}</span> pada pukul <b>{formattedTime} WIB</b>.
                      </p>
                    </div>

                    {/* Metadata Kaki Pesan */}
                    <div className="flex items-center justify-between text-[9px] text-gray-500 mt-2">
                      <span className="text-slate-600 font-medium">Petugas: {log.operator ? log.operator.split(',')[0] : 'Sistem Gerbang'}</span>
                      <div className="flex items-center gap-1 font-mono font-bold">
                        <span>{formattedTime}</span>
                        {isSent ? (
                          <CheckCheck className="w-3.5 h-3.5 text-blue-600" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-gray-400" />
                        )}
                      </div>
                    </div>

                    {/* Direct Action Buttons */}
                    <div className="mt-2.5 pt-2 border-t border-emerald-300/50 grid grid-cols-2 gap-1.5">
                      <a
                        href={directUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-[#075E54] hover:bg-[#128C7E] text-white py-1.5 px-2 rounded-xl text-center text-[10px] font-black transition-all hover:scale-[1.02] flex items-center justify-center gap-1 shadow-xs"
                        title={`Buka chat WhatsApp ke nomor orang tua (${parentPhone})`}
                      >
                        <Phone className="w-3 h-3 text-emerald-200" />
                        <span>Kirim ke WA Ortu</span>
                        <ExternalLink className="w-2.5 h-2.5 ml-0.5 opacity-80" />
                      </a>

                      <button
                        type="button"
                        onClick={() => handleCopyMessage(log)}
                        className={`py-1.5 px-2 rounded-xl text-center text-[10px] font-bold transition-all flex items-center justify-center gap-1 border cursor-pointer ${
                          isCopied
                            ? 'bg-emerald-800 text-white border-emerald-900 shadow-xs'
                            : 'bg-white/90 hover:bg-white text-slate-750 border-slate-200'
                        }`}
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-300" />
                            <span>Tersalin!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-slate-500" />
                            <span>Salin Teks WA</span>
                          </>
                        )}
                      </button>
                    </div>

                  </div>
                );
              })
            )}
          </div>

          {/* Simulated WhatsApp Footer */}
          <div className="bg-[#F0F2F5] p-2.5 border-t border-gray-200 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 text-slate-600 text-[11px] font-medium">
              <Smartphone className="w-4 h-4 text-emerald-700" />
              <span>Gateway otomatis terhubung ke seluruh nomor orang tua</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-mono font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              ONLINE
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default memo(WhatsAppSimulator);
