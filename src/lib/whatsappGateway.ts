import { Presensi, Siswa, SystemSettings, WaliKelas, normalizeKelasCode } from '../types';
import { getLocalDateString, getLocalTimeString, normalizeDateKey, normalizeStudentName } from './attendanceUtils';

export const SERVER_WA_GATEWAY_NUMBER = '08214134551';
const PLACEHOLDER_API_KEYS = new Set(['', 'KARA3_WS_GATEWAY_v2', 'DEMO_KEY']);

export interface WhatsAppGatewayLog {
  id: string;
  studentName: string;
  kelas: string;
  status: string;
  phone: string;
  message: string;
  deliveryStatus: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'READ';
  recipientRole?: 'wali_kelas' | 'orang_tua' | 'guru' | 'admin';
  recipientName?: string;
  gateway: string;
  timestamp: string;
  error?: string;
}

export interface DirectQueueItem {
  id: string;
  presensi: Presensi;
  siswa?: Siswa;
  phone: string;
  message: string;
  waUrl: string;
  sentManually?: boolean;
}

const LOCAL_WA_LOGS_KEY = 'karapres3_wa_logs_v1';

function getLocalWibCutoffMs(): number {
  const now = new Date();
  const wibDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now);
  const wibHour = parseInt(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }).format(now),
    10
  );
  let targetDateStr = wibDate;
  if (wibHour < 5) {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    targetDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(yesterday);
  }
  return new Date(`${targetDateStr}T05:00:00+07:00`).getTime();
}

function readLocalWaLogs(): WhatsAppGatewayLog[] {
  try {
    const raw = localStorage.getItem(LOCAL_WA_LOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = getLocalWibCutoffMs();
    return parsed.filter((l: any) => {
      const t = new Date(l.timestamp).getTime();
      return !isNaN(t) && t >= cutoff;
    });
  } catch {
    return [];
  }
}

function appendLocalWaLog(entry: WhatsAppGatewayLog) {
  try {
    const list = readLocalWaLogs();
    list.unshift(entry);
    if (list.length > 300) list.length = 300;
    localStorage.setItem(LOCAL_WA_LOGS_KEY, JSON.stringify(list));
  } catch {}
}

/**
 * Mengambil log pengiriman gateway dari server (atau cache harian lokal bila berjalan di hosting statis)
 */
export async function fetchWhatsAppGatewayLogs(): Promise<{ success: boolean; logs: WhatsAppGatewayLog[] }> {
  try {
    const res = await fetch('/api/whatsapp/logs');
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.toLowerCase().includes('application/json')) {
      const data = await res.json();
      return { success: true, logs: data.logs || [] };
    }
  } catch {
    // fallback to local logs
  }
  return { success: true, logs: readLocalWaLogs() };
}

/**
 * Membersihkan seluruh log notifikasi WhatsApp gateway
 */
export async function clearWhatsAppGatewayLogs(): Promise<boolean> {
  try { localStorage.removeItem(LOCAL_WA_LOGS_KEY); } catch {}
  try {
    const res = await fetch('/api/whatsapp/clear', { method: 'POST' });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.toLowerCase().includes('application/json')) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('karapres:whatsapp_logs_cleared'));
      }
      return true;
    }
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('karapres:whatsapp_logs_cleared'));
  }
  return true;
}

const KNOWN_INTL_PREFIXES = ['966', '971', '974', '886', '852', '60', '65', '62', '61', '81', '82', '44'];

/**
 * Standardize Indonesian (628...) and explicit international (+966..., 966..., +60...) phone numbers for WhatsApp.
 * Returns '' if missing, empty, or invalid (< 10 digits).
 */
export function formatPhoneForWhatsApp(rawPhone?: string): string {
  if (!rawPhone) return '';
  const trimmed = String(rawPhone).trim();
  if (!trimmed || trimmed === '-' || trimmed.toUpperCase() === 'TIDAK TERDAFTAR') return '';
  const hasExplicitPlus = trimmed.startsWith('+');
  let clean = trimmed.replace(/\D/g, '');
  if (clean.length < 9) return '';

  // Strip 00 international dial prefix (e.g. 0062... or 00966...)
  if (clean.startsWith('00') && clean.length >= 11) {
    clean = clean.slice(2);
  }

  if (hasExplicitPlus) {
    // Keep international numbers starting with + after stripping non-digits; fix +08... edge case
    if (clean.startsWith('0')) {
      clean = '62' + clean.slice(1);
    }
  } else if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('62')) {
    // Already Indonesian 62 format
  } else if (KNOWN_INTL_PREFIXES.some((prefix) => clean.startsWith(prefix)) && clean.length >= 10) {
    // Already includes known international country code (e.g., 966500391529)
  } else if (clean.startsWith('1') && clean.length === 11) {
    // US/Canada 1XXXXXXXXXX
  } else {
    // Indonesian mobile written without leading 0 (e.g., 81234567890)
    clean = '62' + clean;
  }

  if (clean.length < 10 || clean.length > 16 || clean === '6281234567890') return '';
  return clean;
}

