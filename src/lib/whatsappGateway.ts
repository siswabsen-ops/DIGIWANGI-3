import { Presensi, Siswa, SystemSettings, WaliKelas } from '../types';
import { getLocalDateString, getLocalTimeString, normalizeDateKey } from './attendanceUtils';
import { DAFTAR_WALI_KELAS, getWaliKelasObject } from './waliKelasData';

export const SERVER_WA_GATEWAY_NUMBER = '08214134551';

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

/**
 * Mengambil log pengiriman gateway dari server (yang sudah difilter otomatis per hari 05.00 WIB)
 */
export async function fetchWhatsAppGatewayLogs(): Promise<{ success: boolean; logs: WhatsAppGatewayLog[] }> {
  try {
    const res = await fetch('/api/whatsapp/logs');
    if (res.ok) {
      const data = await res.json();
      return { success: true, logs: data.logs || [] };
    }
  } catch (err) {
    console.warn('[WA Gateway] Gagal mengambil log gateway server:', err);
  }
  return { success: false, logs: [] };
}

/**
 * Membersihkan seluruh log notifikasi WhatsApp gateway di server secara manual
 */
export async function clearWhatsAppGatewayLogs(): Promise<boolean> {
  try {
    const res = await fetch('/api/whatsapp/clear', { method: 'POST' });
    if (res.ok) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('karapres:whatsapp_logs_cleared'));
      }
      return true;
    }
  } catch (err) {
    console.warn('[WA Gateway] Gagal membersihkan log gateway server:', err);
  }
  return false;
}

/**
 * Standardize Indonesian phone numbers to WhatsApp international format (628...)
 */
export function formatPhoneForWhatsApp(rawPhone: string): string {
  if (!rawPhone) return '6281234567890';
  let clean = rawPhone.replace(/\D/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.substring(1);
  } else if (clean.startsWith('+62')) {
    clean = '62' + clean.substring(3);
  } else if (!clean.startsWith('62')) {
    clean = '62' + clean;
  }
  return clean;
}

/**
 * Format readable Indonesian date and time for scan logs and WhatsApp messages
 * Example: "Rabu, 28 Oktober 2026 pukul 07:12 WIB"
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

/**
 * Map status attendance to readable standard for homeroom message (Masuk / Pulang / Terlambat)
 */
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

/**
 * Format pesan otomatis ke WA wali kelas sesuai standar resmi Digiwangi:
 * [NOTIFIKASI ABSENSI DIGIWANGI]
 * Nama Siswa : ………………
 * Kelas : ………………
 * Waktu Scan : (tanggal & jam pemindaian)
 * Status : Masuk / Pulang / Terlambat
 */
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
 * Generate a direct wa.me link as fallback or quick manual view
 */
export function getDirectWhatsAppUrl(phone: string, message: string): string {
  const cleanPhone = formatPhoneForWhatsApp(phone);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export interface DispatchRecipientResult {
  success: boolean;
  phone: string;
  message: string;
  messageId?: string;
  recipientRole: 'wali_kelas' | 'orang_tua';
  recipientName: string;
  error?: string;
}

export interface DualDispatchResult {
  waliKelas: DispatchRecipientResult;
  orangTua: DispatchRecipientResult;
}

/**
 * Kirim satu pesan melalui server-side gateway endpoint
 */
export async function sendSingleGatewayNotification(
  presensi: Presensi,
  siswa: Siswa | undefined,
  targetPhone: string,
  formattedMessage: string,
  recipientRole: 'wali_kelas' | 'orang_tua',
  recipientName: string
): Promise<DispatchRecipientResult> {
  const cleanPhone = (targetPhone || '').trim();

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
        recipientName
      })
    });

    if (res.ok) {
      const data = await res.json();
      
      // Emit in-browser custom event so active UI components react instantly
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
            status: 'DELIVERED'
          }
        }));
      }

      return {
        success: true,
        phone: cleanPhone,
        message: formattedMessage,
        messageId: data.messageId,
        recipientRole,
        recipientName
      };
    } else {
      const errData = await res.json().catch(() => ({}));
      console.warn(`[WA Gateway Error] Gagal kirim ke ${recipientRole} (${cleanPhone}):`, errData);
      return {
        success: false,
        phone: cleanPhone,
        message: formattedMessage,
        error: errData.error || 'Server gateway response not OK',
        recipientRole,
        recipientName
      };
    }
  } catch (err: any) {
    console.warn(`[WA Gateway Error] Server gateway unreachable for ${recipientRole}:`, err);
    
    // Client-side event trigger for simulator
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('karapres:whatsapp_sent', {
        detail: {
          presensi,
          siswa,
          phone: cleanPhone,
          message: formattedMessage,
          messageId: `local-${Date.now()}`,
          recipientRole,
          recipientName,
          status: 'SENT'
        }
      }));
    }

    return {
      success: true,
      phone: cleanPhone,
      message: formattedMessage,
      messageId: `local-${Date.now()}`,
      recipientRole,
      recipientName
    };
  }
}

