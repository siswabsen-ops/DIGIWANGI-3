import { useState, useEffect, useMemo, memo, useCallback } from 'react';
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
  CheckCircle2,
  ChevronDown,
  Users,
  RefreshCw
} from 'lucide-react';
import { Presensi, Siswa, SystemSettings, WaliKelas } from '../types';
import { getLocalDateString } from '../lib/attendanceUtils';
import {
  formatPhoneForWhatsApp,
  SERVER_WA_GATEWAY_NUMBER,
  fetchWhatsAppGatewayLogs,
  clearWhatsAppGatewayLogs,
  broadcastAllClassesToParents,
  BroadcastProgress,
  WhatsAppGatewayLog
} from '../lib/whatsappGateway';

interface WhatsAppSimulatorProps {
  logs: Presensi[];
  onClearLogs?: () => void;
  siswaList?: Siswa[];
  settings?: SystemSettings;
  waliKelasList?: WaliKelas[];
}

interface ToastNotificationInfo {
  presensi: Presensi;
  recipientRole: 'orang_tua';
  recipientName: string;
  phone: string;
  message: string;
  timestamp: string;
}

function WhatsAppSimulator({ logs = [], onClearLogs, siswaList = [], settings }: WhatsAppSimulatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeToast, setActiveToast] = useState<ToastNotificationInfo | null>(null);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('Semua Kelas');
  const [displayLimit, setDisplayLimit] = useState<number>(30);

  // Server WA Number and Reset State
  const serverWaNumber = settings?.serverWaNumber || SERVER_WA_GATEWAY_NUMBER;
  const [lastResetTimestamp, setLastResetTimestamp] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('karapres3_wa_reset_ts');
      return stored ? parseInt(stored, 10) : 0;
    } catch {
      return 0;
    }
  });
  const [isResetting, setIsResetting] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  // Broadcast to all parents state
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastProgress, setBroadcastProgress] = useState<BroadcastProgress | null>(null);
  const [broadcastNotice, setBroadcastNotice] = useState<string | null>(null);

  // Fast O(1) Lookup Maps for instant rendering
  const studentMap = useMemo(() => {
    const map = new Map<string, Siswa>();
    for (let i = 0; i < siswaList.length; i++) {
      const s = siswaList[i];
      if (s.id) map.set(s.id, s);
      if (s.nis) map.set(s.nis.trim(), s);
      if (s.nik) map.set(s.nik.trim(), s);
      if (s.nama) map.set(s.nama.trim().toLowerCase(), s);
    }
    return map;
  }, [siswaList]);

  // Fast phone resolver with O(1) cached lookup
  const resolveParentPhone = useCallback((p: Presensi): string => {
    if (!p) return '081234567890';
    let matchedPupil = p.siswaId ? studentMap.get(p.siswaId) : undefined;
    if (!matchedPupil && p.nis) matchedPupil = studentMap.get(p.nis.trim());
    if (!matchedPupil && p.nik) matchedPupil = studentMap.get(p.nik.trim());
    if (!matchedPupil && p.nama) matchedPupil = studentMap.get(p.nama.trim().toLowerCase());

    if (matchedPupil?.waOrangTua && matchedPupil.waOrangTua.trim()) {
      return matchedPupil.waOrangTua.trim();
    }
    if (p.pesanTerkirim) {
      const matchBracket = p.pesanTerkirim.match(/\((08\d+|628\d+|\+?62\d+)\)/);
      if (matchBracket) return matchBracket[1];
      const matchRaw = p.pesanTerkirim.match(/\b(08\d{8,12}|628\d{8,12})\b/);
      if (matchRaw) return matchRaw[1];
    }
    return '081234567890';
  }, [studentMap]);

  // Construct message content from template for parents
  const formatPesanWhatsAppOrangTua = useCallback((p: Presensi): string => {
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

Pesan ini dikirimkan otomatis melalui Layanan WA Gateway SDN 3 Karamatwangi. Terima kasih.`;
  }, [settings?.templatePesan]);

  // Direct WhatsApp Link
  const getDirectWhatsAppUrl = useCallback((phone: string, message: string) => {
    const cleanPhone = formatPhoneForWhatsApp(phone);
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  }, []);

  // Handle real-time custom event listener for automatic WhatsApp Gateway dispatch
  useEffect(() => {
    const handleWaSent = (e: any) => {
      const detail = e.detail;
      if (detail?.presensi) {
        setHasNewMessage(true);
        if (!isOpen) {
          const toastData: ToastNotificationInfo = {
            presensi: detail.presensi,
            recipientRole: 'orang_tua',
            recipientName: detail.recipientName || `Orang Tua ${detail.presensi.nama}`,
            phone: detail.phone || '081234567890',
            message: detail.message || '',
            timestamp: detail.presensi.waktu?.slice(0, 5) || '07:00'
          };
          setActiveToast(toastData);
          const timer = setTimeout(() => {
            setActiveToast(null);
          }, 3500);
          return () => clearTimeout(timer);
        }
      }
    };
    window.addEventListener('karapres:whatsapp_sent', handleWaSent);
    return () => window.removeEventListener('karapres:whatsapp_sent', handleWaSent);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setHasNewMessage(false);
      setActiveToast(null);
    }
  }, [isOpen]);

  // Broadcast notifikasi semua kelas ke WhatsApp masing-masing orang tua siswa
  const handleBroadcastToAllParents = useCallback(async () => {
    if (isBroadcasting) return;
    setIsBroadcasting(true);
    setBroadcastNotice(null);
    setBroadcastProgress({
      current: 0,
      total: logs.length,
      studentName: 'Menyiapkan data semua kelas...',
      kelas: '',
      phone: ''
    });

    try {
      const res = await broadcastAllClassesToParents(logs, siswaList, settings, (prog) => {
        setBroadcastProgress(prog);
      });
      setBroadcastNotice(`✓ Berhasil mengirim notifikasi ke ${res.sent} orang tua siswa untuk seluruh kelas (1-A s/d 6-B)!`);
      setTimeout(() => setBroadcastNotice(null), 5500);
    } catch (err: any) {
      console.error('Gagal broadcast ke orang tua:', err);
      setBroadcastNotice('Terjadi kesalahan saat pengiriman massal ke orang tua.');
      setTimeout(() => setBroadcastNotice(null), 4000);
    } finally {
      setIsBroadcasting(false);
      setBroadcastProgress(null);
    }
  }, [isBroadcasting, logs, siswaList, settings]);

  // Manual Reset Handler - Clears WhatsApp notifications cleanly without touching student attendance records
  const handleManualReset = useCallback(async () => {
    setIsResetting(true);
    try {
      await clearWhatsAppGatewayLogs();
      const now = Date.now();
      setLastResetTimestamp(now);
      try {
        localStorage.setItem('karapres3_wa_reset_ts', String(now));
      } catch {}
      setResetNotice('Semua notifikasi WhatsApp telah dibersihkan bersih!');
      if (onClearLogs) {
        onClearLogs();
      }
      setTimeout(() => setResetNotice(null), 3500);
    } catch (err) {
      console.error('Gagal mereset notifikasi WA:', err);
    } finally {
      setIsResetting(false);
    }
  }, [onClearLogs]);

  // Listen to background auto-reset or server clear event
  useEffect(() => {
    const handleLogsCleared = () => {
      const now = Date.now();
      setLastResetTimestamp(now);
      try {
        localStorage.setItem('karapres3_wa_reset_ts', String(now));
      } catch {}
      setResetNotice('Notifikasi WhatsApp telah dibersihkan!');
      setTimeout(() => setResetNotice(null), 3500);
    };
    window.addEventListener('karapres:whatsapp_logs_cleared', handleLogsCleared);
    return () => window.removeEventListener('karapres:whatsapp_logs_cleared', handleLogsCleared);
  }, []);

  // Copy message to clipboard
  const handleCopyMessage = useCallback(async (text: string, id: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  }, []);

  // Filter logs specifically for today (2026-10-29 and current date) and respect manual reset
  const filteredLogs = useMemo(() => {
    const search = searchFilter.trim().toLowerCase();
    const hasClassFilter = selectedClassFilter !== 'Semua Kelas';
    const todayStr = getLocalDateString();

    return logs.filter((p) => {
      // 1. Only show attendance logs from today (reset daily at 05:00 WIB)
      if (p.tanggal && p.tanggal !== todayStr) {
        return false;
      }

      // 2. If user manually clicked reset, exclude records scanned prior to reset
      if (lastResetTimestamp > 0) {
        // Live scans carry timestamp in id or create time
        const scanTimestamp = (p as any)._scannedAt || (p as any).createdAt;
        if (scanTimestamp && scanTimestamp < lastResetTimestamp) {
          return false;
        }
      }

      // 3. Class filter
      if (hasClassFilter && p.kelas !== selectedClassFilter) {
        return false;
      }

      // 4. Search query filter
      if (search) {
        const matchName = p.nama.toLowerCase().includes(search);
        const matchNis = p.nis ? p.nis.toLowerCase().includes(search) : false;
        const matchKelas = p.kelas.toLowerCase().includes(search);
        const parentPhone = resolveParentPhone(p);

        if (!matchName && !matchNis && !matchKelas && !parentPhone.includes(search)) {
          return false;
        }
      }
      return true;
    });
  }, [logs, selectedClassFilter, searchFilter, lastResetTimestamp, resolveParentPhone]);

  // Slice logs for instant, lightweight DOM rendering
  const visibleLogs = useMemo(() => {
    return filteredLogs.slice(-displayLimit);
  }, [filteredLogs, displayLimit]);

  const uniqueClasses = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < logs.length; i++) {
      if (logs[i].kelas) set.add(logs[i].kelas);
    }
    return Array.from(set).sort();
  }, [logs]);

  return (
    <>
      {/* Floating mini toast bar when student scans */}
      {!isOpen && activeToast && (
        <div
          id="wa-gateway-mini-toast"
          className="fixed bottom-20 right-4 sm:right-6 z-40 max-w-[380px] bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-2xl shadow-2xl border border-emerald-500/50 flex items-center gap-3 animate-in slide-in-from-bottom-3 fade-in duration-150 pointer-events-auto"
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md bg-emerald-600">
            <Send className="w-4 h-4 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1 font-mono text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full animate-ping bg-emerald-400" />
                NOTIFIKASI WA ORANG TUA
              </span>
              <span className="text-[9px] text-slate-400 font-mono">{activeToast.timestamp} WIB</span>
            </div>
            <p className="text-xs font-bold text-slate-100 truncate">
              {activeToast.presensi.nama} ({activeToast.presensi.kelas})
            </p>
            <p className="text-[10px] text-slate-300 truncate">
              Tujuan: <span className="font-bold text-slate-100">{activeToast.recipientName}</span> • <span className="font-mono text-amber-300 font-bold">{activeToast.phone}</span>
            </p>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <a
              href={getDirectWhatsAppUrl(activeToast.phone, activeToast.message)}
              target="_blank"
              rel="noreferrer"
              className="text-[9px] font-bold text-white px-2 py-1 rounded-lg transition-colors flex items-center gap-1 shadow-xs bg-emerald-600 hover:bg-emerald-500"
              title="Buka Chat WhatsApp"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Chat</span>
            </a>
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="text-[9px] font-semibold text-slate-300 hover:text-white underline text-center cursor-pointer"
            >
              Lihat
            </button>
          </div>
        </div>
      )}

      {/* Floating Toggle Button (Ultra Lightweight) */}
      <button
        type="button"
        id="btn-whatsapp-simulator-toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-full shadow-2xl transition-all duration-150 select-none focus:outline-none border-2 border-emerald-400/40 cursor-pointer"
      >
        <div className="relative">
          <MessageSquare className="w-5 h-5" />
          {hasNewMessage && (
            <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-rose-500 rounded-full animate-bounce border-2 border-emerald-600" />
          )}
        </div>
        <span className="font-bold text-xs tracking-wide">WA Gateway (Orang Tua Siswa)</span>
        <span className="text-[10px] bg-emerald-900/70 px-2 py-0.5 rounded-full font-mono font-bold">
          {logs.length}
        </span>
      </button>

      {/* Lightweight Simulator Modal Box */}
      {isOpen && (
        <div
          id="wa-simulator-modal"
          className="fixed bottom-22 right-4 sm:right-6 z-50 w-[440px] max-w-[calc(100vw-2rem)] bg-[#E5DDD5] rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800 flex flex-col h-[580px] max-h-[calc(100vh-7rem)] animate-in slide-in-from-bottom-4 duration-150"
        >
          {/* Virtual Phone Header */}
          <div className="bg-[#075E54] text-white p-3 flex items-center justify-between border-b border-[#128C7E] shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold shadow-xs">
                <Smartphone className="w-4 h-4 text-emerald-800" />
              </div>
              <div>
                <h4 className="font-bold text-xs tracking-wide flex items-center gap-1.5">
                  Server WA: <span className="font-mono text-amber-300 font-black">{serverWaNumber}</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Live Online" />
                </h4>
                <p className="text-[9.5px] text-emerald-100 opacity-90 font-mono">
                  Otomatis: Notifikasi Presensi Langsung ke Orang Tua Siswa
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                id="btn-wa-clear-logs"
                onClick={handleManualReset}
                disabled={isResetting}
                className="text-[9px] bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-emerald-100 px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer border border-emerald-600/50 flex items-center gap-1 shadow-xs"
                title="Hapus riwayat notifikasi WhatsApp hari ini (Rekap absensi siswa tetap tersimpan aman)"
              >
                {isResetting ? 'Membersihkan...' : 'Reset WA'}
              </button>
              <button
                type="button"
                id="btn-wa-simulator-close"
                onClick={() => setIsOpen(false)}
                className="text-white hover:text-emerald-200 p-1.5 rounded-lg hover:bg-emerald-800/60 transition-colors cursor-pointer"
                title="Tutup Panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Reset & Broadcast Feedback Notifications */}
          {resetNotice && (
            <div className="bg-emerald-800 text-white text-[10px] py-1.5 px-3 flex items-center justify-between border-b border-emerald-700 animate-in fade-in duration-150">
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                <span>{resetNotice}</span>
              </div>
              <span className="text-[9px] text-emerald-200 font-mono shrink-0">(Rekap absensi aman)</span>
            </div>
          )}

          {broadcastNotice && (
            <div className="bg-teal-800 text-white text-[10px] py-2 px-3 flex items-center justify-between border-b border-teal-700 animate-in fade-in duration-150">
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4 text-teal-300 shrink-0" />
                <span>{broadcastNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setBroadcastNotice(null)}
                className="text-white hover:text-teal-200 text-[10px] underline ml-2 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          )}

          {/* Controls Banner with Broadcast to All Parents */}
          <div className="bg-emerald-900 text-emerald-100 px-3 py-2 text-[10px] flex flex-col gap-2 border-b border-emerald-700/50 shrink-0">
            {/* Tombol Utama: Kirim Notifikasi Semua Kelas ke Orang Tua Siswa */}
            <button
              type="button"
              id="btn-broadcast-all-parents"
              onClick={handleBroadcastToAllParents}
              disabled={isBroadcasting}
              className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-98 disabled:opacity-60 text-white py-2 px-3 rounded-xl font-black text-[11px] flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer border border-emerald-400/50"
              title="Kirim notifikasi presensi hari ini untuk semua kelas (1-A s/d 6-B) langsung ke WhatsApp orang tua siswa"
            >
              {isBroadcasting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                  <span className="truncate">
                    {broadcastProgress
                      ? `Mengirim: ${broadcastProgress.current}/${broadcastProgress.total} (${broadcastProgress.studentName} - ${broadcastProgress.kelas})`
                      : 'Memproses broadcast ke orang tua...'}
                  </span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 text-amber-300" />
                  <span>📲 Kirim Notifikasi Semua Kelas ke Orang Tua</span>
                  <span className="text-[9.5px] bg-emerald-950/70 text-emerald-200 px-2 py-0.5 rounded-full font-mono font-bold">
                    {filteredLogs.length} Siswa
                  </span>
                </>
              )}
            </button>

            {/* Quick Search and Class Filter */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Cari siswa atau no WA orang tua..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full bg-emerald-950/90 text-white placeholder-emerald-400/60 text-[10px] py-1 px-2 rounded-lg border border-emerald-700/60 focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium"
                />
              </div>
              {uniqueClasses.length > 0 && (
                <select
                  value={selectedClassFilter}
                  onChange={(e) => setSelectedClassFilter(e.target.value)}
                  className="bg-emerald-950/90 text-white text-[9px] py-1 px-1.5 rounded-lg border border-emerald-700/60 focus:outline-none"
                >
                  <option value="Semua Kelas">Semua Kelas</option>
                  {uniqueClasses.map((cls) => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Chat Logs Content (Screen Area) - Khusus Notifikasi Orang Tua */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 flex flex-col-reverse justify-start">
            {filteredLogs.length === 0 ? (
              <div className="my-auto text-center px-4 py-6 bg-white/75 rounded-2xl border border-dashed border-slate-300">
                <span className="inline-block p-2.5 bg-emerald-50 rounded-full text-emerald-600 mb-2 shadow-xs">
                  <Bell className="w-5 h-5 animate-pulse" />
                </span>
                <p className="text-gray-800 font-extrabold text-xs">Belum Ada Presensi Masuk Hari Ini</p>
                <p className="text-gray-600 text-[11px] mt-1 leading-relaxed">
                  Saat siswa absensi scan QR Code, sistem otomatis langsung mengirimkan notifikasi presensi ke nomor WhatsApp Orang Tua masing-masing siswa per kelasnya.
                </p>
              </div>
            ) : (
              <>
                {visibleLogs.slice().reverse().map((log) => {
                  const formattedTime = log.waktu ? log.waktu.slice(0, 5) : '07:00';
                  const isSent = log.waStatus === 'Terkirim';
                  const parentPhone = resolveParentPhone(log);
                  const parentMessageText = formatPesanWhatsAppOrangTua(log);
                  const directUrlOrtu = getDirectWhatsAppUrl(parentPhone, parentMessageText);

                  return (
                    <div key={log.id} className="space-y-2">
                      {/* KARTU NOTIFIKASI KHUSUS ORANG TUA SISWA */}
                      <div className="self-end w-full max-w-[98%] bg-[#DCF8C6] p-2.5 rounded-2xl shadow-xs text-gray-800 relative text-xs border border-emerald-300/80">
                        <div className="text-[9px] font-black tracking-tight text-emerald-900 mb-1 pb-1 border-b border-emerald-300/60 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                            <span className="uppercase text-emerald-900 font-bold">NOTIFIKASI KE ORANG TUA SISWA</span>
                          </div>
                          <span className="font-mono text-emerald-950 font-black bg-emerald-200/90 px-1.5 py-0.2 rounded border border-emerald-300">
                            {parentPhone}
                          </span>
                        </div>

                        <div className="font-sans text-[11px] text-gray-800 leading-relaxed bg-white/85 p-2 rounded-xl border border-white/80 shadow-2xs space-y-0.5">
                          <p className="font-bold text-emerald-900 text-[10.5px]">
                            🔔 NOTIFIKASI KEHADIRAN SISWA
                          </p>
                          <p className="text-gray-700 text-[11px]">
                            Yth. Orang Tua / Wali dari <b>{log.nama}</b> ({log.kelas}).
                          </p>
                          <p className="text-gray-700 text-[11px]">
                            Status: <span className="font-black text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded uppercase">{log.status}</span> pada <b>{formattedTime} WIB</b> ({log.tanggal || getLocalDateString()}).
                          </p>
                        </div>

                        <div className="flex items-center justify-between text-[9px] text-gray-500 mt-1.5">
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

                        <div className="mt-2 pt-1.5 border-t border-emerald-300/50 grid grid-cols-2 gap-1.5">
                          <a
                            href={directUrlOrtu}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-[#075E54] hover:bg-[#128C7E] active:scale-98 text-white py-1.5 px-2 rounded-xl text-center text-[10px] font-black transition-transform flex items-center justify-center gap-1 shadow-xs"
                            title={`Buka chat WhatsApp ke nomor orang tua (${parentPhone})`}
                          >
                            <Phone className="w-3 h-3 text-emerald-200" />
                            <span>Kirim ke WA</span>
                            <ExternalLink className="w-2.5 h-2.5 ml-0.5 opacity-80" />
                          </a>

                          <button
                            type="button"
                            onClick={() => handleCopyMessage(parentMessageText, `${log.id}-ortu`)}
                            className={`py-1.5 px-2 rounded-xl text-center text-[10px] font-bold transition-all flex items-center justify-center gap-1 border cursor-pointer ${
                              copiedId === `${log.id}-ortu`
                                ? 'bg-emerald-800 text-white border-emerald-900 shadow-xs'
                                : 'bg-white/90 hover:bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            {copiedId === `${log.id}-ortu` ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-300" />
                                <span>Tersalin!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-slate-500" />
                                <span>Salin Teks</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredLogs.length > displayLimit && (
                  <button
                    type="button"
                    onClick={() => setDisplayLimit((prev) => prev + 30)}
                    className="w-full py-1.5 bg-white/80 hover:bg-white text-emerald-800 text-[10px] font-bold rounded-xl border border-emerald-200 flex items-center justify-center gap-1 shadow-xs cursor-pointer mb-2"
                  >
                    <span>Muat 30 Lagi...</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default memo(WhatsAppSimulator);