export function hasValidParentPhone(rawPhone?: string): boolean {
  return formatPhoneForWhatsApp(rawPhone).length >= 10;
}

export interface ServerGatewayStatus {
  hasBackend: boolean;
  apiConfigured: boolean;
  provider: string;
  serverWaNumber: string;
}

export async function fetchServerGatewayStatus(): Promise<ServerGatewayStatus> {
  try {
    const res = await fetch('/api/whatsapp/status', { cache: 'no-store' });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.toLowerCase().includes('application/json')) {
      const data = await res.json();
      return {
        hasBackend: Boolean(data.hasBackend ?? true),
        apiConfigured: Boolean(data.apiConfigured),
        provider: String(data.provider || 'direct'),
        serverWaNumber: String(data.serverWaNumber || SERVER_WA_GATEWAY_NUMBER)
      };
    }
  } catch {
    // Static host (Vercel) or offline
  }
  return {
    hasBackend: false,
    apiConfigured: false,
    provider: 'direct',
    serverWaNumber: SERVER_WA_GATEWAY_NUMBER
  };
}

/**
 * Mencari data siswa yang TEPAT untuk suatu catatan presensi
 * Urutan ketat anti-benturan NIS ganda:
 * 1. siswaId persis
 * 2. nama + kelas persis
 * 3. NIK unik
 * 4. NIS (hanya bila unik atau cocok kelasnya)
 */
export function resolveStudentForRecord(presensi: Presensi, siswaList: Siswa[]): Siswa | undefined {
  if (!presensi || !siswaList || siswaList.length === 0) return undefined;

  if (presensi.siswaId) {
    const byId = siswaList.find((s) => s.id === presensi.siswaId);
    if (byId) return byId;
  }

  if (presensi.nama && presensi.kelas) {
    const targetName = normalizeStudentName(presensi.nama);
    const targetClass = normalizeKelasCode(presensi.kelas);
    const byNameClass = siswaList.find(
      (s) => normalizeStudentName(s.nama) === targetName && normalizeKelasCode(s.kelas) === targetClass
    );
    if (byNameClass) return byNameClass;
  }

  if (presensi.nik && presensi.nik.trim().length >= 8) {
    const cleanNik = presensi.nik.trim();
    const matches = siswaList.filter((s) => s.nik && s.nik.trim() === cleanNik);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1 && presensi.kelas) {
      const targetClass = normalizeKelasCode(presensi.kelas);
      const classMatch = matches.find((s) => normalizeKelasCode(s.kelas) === targetClass);
      if (classMatch) return classMatch;
    }
  }

  if (presensi.nis && presensi.nis.trim().length >= 4) {
    const cleanNis = presensi.nis.trim();
    const matches = siswaList.filter((s) => s.nis && s.nis.trim() === cleanNis);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1 && presensi.kelas) {
      const targetClass = normalizeKelasCode(presensi.kelas);
      const classMatch = matches.find((s) => normalizeKelasCode(s.kelas) === targetClass);
      if (classMatch) return classMatch;
    }
  }

  return undefined;
}

/**
 * Mengambil nomor WA orang tua resmi (628...) atau '' bila siswa tidak memiliki no WA.
 * Tidak pernah mengarang nomor palsu.
 */
export function resolveParentPhoneForRecord(
  presensi: Presensi,
  siswa?: Siswa,
  siswaList?: Siswa[]
): string {
  const resolvedSiswa =
    (siswa && (!presensi.siswaId || siswa.id === presensi.siswaId) ? siswa : undefined) ||
    (siswaList ? resolveStudentForRecord(presensi, siswaList) : undefined);

  const candidates = [
    resolvedSiswa?.waOrangTua,
    (presensi as any)?.waOrangTua
  ];

  for (const raw of candidates) {
    const formatted = formatPhoneForWhatsApp(raw);
    if (formatted && formatted !== '6281234567890') {
      return formatted;
    }
  }

  return '';
}

export function isGatewayApiConfigured(settings?: SystemSettings): boolean {
  if (!settings) return false;
  const provider = settings.waGatewayProvider || (settings.waGatewayUrl ? 'webhook' : 'direct');
  if (provider === 'direct') return false;
  const token = (settings.waApiKey || '').trim();
  const hasRealToken = Boolean(token) && !PLACEHOLDER_API_KEYS.has(token);
  if (provider === 'webhook') {
    return Boolean(settings.waGatewayUrl && settings.waGatewayUrl.trim().startsWith('http'));
  }
  return hasRealToken;
}

/**
 * Format readable Indonesian date and time for scan logs and WhatsApp messages
 */
