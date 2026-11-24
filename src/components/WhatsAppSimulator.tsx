import { useState, useEffect, useMemo, memo, useCallback } from 'react';
import {
  MessageSquare,
  Bell,
  Smartphone,
  X,
  Check,
  CheckCheck,
  Send,
  Copy,
  ExternalLink,
  Phone,
  CheckCircle2,
  ChevronDown,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { Presensi, Siswa, SystemSettings, WaliKelas } from '../types';
import { getLocalDateString, normalizeDateKey, safeAddDays } from '../lib/attendanceUtils';
import {
  formatPhoneForWhatsApp,
  SERVER_WA_GATEWAY_NUMBER,
  clearWhatsAppGatewayLogs,
  broadcastAllClassesToParents,
  sendSingleGatewayNotification,
  fetchServerGatewayStatus,
  resolveStudentForRecord,
  resolveParentPhoneForRecord,
  getDirectWhatsAppUrl,
  isGatewayApiConfigured,
  formatWhatsAppAttendanceMessage,
  BroadcastProgress,
  DirectQueueItem
} from '../lib/whatsappGateway';

interface WhatsAppSimulatorProps {
  logs: Presensi[];
  onClearLogs?: () => void;
  siswaList?: Siswa[];
  settings?: SystemSettings;
  waliKelasList?: WaliKelas[];
  onUpdatePresensiWaStatus?: (
    updates: Array<{ id: string; siswaId: string; tanggal: string; waStatus: 'Pending' | 'Terkirim' | 'Gagal'; phone: string }>
  ) => void;
}

interface ToastNotificationInfo {
  presensi: Presensi;
  recipientRole: 'orang_tua';
  recipientName: string;
  phone: string;
  message: string;
  timestamp: string;
  deliveryStatus?: string;
}

function WhatsAppSimulator({
  logs = [],
  onClearLogs,
  siswaList = [],
  settings,
  onUpdatePresensiWaStatus
}: WhatsAppSimulatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeToast, setActiveToast] = useState<ToastNotificationInfo | null>(null);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('Semua Kelas');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>(() => getLocalDateString());
  const [waStatusFilter, setWaStatusFilter] = useState<'semua' | 'belum' | 'terkirim' | 'gagal'>('semua');
  const [broadcastOnlyPending, setBroadcastOnlyPending] = useState<boolean>(false);
  const [displayLimit, setDisplayLimit] = useState<number>(30);
  const [sendingSingleId, setSendingSingleId] = useState<string | null>(null);
  const [serverApiStatus, setServerApiStatus] = useState<{ apiConfigured: boolean; serverWaNumber: string } | null>(null);

  // Server WA Number and Reset State
  const serverWaNumber = settings?.serverWaNumber || serverApiStatus?.serverWaNumber || SERVER_WA_GATEWAY_NUMBER;
  const apiModeActive = isGatewayApiConfigured(settings) || Boolean(serverApiStatus?.apiConfigured);
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

  // Broadcast & Direct WA Queue state
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastProgress, setBroadcastProgress] = useState<BroadcastProgress | null>(null);
  const [broadcastNotice, setBroadcastNotice] = useState<string | null>(null);
  const [directQueue, setDirectQueue] = useState<DirectQueueItem[]>([]);
  const [sentQueueIds, setSentQueueIds] = useState<Record<string, boolean>>({});
  const [activeQueueIndex, setActiveQueueIndex] = useState<number>(0);

  useEffect(() => {
    if (!isOpen) return;
    fetchServerGatewayStatus().then((st) => {
      setServerApiStatus({ apiConfigured: st.apiConfigured, serverWaNumber: st.serverWaNumber });
    }).catch(() => {});
  }, [isOpen]);

  // Collision-safe phone resolver using siswaId -> nama+kelas -> unique NIK/NIS (returns '' if missing)
  const resolveParentPhone = useCallback((p: Presensi): string => {
    const matched = resolveStudentForRecord(p, siswaList);
    return resolveParentPhoneForRecord(p, matched, siswaList);
  }, [siswaList]);

  // Construct message content from template for parents
  const formatPesanWhatsAppOrangTua = useCallback((p: Presensi): string => {
    const matched = resolveStudentForRecord(p, siswaList);
    return formatWhatsAppAttendanceMessage(p, matched, settings);
  }, [siswaList, settings]);

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
            phone: formatPhoneForWhatsApp(detail.phone) || '',
            message: detail.message || '',
            timestamp: detail.presensi.waktu?.slice(0, 5) || '07:00',
            deliveryStatus: detail.status
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

  // Available dates in logs (always includes Today & Yesterday)
  const availableDates = useMemo(() => {
    const todayStr = getLocalDateString();
    const yesterdayStr = safeAddDays(todayStr, -1);
    const set = new Set<string>([todayStr, yesterdayStr]);
    for (let i = 0; i < logs.length; i++) {
      if (logs[i]?.tanggal) {
        set.add(normalizeDateKey(logs[i].tanggal));
      }
    }
    return Array.from(set).sort().reverse();
  }, [logs]);

  // Keep selectedDateFilter valid
  useEffect(() => {
    const todayStr = getLocalDateString();
    if (!selectedDateFilter) setSelectedDateFilter(todayStr);
  }, [selectedDateFilter]);

  // Filter & urutkan log terbaru di atas (perbaikan agar Kelas 1-A..5-A tidak terpotong)
  const filteredLogs = useMemo(() => {
    const search = searchFilter.trim().toLowerCase();
    const hasClassFilter = selectedClassFilter !== 'Semua Kelas';
    const targetDate = normalizeDateKey(selectedDateFilter || getLocalDateString());
    const todayStr = getLocalDateString();

    const matched = logs.filter((p) => {
      if (!p) return false;
      const pDate = p.tanggal ? normalizeDateKey(p.tanggal) : todayStr;
      if (pDate !== targetDate) {
        return false;
      }

      if (pDate === todayStr && lastResetTimestamp > 0) {
        const scanTimestamp = (p as any)._scannedAt || (p as any).createdAt;
        if (scanTimestamp && scanTimestamp < lastResetTimestamp) {
          return false;
        }
      }

      if (hasClassFilter && p.kelas !== selectedClassFilter) {
        return false;
      }

      const parentPhone = resolveParentPhone(p);
      if (waStatusFilter === 'terkirim' && p.waStatus !== 'Terkirim') return false;
      if (waStatusFilter === 'belum' && (p.waStatus === 'Terkirim' || !parentPhone)) return false;
      if (waStatusFilter === 'gagal' && p.waStatus !== 'Gagal' && Boolean(parentPhone)) return false;

      if (search) {
        const matchName = p.nama.toLowerCase().includes(search);
        const matchNis = p.nis ? p.nis.toLowerCase().includes(search) : false;
        const matchKelas = p.kelas.toLowerCase().includes(search);

        if (!matchName && !matchNis && !matchKelas && !parentPhone.includes(search)) {
          return false;
        }
      }
      return true;
    });

    return matched.slice().sort((a, b) => {
      const wDiff = (b.waktu || '').localeCompare(a.waktu || '');
      if (wDiff !== 0) return wDiff;
      const uDiff = (b.updatedAt || 0) - (a.updatedAt || 0);
      if (uDiff !== 0) return uDiff;
      return (a.kelas || '').localeCompare(b.kelas || '') || (a.nama || '').localeCompare(b.nama || '');
    });
  }, [logs, selectedDateFilter, selectedClassFilter, searchFilter, waStatusFilter, lastResetTimestamp, resolveParentPhone]);

  // Exact parent phone coverage summary for current filter
  const phoneSummary = useMemo(() => {
    let withPhone = 0;
    let missingPhone = 0;
    let pendingWithPhone = 0;
    let sentCount = 0;
    for (let i = 0; i < filteredLogs.length; i++) {
      const rec = filteredLogs[i];
      if (resolveParentPhone(rec)) {
        withPhone++;
        if (rec.waStatus === 'Terkirim') sentCount++;
        else pendingWithPhone++;
      } else {
        missingPhone++;
      }
    }
    return { withPhone, missingPhone, pendingWithPhone, sentCount };
  }, [filteredLogs, resolveParentPhone]);

  // Broadcast target list (semua atau hanya yang belum terkirim)
  const broadcastTargets = useMemo(() => {
    if (!broadcastOnlyPending) return filteredLogs;
    return filteredLogs.filter((p) => p.waStatus !== 'Terkirim');
  }, [filteredLogs, broadcastOnlyPending]);

  // Broadcast notifikasi semua kelas (atau kelas terpilih) ke WhatsApp masing-masing orang tua siswa
  const handleBroadcastToAllParents = useCallback(async () => {
    if (isBroadcasting || broadcastTargets.length === 0) return;
    setIsBroadcasting(true);
    setBroadcastNotice(null);
    setDirectQueue([]);
    setSentQueueIds({});
    setActiveQueueIndex(0);
    setBroadcastProgress({
      current: 0,
      total: broadcastTargets.length,
      studentName: 'Menyiapkan data siswa...',
      kelas: '',
      phone: ''
    });

    try {
      const res = await broadcastAllClassesToParents(broadcastTargets, siswaList, settings, (prog) => {
        setBroadcastProgress(prog);
      });

      if (res.updatedWaStatuses.length > 0 && onUpdatePresensiWaStatus) {
        onUpdatePresensiWaStatus(res.updatedWaStatuses);
      }

      if (res.directQueue.length > 0) {
        setDirectQueue(res.directQueue);
        setActiveQueueIndex(0);
      }

      const summaryParts: string[] = [];
      if (res.sentApi > 0) summaryParts.push(`${res.sentApi} Terkirim via API`);
      if (res.queuedDirect > 0) summaryParts.push(`${res.queuedDirect} Siap Antrean WA Langsung`);
      if (res.failed > 0) summaryParts.push(`${res.failed} Tanpa No WA / Gagal`);
      setBroadcastNotice(`✓ Selesai diproses (${selectedClassFilter}): ${summaryParts.join(' • ')}`);
      setTimeout(() => setBroadcastNotice(null), 7000);
    } catch (err: any) {
      console.error('Gagal broadcast ke orang tua:', err);
      setBroadcastNotice('Terjadi kesalahan saat memproses pengiriman ke orang tua.');
      setTimeout(() => setBroadcastNotice(null), 4000);
    } finally {
      setIsBroadcasting(false);
      setBroadcastProgress(null);
    }
  }, [isBroadcasting, broadcastTargets, siswaList, settings, onUpdatePresensiWaStatus, selectedClassFilter]);

  const handleSendSingleApi = useCallback(async (log: Presensi) => {
    const matchedSiswa = resolveStudentForRecord(log, siswaList);
    const parentPhone = resolveParentPhoneForRecord(log, matchedSiswa, siswaList);
    if (!parentPhone) return;
    const msg = formatWhatsAppAttendanceMessage(log, matchedSiswa, settings);
    setSendingSingleId(log.id);
    try {
      const res = await sendSingleGatewayNotification(
        log,
        matchedSiswa,
        parentPhone,
        msg,
        'orang_tua',
        `Orang Tua / Wali Murid dari ${log.nama}`,
        settings
      );
      const waStatus: 'Pending' | 'Terkirim' | 'Gagal' =
        res.deliveryStatus === 'DELIVERED' || res.deliveryStatus === 'SENT'
          ? 'Terkirim'
          : res.deliveryStatus === 'FAILED'
          ? 'Gagal'
          : 'Pending';
      if (onUpdatePresensiWaStatus) {
        onUpdatePresensiWaStatus([{
          id: log.id,
          siswaId: log.siswaId,
          tanggal: log.tanggal,
          waStatus,
          phone: parentPhone
        }]);
      }
      setBroadcastNotice(
        waStatus === 'Terkirim'
          ? `✓ Notifikasi ${log.nama} terkirim via API ke +${parentPhone}`
          : waStatus === 'Gagal'
          ? `✕ Gagal kirim API ke +${parentPhone}: ${res.error || 'Periksa token gateway'}`
          : `ℹ Masuk antrean langsung untuk +${parentPhone}`
      );
      setTimeout(() => setBroadcastNotice(null), 4500);
    } finally {
      setSendingSingleId(null);
    }
  }, [siswaList, settings, onUpdatePresensiWaStatus]);

  const handleMarkQueueItemSent = useCallback((item: DirectQueueItem, idx: number) => {
    setSentQueueIds((prev) => ({ ...prev, [item.id]: true }));
    if (onUpdatePresensiWaStatus) {
      onUpdatePresensiWaStatus([
        {
          id: item.presensi.id,
          siswaId: item.presensi.siswaId,
          tanggal: item.presensi.tanggal,
          waStatus: 'Terkirim',
          phone: item.phone
        }
      ]);
    }
    if (idx + 1 < directQueue.length) {
      setActiveQueueIndex(idx + 1);
    }
  }, [directQueue.length, onUpdatePresensiWaStatus]);

  const handleMarkAllQueueSent = useCallback(() => {
    if (directQueue.length === 0) return;
    const nextSent: Record<string, boolean> = {};
    const updates = directQueue.map((item) => {
      nextSent[item.id] = true;
      return {
        id: item.presensi.id,
        siswaId: item.presensi.siswaId,
        tanggal: item.presensi.tanggal,
        waStatus: 'Terkirim' as const,
        phone: item.phone
      };
    });
    setSentQueueIds((prev) => ({ ...prev, ...nextSent }));
    if (onUpdatePresensiWaStatus) {
      onUpdatePresensiWaStatus(updates);
    }
    setBroadcastNotice(`✓ ${directQueue.length} antrean notifikasi orang tua ditandai Terkirim.`);
    setTimeout(() => setBroadcastNotice(null), 4500);
  }, [directQueue, onUpdatePresensiWaStatus]);

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
      setDirectQueue([]);
      setResetNotice('Riwayat tampilan notifikasi WhatsApp dibersihkan!');
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

  // Slice logs from top (newest first)
  const visibleLogs = useMemo(() => {
    return filteredLogs.slice(0, displayLimit);
  }, [filteredLogs, displayLimit]);

  const uniqueClasses = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < logs.length; i++) {
      if (logs[i].kelas) set.add(logs[i].kelas);
    }
    return Array.from(set).sort();
  }, [logs]);

  const todayCount = useMemo(() => {
    const todayStr = getLocalDateString();
    return logs.filter((p) => p && normalizeDateKey(p.tanggal) === todayStr).length;
  }, [logs]);

  const currentQueueItem = directQueue[activeQueueIndex];
  const sentQueueCount = useMemo(
    () => directQueue.filter((item) => sentQueueIds[item.id]).length,
    [directQueue, sentQueueIds]
  );

  return (
    <>
      {/* Floating mini toast bar when student scans */}
      {!isOpen && activeToast && (
        <div
          id="wa-gateway-mini-toast"
          className="fixed bottom-20 right-4 sm:right-6 z-40 max-w-[380px] bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-2xl shadow-2xl border border-emerald-500/50 flex items-center gap-3 animate-in slide-in-from-bottom-3 fade-in duration-150 pointer-events-auto"
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md ${activeToast.phone ? 'bg-emerald-600' : 'bg-rose-600'}`}>
            {activeToast.phone ? <Send className="w-4 h-4 animate-pulse" /> : <AlertTriangle className="w-4 h-4" />}
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
              {activeToast.phone ? (
                <>
                  Tujuan: <span className="font-bold text-slate-100">{activeToast.recipientName}</span> • <span className="font-mono text-amber-300 font-bold">+{activeToast.phone}</span>
                </>
              ) : (
                <span className="text-rose-300 font-bold">No WA Orang Tua belum diisi</span>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            {activeToast.phone ? (
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
            ) : (
              <span className="text-[9px] font-bold text-rose-300 px-1.5 py-0.5 rounded bg-rose-950/60 text-center">
                Kosong
              </span>
            )}
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
          {todayCount}
        </span>
      </button>

      {/* Lightweight Simulator Modal Box */}
      {isOpen && (
        <div
          id="wa-simulator-modal"
          className="fixed bottom-22 right-4 sm:right-6 z-50 w-[460px] max-w-[calc(100vw-2rem)] bg-[#E5DDD5] rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800 flex flex-col h-[620px] max-h-[calc(100vh-7rem)] animate-in slide-in-from-bottom-4 duration-150"
        >
          {/* Virtual Phone Header */}
          <div className="bg-[#075E54] text-white p-3 flex items-center justify-between border-b border-[#128C7E] shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold shadow-xs shrink-0">
                <Smartphone className="w-4 h-4 text-emerald-800" />
              </div>
              <div className="min-w-0">
                <h4 className="font-bold text-xs tracking-wide flex items-center gap-1.5 truncate">
                  Server WA: <span className="font-mono text-amber-300 font-black">{serverWaNumber}</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" title="Live Online" />
                </h4>
                <p className="text-[9.5px] text-emerald-100 opacity-90 font-mono truncate">
                  {apiModeActive ? 'API Gateway Otomatis Aktif' : 'Mode Langsung WA (wa.me) • Antrean per Orang Tua'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                id="btn-wa-clear-logs"
                onClick={handleManualReset}
                disabled={isResetting}
                className="text-[9px] bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-emerald-100 px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer border border-emerald-600/50 flex items-center gap-1 shadow-xs"
                title="Bersihkan tampilan log WhatsApp hari ini (Rekap absensi tetap aman)"
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
            <div className="bg-emerald-800 text-white text-[10px] py-1.5 px-3 flex items-center justify-between border-b border-emerald-700 animate-in fade-in duration-150 shrink-0">
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                <span>{resetNotice}</span>
              </div>
              <span className="text-[9px] text-emerald-200 font-mono shrink-0">(Rekap absensi aman)</span>
            </div>
          )}

          {broadcastNotice && (
            <div className="bg-teal-800 text-white text-[10px] py-2 px-3 flex items-center justify-between border-b border-teal-700 animate-in fade-in duration-150 shrink-0">
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4 text-teal-300 shrink-0" />
                <span>{broadcastNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setBroadcastNotice(null)}
                className="text-white hover:text-teal-200 text-[10px] underline ml-2 cursor-pointer shrink-0"
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
              disabled={isBroadcasting || broadcastTargets.length === 0}
              className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-98 disabled:opacity-60 text-white py-2 px-3 rounded-xl font-black text-[11px] flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer border border-emerald-400/50"
              title="Kirim notifikasi presensi sesuai filter tanggal & kelas langsung ke WhatsApp masing-masing orang tua siswa"
            >
              {isBroadcasting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                  <span className="truncate">
                    {broadcastProgress
                      ? `Memproses: ${broadcastProgress.current}/${broadcastProgress.total} (${broadcastProgress.studentName})`
                      : 'Memproses notifikasi orang tua...'}
                  </span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 text-amber-300" />
                  <span>📲 Kirim Kolektif ke WA Orang Tua</span>
                  <span className="text-[9.5px] bg-emerald-950/70 text-emerald-200 px-2 py-0.5 rounded-full font-mono font-bold">
                    {broadcastOnlyPending ? `${phoneSummary.pendingWithPhone} Belum` : `${phoneSummary.withPhone}/${filteredLogs.length} Valid`}
                  </span>
                </>
              )}
            </button>

            {/* Coverage Bar & Target Mode Toggle */}
            <div className="flex items-center justify-between text-[9.5px] bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-800/70 gap-1">
              <span className="text-emerald-200 font-semibold truncate">
                Valid: <b className="text-emerald-300 font-mono">{phoneSummary.withPhone}</b> • Terkirim: <b className="text-sky-300 font-mono">{phoneSummary.sentCount}</b> • Kosong: <b className="text-amber-300 font-mono">{phoneSummary.missingPhone}</b>
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setBroadcastOnlyPending((prev) => !prev)}
                  className={`font-bold px-1.5 py-0.2 rounded cursor-pointer border ${broadcastOnlyPending ? 'bg-amber-600 text-white border-amber-400' : 'bg-emerald-900/70 text-emerald-200 border-emerald-700'}`}
                  title="Pilih kirim hanya yang belum terkirim atau semua siswa valid"
                >
                  {broadcastOnlyPending ? 'Hanya Belum' : 'Semua Valid'}
                </button>
                <span className={`font-mono font-bold px-1.5 py-0.2 rounded ${apiModeActive ? 'bg-emerald-700 text-white' : 'bg-amber-900/80 text-amber-200'}`}>
                  {apiModeActive ? 'API Auto' : 'WA Direct'}
                </span>
              </div>
            </div>

            {/* Date Filter + Quick Search + Class Filter */}
            <div className="grid grid-cols-12 gap-1.5">
              <select
                value={selectedDateFilter}
                onChange={(e) => {
                  setSelectedDateFilter(e.target.value);
                  setDisplayLimit(30);
                }}
                aria-label="Pilih Tanggal Notifikasi WA"
                className="col-span-4 bg-emerald-950/90 text-white text-[9.5px] py-1 px-1.5 rounded-lg border border-emerald-700/60 focus:outline-none font-bold"
              >
                {availableDates.map((dt) => {
                  const todayStr = getLocalDateString();
                  const yestStr = safeAddDays(todayStr, -1);
                  const label =
                    dt === todayStr
                      ? `Hari Ini (${dt})`
                      : dt === yestStr
                      ? `Kemarin (${dt})`
                      : dt;
                  return (
                    <option key={dt} value={dt}>{label}</option>
                  );
                })}
              </select>

              <input
                type="text"
                placeholder="Cari siswa / No WA..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="col-span-5 bg-emerald-950/90 text-white placeholder-emerald-400/60 text-[10px] py-1 px-2 rounded-lg border border-emerald-700/60 focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium"
              />

              <select
                value={selectedClassFilter}
                onChange={(e) => setSelectedClassFilter(e.target.value)}
                className="col-span-3 bg-emerald-950/90 text-white text-[9.5px] py-1 px-1 rounded-lg border border-emerald-700/60 focus:outline-none"
              >
                <option value="Semua Kelas">Semua Kelas</option>
                {uniqueClasses.map((cls) => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            </div>

            {/* WA Status Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto">
              {([
                { id: 'semua', label: 'Semua' },
                { id: 'belum', label: 'Belum Terkirim' },
                { id: 'terkirim', label: 'Terkirim' },
                { id: 'gagal', label: 'Gagal / Kosong' }
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setWaStatusFilter(tab.id);
                    setDisplayLimit(30);
                  }}
                  className={`px-2 py-0.5 rounded-md text-[9px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                    waStatusFilter === tab.id
                      ? 'bg-amber-400 text-slate-950 shadow-2xs'
                      : 'bg-emerald-950/70 text-emerald-200 hover:bg-emerald-800/70'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Sequential Direct WhatsApp Queue Drawer (when API token not set) */}
          {directQueue.length > 0 && currentQueueItem && (
            <div className="bg-amber-50 border-b border-amber-300 px-3 py-2.5 text-[10px] text-amber-950 shrink-0 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-black text-amber-900 uppercase tracking-wide flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5 text-emerald-700" />
                  Antrean Kirim WA ({sentQueueCount}/{directQueue.length} dikirim)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleMarkAllQueueSent}
                    className="text-emerald-800 hover:text-emerald-950 font-black underline cursor-pointer"
                  >
                    Tandai Semua Terkirim
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirectQueue([])}
                    className="text-amber-800 hover:text-amber-950 font-bold underline cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              </div>
              <div className="w-full bg-amber-200 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-600 h-full transition-all duration-150"
                  style={{ width: `${directQueue.length > 0 ? Math.round((sentQueueCount / directQueue.length) * 100) : 0}%` }}
                />
              </div>
              <div className="bg-white border border-amber-200 rounded-xl p-2 flex items-center justify-between gap-2 shadow-2xs">
                <div className="min-w-0">
                  <p className="font-black text-slate-800 truncate">
                    #{activeQueueIndex + 1}. {currentQueueItem.presensi.nama} ({currentQueueItem.presensi.kelas})
                  </p>
                  <p className="font-mono font-bold text-emerald-700">
                    Tujuan WA Ortu: +{currentQueueItem.phone}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={currentQueueItem.waUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => handleMarkQueueItemSent(currentQueueItem, activeQueueIndex)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-xs"
                  >
                    <Send className="w-3 h-3" />
                    <span>Kirim ({activeQueueIndex + 1}/{directQueue.length})</span>
                  </a>
                  {activeQueueIndex + 1 < directQueue.length && (
                    <button
                      type="button"
                      onClick={() => setActiveQueueIndex((prev) => Math.min(directQueue.length - 1, prev + 1))}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2 py-1.5 rounded-lg cursor-pointer"
                    >
                      Lewati
                    </button>
                  )}
                </div>
              </div>
              {/* Quick queue pills to jump to any student directly */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                {directQueue.slice(0, 40).map((q, qIdx) => {
                  const done = Boolean(sentQueueIds[q.id]);
                  const isActive = qIdx === activeQueueIndex;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setActiveQueueIndex(qIdx)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap cursor-pointer border ${
                        done
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : isActive
                          ? 'bg-amber-600 text-white border-amber-700'
                          : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      {done ? '✓ ' : `${qIdx + 1}. `}{q.presensi.nama.split(' ')[0]}
                    </button>
                  );
                })}
                {directQueue.length > 40 && (
                  <span className="text-[9px] text-amber-800 font-bold px-1">+{directQueue.length - 40} lainnya</span>
                )}
              </div>
            </div>
          )}

          {/* Chat Logs Content (Screen Area) - Terbaru di atas */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 flex flex-col justify-start">
            {filteredLogs.length === 0 ? (
              <div className="my-auto text-center px-4 py-6 bg-white/75 rounded-2xl border border-dashed border-slate-300">
                <span className="inline-block p-2.5 bg-emerald-50 rounded-full text-emerald-600 mb-2 shadow-xs">
                  <Bell className="w-5 h-5 animate-pulse" />
                </span>
                <p className="text-gray-800 font-extrabold text-xs">
                  Belum Ada Data Presensi ({selectedDateFilter})
                </p>
                <p className="text-gray-600 text-[11px] mt-1 leading-relaxed">
                  Saat siswa absensi scan QR Code atau di-tap Wali Kelas, notifikasi diarahkan otomatis ke nomor WhatsApp Orang Tua masing-masing siswa sesuai data profil.
                </p>
              </div>
            ) : (
              <>
                {visibleLogs.map((log) => {
                  const formattedTime = log.waktu ? log.waktu.slice(0, 5) : '07:00';
                  const isSent = log.waStatus === 'Terkirim';
                  const isFailed = log.waStatus === 'Gagal';
                  const parentPhone = resolveParentPhone(log);
                  const hasPhone = Boolean(parentPhone);
                  const parentMessageText = formatPesanWhatsAppOrangTua(log);
                  const directUrlOrtu = hasPhone ? getDirectWhatsAppUrl(parentPhone, parentMessageText) : '';
                  const isSendingThis = sendingSingleId === log.id;

                  return (
                    <div key={log.id} className="space-y-2">
                      {/* KARTU NOTIFIKASI KHUSUS ORANG TUA SISWA */}
                      <div className="w-full bg-[#DCF8C6] p-2.5 rounded-2xl shadow-xs text-gray-800 relative text-xs border border-emerald-300/80">
                        <div className="text-[9px] font-black tracking-tight text-emerald-900 mb-1 pb-1 border-b border-emerald-300/60 flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1 min-w-0">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                            <span className="uppercase text-emerald-900 font-bold truncate">NOTIFIKASI KE ORANG TUA</span>
                          </div>
                          {hasPhone ? (
                            <span className="font-mono text-emerald-950 font-black bg-emerald-200/90 px-1.5 py-0.2 rounded border border-emerald-300 shrink-0">
                              +{parentPhone}
                            </span>
                          ) : (
                            <span className="font-mono text-rose-800 font-black bg-rose-100 px-1.5 py-0.2 rounded border border-rose-300 shrink-0">
                              No WA Belum Diisi
                            </span>
                          )}
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

                        <div className="flex items-center justify-between text-[9px] text-gray-600 mt-1.5 gap-1">
                          <span className="text-slate-600 font-medium truncate">
                            {log.operator ? log.operator.split(',')[0] : 'Sistem Gerbang'} •{' '}
                            <span className={`font-bold ${isSent ? 'text-emerald-700' : isFailed || !hasPhone ? 'text-rose-600' : 'text-amber-700'}`}>
                              {!hasPhone ? 'No WA Kosong' : isSent ? 'Terkirim' : isFailed ? 'Gagal' : 'Siap Kirim'}
                            </span>
                          </span>
                          <div className="flex items-center gap-1 font-mono font-bold shrink-0">
                            <span>{formattedTime}</span>
                            {isSent ? (
                              <CheckCheck className="w-3.5 h-3.5 text-blue-600" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-gray-400" />
                            )}
                          </div>
                        </div>

                        <div className={`mt-2 pt-1.5 border-t border-emerald-300/50 grid gap-1.5 ${apiModeActive && hasPhone ? 'grid-cols-3' : 'grid-cols-2'}`}>
                          {hasPhone && apiModeActive && (
                            <button
                              type="button"
                              disabled={isSendingThis}
                              onClick={() => handleSendSingleApi(log)}
                              className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white py-1.5 px-2 rounded-xl text-center text-[10px] font-black transition-all flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                              title={`Kirim otomatis via Gateway API ke +${parentPhone}`}
                            >
                              {isSendingThis ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                              <span>{isSendingThis ? 'Kirim...' : 'Kirim API'}</span>
                            </button>
                          )}

                          {hasPhone ? (
                            <a
                              href={directUrlOrtu}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => {
                                if (onUpdatePresensiWaStatus) {
                                  onUpdatePresensiWaStatus([
                                    {
                                      id: log.id,
                                      siswaId: log.siswaId,
                                      tanggal: log.tanggal,
                                      waStatus: 'Terkirim',
                                      phone: parentPhone
                                    }
                                  ]);
                                }
                              }}
                              className="bg-[#075E54] hover:bg-[#128C7E] active:scale-98 text-white py-1.5 px-2 rounded-xl text-center text-[10px] font-black transition-transform flex items-center justify-center gap-1 shadow-xs"
                              title={`Buka chat WhatsApp ke nomor orang tua (+${parentPhone})`}
                            >
                              <Phone className="w-3 h-3 text-emerald-200" />
                              <span>{apiModeActive ? 'wa.me' : 'Kirim ke WA'}</span>
                              <ExternalLink className="w-2.5 h-2.5 ml-0.5 opacity-80" />
                            </a>
                          ) : (
                            <span
                              className="bg-slate-200 text-slate-500 py-1.5 px-2 rounded-xl text-center text-[10px] font-bold flex items-center justify-center gap-1 cursor-not-allowed"
                              title="Isi nomor WA Orang Tua terlebih dahulu di Data Siswa Admin"
                            >
                              <AlertTriangle className="w-3 h-3 text-rose-500" />
                              <span>No WA Kosong</span>
                            </span>
                          )}

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
                    <span>Muat 30 Lagi ({filteredLogs.length - displayLimit} tersisa)...</span>
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