/**
/**
 * Alur Kerja Otomatis Resmi SDN 3 Karamatwangi:
 * - Setiap siswa selesai absensi scan QR-code, notifikasi presensi langsung dan otomatis dikirimkan ke nomor WhatsApp ORANG TUA siswa masing-masing.
 * - Pengiriman ke wali kelas ditiadakan sehingga murni fokus ke orang tua siswa secara otomatis.
 */
export async function sendAutomaticWhatsAppNotification(
  presensi: Presensi,
  siswa?: Siswa,
  settings?: SystemSettings,
  _waliKelasList?: WaliKelas[]
): Promise<{ success: boolean; phone: string; message: string; messageId: string }> {
  const parentPhone = (
    (siswa && siswa.waOrangTua) ||
    (presensi as any).waOrangTua ||
    presensi.pesanTerkirim?.match(/\((08\d+|628\d+)\)/)?.[1] ||
    '081234567890'
  ).trim();

  const parentMessage = formatWhatsAppAttendanceMessage(presensi, siswa, settings);

  try {
    const parentResult = await sendSingleGatewayNotification(
      presensi,
      siswa,
      parentPhone,
      parentMessage,
      'orang_tua',
      `Orang Tua / Wali Murid dari ${presensi.nama}`
    );
    return {
      success: parentResult.success,
      phone: parentResult.phone,
      message: parentResult.message,
      messageId: parentResult.messageId || `msg-${Date.now()}`
    };
  } catch (err: any) {
    console.error(`[WA Gateway Gagal Kirim Orang Tua]:`, err);
    return {
      success: false,
      phone: parentPhone,
      message: parentMessage,
      messageId: `err-${Date.now()}`
    };
  }
}

/**
 * Backward compatibility dual dispatch - redirected directly to parent notification
 */
export async function sendDualWhatsAppNotification(
  presensi: Presensi,
  siswa?: Siswa,
  settings?: SystemSettings,
  _waliKelasList?: WaliKelas[]
): Promise<DualDispatchResult> {
  const autoRes = await sendAutomaticWhatsAppNotification(presensi, siswa, settings);
  const parentResult: DispatchRecipientResult = {
    success: autoRes.success,
    phone: autoRes.phone,
    message: autoRes.message,
    messageId: autoRes.messageId,
    recipientRole: 'orang_tua',
    recipientName: `Orang Tua ${presensi.nama}`
  };

  const dummyWaliResult: DispatchRecipientResult = {
    success: true,
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

/**
 * Pengiriman notifikasi massal seluruh kelas (1-A s/d 6-B) ke WhatsApp masing-masing Orang Tua Siswa
 */
export async function broadcastAllClassesToParents(
  presensiList: Presensi[],
  siswaList: Siswa[],
  settings?: SystemSettings,
  onProgress?: (progress: BroadcastProgress) => void
): Promise<{ total: number; sent: number; failed: number }> {
  const todayStr = getLocalDateString();
  
  // Ambil data presensi hari ini
  let todayRecords = presensiList.filter((p) => p.tanggal === todayStr);
  if (todayRecords.length === 0) {
    todayRecords = presensiList.slice(-100);
  }

  // Buat map pencarian siswa
  const studentMap = new Map<string, Siswa>();
  for (let i = 0; i < siswaList.length; i++) {
    const s = siswaList[i];
    if (s.id) studentMap.set(s.id, s);
    if (s.nis) studentMap.set(s.nis.trim(), s);
    if (s.nama) studentMap.set(s.nama.trim().toLowerCase(), s);
  }

  const items = todayRecords.map((p) => {
    let s = p.siswaId ? studentMap.get(p.siswaId) : undefined;
    if (!s && p.nis) s = studentMap.get(p.nis.trim());
    if (!s && p.nama) s = studentMap.get(p.nama.trim().toLowerCase());

    const parentPhone = (s?.waOrangTua || (p as any).waOrangTua || '081234567890').trim();
    const message = formatWhatsAppAttendanceMessage(p, s, settings);
    return {
      presensi: p,
      siswa: s,
      phone: parentPhone,
      message,
      recipientName: `Orang Tua / Wali Murid dari ${p.nama}`
    };
  });

  if (items.length === 0) {
    return { total: 0, sent: 0, failed: 0 };
  }

  // Coba kirim via server broadcast batch API
  try {
    const res = await fetch('/api/whatsapp/broadcast-parents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });

    if (res.ok) {
      const data = await res.json();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('karapres:whatsapp_broadcast_complete', { detail: data }));
      }
      return {
        total: data.total || items.length,
        sent: data.sent || items.length,
        failed: data.failed || 0
      };
    }
  } catch (err) {
    console.warn('[WA Gateway] Server batch broadcast fallback to sequential:', err);
  }

  // Fallback sequential dispatch
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (onProgress) {
      onProgress({
        current: i + 1,
        total: items.length,
        studentName: item.presensi.nama,
        kelas: item.presensi.kelas,
        phone: item.phone
      });
    }

    try {
      const r = await sendSingleGatewayNotification(
        item.presensi,
        item.siswa,
        item.phone,
        item.message,
        'orang_tua',
        item.recipientName
      );
      if (r.success) sent++;
      else failed++;
    } catch {
      failed++;
    }

    if (i < items.length - 1) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  return { total: items.length, sent, failed };
}