export function formatIndonesianScanDateTime(tanggalStr?: string, waktuStr?: string): string {
  const normDate = tanggalStr ? normalizeDateKey(tanggalStr) : getLocalDateString();
  const time = waktuStr ? waktuStr.slice(0, 5) : getLocalTimeString().slice(0, 5);

  const [y, m, d] = normDate.split('-').map(Number);
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  try {
    const dt = new Date(y, m - 1, d);
    const dayName = days[dt.getDay()] || '';
    const monthName = months[m - 1] || '';
    return `${dayName ? dayName + ', ' : ''}${d} ${monthName} ${y} pukul ${time} WIB`;
  } catch {
    return `${normDate} pukul ${time} WIB`;
  }
}

export function mapStatusToDisplay(status?: string): 'Masuk' | 'Pulang' | 'Terlambat' | string {
  if (!status) return 'Masuk';
  const s = status.trim().toLowerCase();
  if (s === 'hadir' || s === 'masuk') return 'Masuk';
  if (s === 'terlambat') return 'Terlambat';
  if (s === 'pulang') return 'Pulang';
  if (s === 'sakit') return 'Sakit';
  if (s === 'izin') return 'Izin';
  if (s === 'alfa') return 'Alfa';
  return status;
}

export function formatWhatsAppWaliKelasMessage(presensi: Presensi): string {
  const waktuScan = formatIndonesianScanDateTime(presensi.tanggal, presensi.waktu);
  const statusDisplay = mapStatusToDisplay(presensi.status);

  return `[NOTIFIKASI ABSENSI DIGIWANGI]
Nama Siswa : ${presensi.nama}
Kelas : ${presensi.kelas}
Waktu Scan : ${waktuScan}
Status : ${statusDisplay}`;
}

/**
 * Format official WhatsApp message for parents based on student and attendance details
 */
export function formatWhatsAppAttendanceMessage(
  presensi: Presensi,
  siswa?: Siswa,
  settings?: SystemSettings
): string {
  const timeFormatted = presensi.waktu ? presensi.waktu.slice(0, 5) : '07:00';
  const statusLabel = (presensi.status || 'HADIR').toUpperCase();
  const dateFormatted = presensi.tanggal || getLocalDateString();
  const studentName = presensi.nama || siswa?.nama || 'Siswa';
  const studentClass = presensi.kelas || siswa?.kelas || '-';
  const nisVal = presensi.nis || siswa?.nis || presensi.nik || '-';
  const operatorVal = presensi.operator ? presensi.operator.split(',')[0] : 'Petugas Piket Gerbang';

  if (settings?.templatePesan && settings.templatePesan.includes('{nama}')) {
    return settings.templatePesan
      .replace(/{nama}/g, studentName)
      .replace(/{status}/g, statusLabel)
      .replace(/{waktu}/g, timeFormatted)
      .replace(/{kelas}/g, studentClass)
      .replace(/{nis}/g, nisVal)
      .replace(/{tanggal}/g, dateFormatted);
  }

  return `🔔 *NOTIFIKASI PRESENSI SISWA - SDN 3 KARAMATWANGI*
----------------------------------------
Yth. Bapak/Ibu Orang Tua / Wali Murid dari:
👤 *Nama Siswa:* ${studentName}
🏷️ *Kelas:* ${studentClass}
📌 *NIS:* ${nisVal}

Dengan hormat kami sampaikan bahwa ananda telah tercatat *${statusLabel}* pada presensi sekolah:
📅 *Hari/Tanggal:* ${dateFormatted}
⏰ *Pukul:* ${timeFormatted} WIB
👨‍🏫 *Operator Pencatat:* ${operatorVal}

Sistem mencatat presensi secara real-time dan terhubung langsung ke Jurnal Digital Sekolah SDN 3 Karamatwangi.
Pemberitahuan ini dikirimkan otomatis melalui Layanan WhatsApp Gateway Sekolah. Terima kasih.
----------------------------------------
_SDN 3 Karamatwangi • Cepat, Akurat, Transparansi, Terintegritas_`;
}

/**
 * Generate a direct wa.me link using the exact formatted parent number (628...).
 * Returns '' when phone number is invalid/missing.
 */
export function getDirectWhatsAppUrl(phone: string, message: string): string {
  const cleanPhone = formatPhoneForWhatsApp(phone);
  if (!cleanPhone) return '';
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

async function dispatchRealExternalGateway(
  cleanPhone: string,
  message: string,
  meta: { studentName: string; kelas: string; status: string; tanggal?: string; waktu?: string },
  settings?: SystemSettings
): Promise<{ ok: boolean; provider: string; messageId?: string; error?: string }> {
  const provider = settings?.waGatewayProvider || (settings?.waGatewayUrl ? 'webhook' : 'direct');
  const token = (settings?.waApiKey || '').trim();
  const gatewayUrl = (settings?.waGatewayUrl || '').trim();

  try {
    if (provider === 'fonnte') {
      const form = new URLSearchParams();
      form.set('target', cleanPhone);
      form.set('message', message);
      form.set('countryCode', '62');
      const resp = await fetch(gatewayUrl || 'https://api.fonnte.com/send', {
        method: 'POST',
        headers: { Authorization: token },
        body: form
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && json?.status !== false) {
        return { ok: true, provider: 'FONNTE_API', messageId: String(json?.id || `fonnte-${Date.now()}`) };
      }
      return { ok: false, provider: 'FONNTE_API', error: json?.reason || json?.detail || `HTTP ${resp.status}` };
    }

    if (provider === 'wablas') {
      const base = (gatewayUrl || 'https://solo.wablas.com').replace(/\/+$/, '');
      const endpoint = base.endsWith('/api/send-message') ? base : `${base}/api/send-message`;
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, message })
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && json?.status !== false) {
        return { ok: true, provider: 'WABLAS_API', messageId: String(json?.data?.id || `wablas-${Date.now()}`) };
      }
      return { ok: false, provider: 'WABLAS_API', error: json?.message || `HTTP ${resp.status}` };
    }

    if (provider === 'webhook' && gatewayUrl) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token && !PLACEHOLDER_API_KEYS.has(token)) {
        headers.Authorization = `Bearer ${token}`;
      }
      const resp = await fetch(gatewayUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone: cleanPhone,
          target: cleanPhone,
          message,
          studentName: meta.studentName,
          kelas: meta.kelas,
          status: meta.status,
          tanggal: meta.tanggal,
          waktu: meta.waktu,
          serverWaNumber: settings?.serverWaNumber || SERVER_WA_GATEWAY_NUMBER
        })
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok) {
        return { ok: true, provider: 'CUSTOM_WEBHOOK', messageId: String(json?.messageId || `wh-${Date.now()}`) };
      }
      return { ok: false, provider: 'CUSTOM_WEBHOOK', error: json?.error || `HTTP ${resp.status}` };
    }

    return { ok: false, provider: 'DIRECT_WA', error: 'Token Gateway WA belum dikonfigurasi' };
  } catch (err: any) {
    return { ok: false, provider: provider.toUpperCase(), error: err?.message || 'Network/CORS gateway error' };
  }
}

export interface DispatchRecipientResult {
  success: boolean;
  deliveryStatus: 'DELIVERED' | 'SENT' | 'PENDING' | 'FAILED';
  phone: string;
  message: string;
  messageId?: string;
  recipientRole: 'wali_kelas' | 'orang_tua';
  recipientName: string;
  gateway?: string;
  error?: string;
}

export interface DualDispatchResult {
  waliKelas: DispatchRecipientResult;
  orangTua: DispatchRecipientResult;
}

/**
 * Kirim satu pesan ke server gateway (jika aktif) atau langsung dari client (Vercel)
 */
export async function sendSingleGatewayNotification(
  presensi: Presensi,
  siswa: Siswa | undefined,
  targetPhone: string,
  formattedMessage: string,
  recipientRole: 'wali_kelas' | 'orang_tua',
  recipientName: string,
  settings?: SystemSettings
): Promise<DispatchRecipientResult> {
  const cleanPhone = formatPhoneForWhatsApp(targetPhone);
  const studentName = presensi?.nama || siswa?.nama || 'Siswa SDN 3 Karamatwangi';
  const studentClass = presensi?.kelas || siswa?.kelas || '-';
  const studentStatus = presensi?.status || 'Hadir';

  if (!cleanPhone) {
    const failedId = `wa-fail-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const errMsg = 'Nomor WA Orang Tua belum diisi atau tidak valid';
    appendLocalWaLog({
      id: failedId,
      studentName,
      kelas: studentClass,
      status: studentStatus,
      phone: 'TIDAK TERDAFTAR',
      message: formattedMessage,
      deliveryStatus: 'FAILED',
      recipientRole,
      recipientName,
      gateway: 'VALIDATION',
      timestamp: new Date().toISOString(),
      error: errMsg
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('karapres:whatsapp_sent', {
        detail: { presensi, siswa, phone: '', message: formattedMessage, messageId: failedId, recipientRole, recipientName, status: 'FAILED', error: errMsg }
      }));
    }
    return {
      success: false,
      deliveryStatus: 'FAILED',
      phone: '',
      message: formattedMessage,
      messageId: failedId,
      recipientRole,
      recipientName,
      error: errMsg
    };
  }

  try {
    const res = await fetch('/api/whatsapp/send-gateway', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        presensi,
        siswa,
        phone: cleanPhone,
        message: formattedMessage,
        recipientRole,
        recipientName,
        gatewayConfig: settings
          ? {
              provider: settings.waGatewayProvider || (settings.waGatewayUrl ? 'webhook' : 'direct'),
              apiKey: settings.waApiKey,
              gatewayUrl: settings.waGatewayUrl,
              serverWaNumber: settings.serverWaNumber
            }
          : undefined
      })
    });

    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.toLowerCase().includes('application/json')) {
      const data = await res.json();
      const dStatus: 'DELIVERED' | 'SENT' | 'PENDING' | 'FAILED' = data.deliveryStatus || 'PENDING';
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('karapres:whatsapp_sent', {
          detail: {
            presensi,
            siswa,
            phone: cleanPhone,
            message: formattedMessage,
            messageId: data.messageId || `msg-${Date.now()}`,
            recipientRole,
            recipientName,
            status: dStatus,
            gateway: data.gateway
          }
        }));
      }

      return {
        success: dStatus !== 'FAILED',
        deliveryStatus: dStatus,
        phone: cleanPhone,
        message: formattedMessage,
        messageId: data.messageId,
        recipientRole,
        recipientName,
        gateway: data.gateway,
        error: data.error
      };
    } else if (res.status === 404 || !ct.toLowerCase().includes('application/json')) {
      // Hosting statis (Vercel) tanpa server Node
      let dStatus: 'DELIVERED' | 'PENDING' | 'FAILED' = 'PENDING';
      let gatewayUsed = 'DIRECT_WA_QUEUE';
      let gwError: string | undefined;
      let msgId = `wa-local-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

      if (isGatewayApiConfigured(settings)) {
        const apiRes = await dispatchRealExternalGateway(
          cleanPhone,
          formattedMessage,
          { studentName, kelas: studentClass, status: studentStatus, tanggal: presensi.tanggal, waktu: presensi.waktu },
          settings
        );
        gatewayUsed = apiRes.provider;
        if (apiRes.ok) {
          dStatus = 'DELIVERED';
          if (apiRes.messageId) msgId = apiRes.messageId;
        } else {
          dStatus = 'FAILED';
          gwError = apiRes.error;
        }
      }

      appendLocalWaLog({
        id: msgId,
        studentName,
        kelas: studentClass,
        status: studentStatus,
        phone: cleanPhone,
        message: formattedMessage,
        deliveryStatus: dStatus,
        recipientRole,
        recipientName,
        gateway: gatewayUsed,
        timestamp: new Date().toISOString(),
        error: gwError
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('karapres:whatsapp_sent', {
          detail: {
            presensi,
            siswa,
            phone: cleanPhone,
            message: formattedMessage,
            messageId: msgId,
            recipientRole,
            recipientName,
            status: dStatus,
            gateway: gatewayUsed,
            error: gwError
          }
        }));
      }

      return {
        success: dStatus !== 'FAILED',
        deliveryStatus: dStatus,
        phone: cleanPhone,
        message: formattedMessage,
        messageId: msgId,
        recipientRole,
        recipientName,
        gateway: gatewayUsed,
        error: gwError
      };
    } else {
      const errData = await res.json().catch(() => ({}));
      return {
        success: false,
        deliveryStatus: 'FAILED',
        phone: cleanPhone,
        message: formattedMessage,
        error: errData.error || 'Server gateway response not OK',
        recipientRole,
        recipientName
      };
    }
  } catch (err: any) {
    const errId = `wa-err-${Date.now()}`;
    return {
      success: false,
      deliveryStatus: 'FAILED',
      phone: cleanPhone,
      message: formattedMessage,
      messageId: errId,
      recipientRole,
      recipientName,
      error: err?.message || 'Koneksi gateway terputus'
    };
  }
}

/**
 * Uji kirim pesan tes dari halaman Pengaturan WA Gateway Admin
 */
export async function sendTestWhatsAppGateway(
  testPhone: string,
  settings: SystemSettings
): Promise<{ success: boolean; deliveryStatus: string; phone: string; message: string; error?: string; gateway?: string }> {
  const cleanPhone = formatPhoneForWhatsApp(testPhone);
  if (!cleanPhone) {
    return {
      success: false,
      deliveryStatus: 'FAILED',
      phone: '',
      message: '',
      error: 'Nomor WA tujuan tes tidak valid (gunakan format 08... atau 628...)'
    };
  }

  const nowDate = getLocalDateString();
  const nowTime = getLocalTimeString();
  const mockPresensi: Presensi = {
    id: `test-${Date.now()}`,
    siswaId: 'test',
    nis: '000000',
    nama: 'SISWA UJI COBA GATEWAY',
    kelas: 'Kelas Uji Coba',
    tanggal: nowDate,
    waktu: nowTime,
    status: 'Hadir',
    waStatus: 'Pending',
    operator: 'Admin Pengujian'
  };

  const testMsg = `✅ *UJI KONEKSI WA GATEWAY DIGIWANGI 3 - SDN 3 KARAMATWANGI*
----------------------------------------
Halo Bapak/Ibu, pesan ini adalah pengujian koneksi WhatsApp Gateway otomatis pada ${nowDate} pukul ${nowTime.slice(0, 5)} WIB.
Nomor Tujuan: ${cleanPhone}
Server Pengirim: ${settings.serverWaNumber || SERVER_WA_GATEWAY_NUMBER}`;

  const res = await sendSingleGatewayNotification(
    mockPresensi,
    undefined,
    cleanPhone,
    testMsg,
    'orang_tua',
    'Pengujian Admin',
    settings
  );

  return {
    success: res.success,
    deliveryStatus: res.deliveryStatus,
    phone: res.phone,
    message: testMsg,
    error: res.error,
    gateway: res.gateway
  };
}

/**
 * Pengiriman otomatis notifikasi presensi ke nomor WhatsApp ORANG TUA siswa masing-masing.
 */
export async function sendAutomaticWhatsAppNotification(
  presensi: Presensi,
  siswa?: Siswa,
  settings?: SystemSettings,
  _waliKelasList?: WaliKelas[]
): Promise<{
  success: boolean;
  deliveryStatus: 'DELIVERED' | 'SENT' | 'PENDING' | 'FAILED';
  phone: string;
  message: string;
  messageId: string;
  error?: string;
}> {
  const parentPhone = resolveParentPhoneForRecord(presensi, siswa);
  const parentMessage = formatWhatsAppAttendanceMessage(presensi, siswa, settings);

  try {
    const parentResult = await sendSingleGatewayNotification(
      presensi,
      siswa,
      parentPhone,
      parentMessage,
      'orang_tua',
      `Orang Tua / Wali Murid dari ${presensi.nama}`,
      settings
    );
    return {
      success: parentResult.success,
      deliveryStatus: parentResult.deliveryStatus,
      phone: parentResult.phone,
      message: parentResult.message,
      messageId: parentResult.messageId || `msg-${Date.now()}`,
      error: parentResult.error
    };
  } catch (err: any) {
    console.error(`[WA Gateway Gagal Kirim Orang Tua]:`, err);
    return {
      success: false,
      deliveryStatus: 'FAILED',
      phone: parentPhone,
      message: parentMessage,
      messageId: `err-${Date.now()}`,
      error: err?.message
    };
  }
}

export async function sendDualWhatsAppNotification(
  presensi: Presensi,
  siswa?: Siswa,
  settings?: SystemSettings,
  _waliKelasList?: WaliKelas[]
): Promise<DualDispatchResult> {
  const autoRes = await sendAutomaticWhatsAppNotification(presensi, siswa, settings);
  const parentResult: DispatchRecipientResult = {
    success: autoRes.success,
    deliveryStatus: autoRes.deliveryStatus,
    phone: autoRes.phone,
    message: autoRes.message,
    messageId: autoRes.messageId,
    recipientRole: 'orang_tua',
    recipientName: `Orang Tua ${presensi.nama}`,
    error: autoRes.error
  };

  const dummyWaliResult: DispatchRecipientResult = {
    success: true,
    deliveryStatus: 'SENT',
    phone: '',
    message: '',
    recipientRole: 'wali_kelas',
    recipientName: 'Wali Kelas (Dilewati, khusus Orang Tua)'
  };

  return {
    waliKelas: dummyWaliResult,
    orangTua: parentResult
  };
}

export interface BroadcastProgress {
  current: number;
  total: number;
  studentName: string;
  kelas: string;
  phone: string;
}

export interface BroadcastResult {
  total: number;
  sentApi: number;
  queuedDirect: number;
  failed: number;
  directQueue: DirectQueueItem[];
  updatedWaStatuses: Array<{ id: string; siswaId: string; tanggal: string; waStatus: 'Pending' | 'Terkirim' | 'Gagal'; phone: string }>;
}

/**
 * Pengiriman notifikasi massal ke WhatsApp masing-masing Orang Tua Siswa.
 * Mendukung filter tanggal/daftar catatan yang dikirim agar akurat per kelas & per siswa.
 */
export async function broadcastAllClassesToParents(
  targetRecords: Presensi[],
  siswaList: Siswa[],
  settings?: SystemSettings,
  onProgress?: (progress: BroadcastProgress) => void
): Promise<BroadcastResult> {
  if (!targetRecords || targetRecords.length === 0) {
    return { total: 0, sentApi: 0, queuedDirect: 0, failed: 0, directQueue: [], updatedWaStatuses: [] };
  }

  // Deduplicate by siswaId + tanggal so collective broadcast never sends duplicate messages to the same parent
  const dedupedRecords: Presensi[] = [];
  const seenKeys = new Set<string>();
  for (const rec of targetRecords) {
    if (!rec) continue;
    const key = `${rec.siswaId || rec.id}__${normalizeDateKey(rec.tanggal)}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    dedupedRecords.push(rec);
  }

  const prepared = dedupedRecords.map((p) => {
    const matchedSiswa = resolveStudentForRecord(p, siswaList);
    const parentPhone = resolveParentPhoneForRecord(p, matchedSiswa, siswaList);
    const message = formatWhatsAppAttendanceMessage(p, matchedSiswa, settings);
    return {
      presensi: p,
      siswa: matchedSiswa,
      phone: parentPhone,
      message,
      recipientName: `Orang Tua / Wali Murid dari ${p.nama}`
    };
  });

  const clientApiConfigured = isGatewayApiConfigured(settings);
  const serverStatus = await fetchServerGatewayStatus();
  const effectiveApiConfigured = clientApiConfigured || serverStatus.apiConfigured;

  const directQueue: DirectQueueItem[] = [];
  const updatedWaStatuses: BroadcastResult['updatedWaStatuses'] = [];

  // Gunakan batch chunk backend agar proses 50-429 siswa punya live progress & bebas timeout proxy
  if (effectiveApiConfigured && serverStatus.hasBackend) {
    const CHUNK_SIZE = 15;
    let sentApi = 0;
    let queuedDirect = 0;
    let failed = 0;
    let backendChunkFailed = false;
    let processedCount = 0;

    for (let offset = 0; offset < prepared.length; offset += CHUNK_SIZE) {
      const chunk = prepared.slice(offset, offset + CHUNK_SIZE);
      if (onProgress && chunk[0]) {
        onProgress({
          current: offset + 1,
          total: prepared.length,
          studentName: chunk[0].presensi.nama,
          kelas: chunk[0].presensi.kelas,
          phone: chunk[0].phone || 'Belum ada No WA'
        });
      }

      try {
        const res = await fetch('/api/whatsapp/broadcast-parents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: chunk,
            gatewayConfig: settings
              ? {
                  provider: settings.waGatewayProvider || (settings.waGatewayUrl ? 'webhook' : 'direct'),
                  apiKey: settings.waApiKey,
                  gatewayUrl: settings.waGatewayUrl,
                  serverWaNumber: settings.serverWaNumber
                }
              : undefined
          })
        });
        const ct = res.headers.get('content-type') || '';
        if (!res.ok || !ct.toLowerCase().includes('application/json')) {
          backendChunkFailed = true;
          break;
        }
        const data = await res.json();
        const serverResults = Array.isArray(data.results) ? data.results : [];
        for (let idx = 0; idx < chunk.length; idx++) {
          const src = chunk[idx];
          const r = serverResults[idx] || {};
          const waStatus: 'Pending' | 'Terkirim' | 'Gagal' =
            r.deliveryStatus === 'DELIVERED' || r.deliveryStatus === 'SENT'
              ? 'Terkirim'
              : r.deliveryStatus === 'FAILED'
              ? 'Gagal'
              : 'Pending';
          if (waStatus === 'Terkirim') sentApi++;
          else if (waStatus === 'Gagal') failed++;
          else queuedDirect++;

          updatedWaStatuses.push({
            id: src.presensi.id,
            siswaId: src.presensi.siswaId,
            tanggal: src.presensi.tanggal,
            waStatus,
            phone: src.phone
          });
          if (waStatus === 'Pending' && src.phone) {
            directQueue.push({
              id: src.presensi.id,
              presensi: src.presensi,
              siswa: src.siswa,
              phone: src.phone,
              message: src.message,
              waUrl: getDirectWhatsAppUrl(src.phone, src.message)
            });
          }
          processedCount++;
        }

        if (onProgress && chunk[chunk.length - 1]) {
          onProgress({
            current: processedCount,
            total: prepared.length,
            studentName: chunk[chunk.length - 1].presensi.nama,
            kelas: chunk[chunk.length - 1].presensi.kelas,
            phone: chunk[chunk.length - 1].phone || 'Belum ada No WA'
          });
        }
      } catch (err) {
        console.warn('[WA Gateway] Server chunk broadcast fallback:', err);
        backendChunkFailed = true;
        break;
      }
    }

    if (!backendChunkFailed) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('karapres:whatsapp_broadcast_complete', {
          detail: { total: prepared.length, sentApi, queuedDirect, failed }
        }));
      }
      return {
        total: prepared.length,
        sentApi,
        queuedDirect,
        failed,
        directQueue,
        updatedWaStatuses
      };
    }

    // Fallback: process any remaining unprocessed items below
    for (let i = processedCount; i < prepared.length; i++) {
      const item = prepared[i];
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: prepared.length,
          studentName: item.presensi.nama,
          kelas: item.presensi.kelas,
          phone: item.phone || 'Belum ada No WA'
        });
      }
      if (!item.phone) {
        failed++;
        updatedWaStatuses.push({
          id: item.presensi.id,
          siswaId: item.presensi.siswaId,
          tanggal: item.presensi.tanggal,
          waStatus: 'Gagal',
          phone: ''
        });
        continue;
      }
      const r = await sendSingleGatewayNotification(
        item.presensi,
        item.siswa,
        item.phone,
        item.message,
        'orang_tua',
        item.recipientName,
        settings
      );
      if (r.deliveryStatus === 'DELIVERED' || r.deliveryStatus === 'SENT') {
        sentApi++;
        updatedWaStatuses.push({
          id: item.presensi.id,
          siswaId: item.presensi.siswaId,
          tanggal: item.presensi.tanggal,
          waStatus: 'Terkirim',
          phone: item.phone
        });
      } else if (r.deliveryStatus === 'PENDING') {
        queuedDirect++;
        directQueue.push({
          id: item.presensi.id,
          presensi: item.presensi,
          siswa: item.siswa,
          phone: item.phone,
          message: item.message,
          waUrl: getDirectWhatsAppUrl(item.phone, item.message)
        });
        updatedWaStatuses.push({
          id: item.presensi.id,
          siswaId: item.presensi.siswaId,
          tanggal: item.presensi.tanggal,
          waStatus: 'Pending',
          phone: item.phone
        });
      } else {
        failed++;
        updatedWaStatuses.push({
          id: item.presensi.id,
          siswaId: item.presensi.siswaId,
          tanggal: item.presensi.tanggal,
          waStatus: 'Gagal',
          phone: item.phone
        });
      }
    }

    return {
      total: prepared.length,
      sentApi,
      queuedDirect,
      failed,
      directQueue,
      updatedWaStatuses
    };
  }

  const apiConfigured = effectiveApiConfigured;

  let sentApi = 0;
  let queuedDirect = 0;
  let failed = 0;

  for (let i = 0; i < prepared.length; i++) {
    const item = prepared[i];
    if (onProgress) {
      onProgress({
        current: i + 1,
        total: prepared.length,
        studentName: item.presensi.nama,
        kelas: item.presensi.kelas,
        phone: item.phone || 'Belum ada No WA'
      });
    }

    if (!item.phone) {
      failed++;
      updatedWaStatuses.push({
        id: item.presensi.id,
        siswaId: item.presensi.siswaId,
        tanggal: item.presensi.tanggal,
        waStatus: 'Gagal',
        phone: ''
      });
      continue;
    }

    if (!apiConfigured) {
      // Catat ke log gateway sebagai antrean langsung (PENDING) & masukkan ke directQueue wa.me
      const msgId = `wa-q-${Date.now()}-${i}`;
      appendLocalWaLog({
        id: msgId,
        studentName: item.presensi.nama,
        kelas: item.presensi.kelas,
        status: item.presensi.status,
        phone: item.phone,
        message: item.message,
        deliveryStatus: 'PENDING',
        recipientRole: 'orang_tua',
        recipientName: item.recipientName,
        gateway: 'DIRECT_WA_QUEUE',
        timestamp: new Date().toISOString()
      });
      queuedDirect++;
      directQueue.push({
        id: item.presensi.id,
        presensi: item.presensi,
        siswa: item.siswa,
        phone: item.phone,
        message: item.message,
        waUrl: getDirectWhatsAppUrl(item.phone, item.message)
      });
      updatedWaStatuses.push({
        id: item.presensi.id,
        siswaId: item.presensi.siswaId,
        tanggal: item.presensi.tanggal,
        waStatus: 'Pending',
        phone: item.phone
      });
    } else {
      const r = await sendSingleGatewayNotification(
        item.presensi,
        item.siswa,
        item.phone,
        item.message,
        'orang_tua',
        item.recipientName,
        settings
      );
      if (r.deliveryStatus === 'DELIVERED' || r.deliveryStatus === 'SENT') {
        sentApi++;
        updatedWaStatuses.push({
          id: item.presensi.id,
          siswaId: item.presensi.siswaId,
          tanggal: item.presensi.tanggal,
          waStatus: 'Terkirim',
          phone: item.phone
        });
      } else if (r.deliveryStatus === 'PENDING') {
        queuedDirect++;
        directQueue.push({
          id: item.presensi.id,
          presensi: item.presensi,
          siswa: item.siswa,
          phone: item.phone,
          message: item.message,
          waUrl: getDirectWhatsAppUrl(item.phone, item.message)
        });
        updatedWaStatuses.push({
          id: item.presensi.id,
          siswaId: item.presensi.siswaId,
          tanggal: item.presensi.tanggal,
          waStatus: 'Pending',
          phone: item.phone
        });
      } else {
        failed++;
        updatedWaStatuses.push({
          id: item.presensi.id,
          siswaId: item.presensi.siswaId,
          tanggal: item.presensi.tanggal,
          waStatus: 'Gagal',
          phone: item.phone
        });
      }

      if (i < prepared.length - 1) {
        await new Promise((res) => setTimeout(res, 120));
      }
    }
  }

  return {
    total: prepared.length,
    sentApi,
    queuedDirect,
    failed,
    directQueue,
    updatedWaStatuses
  };
}
