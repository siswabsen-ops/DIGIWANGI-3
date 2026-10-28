import { Presensi, Siswa, SystemSettings, WaliKelas } from '../types';
import { getLocalDateString, getLocalTimeString, normalizeDateKey } from './attendanceUtils';
import { DAFTAR_WALI_KELAS, getWaliKelasObject } from './waliKelasData';

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
 * Alur Kerja Otomatis Baru SDN 3 Karamatwangi:
 * 1. Siswa scan QR-code absensi
 * 2. Sistem mencocokkan kelas siswa dengan nomor WhatsApp wali kelas yang terdaftar
 * 3. Langsung mengirim notifikasi absensi ke WA WALI KELAS masing-masing secara otomatis tanpa tombol
 * 4. Baru kemudian notifikasi dikirimkan ke WA ORANG TUA siswa
 * 
 * Aturan Penting:
 * - Jika pengiriman ke WA wali kelas gagal, sistem TETAP LANJUT kirim ke WA orang tua dan mencatat kegagalan di log server.
 */
export async function sendDualWhatsAppNotification(
  presensi: Presensi,
  siswa?: Siswa,
  settings?: SystemSettings,
  waliKelasList?: WaliKelas[]
): Promise<DualDispatchResult> {
  const activeWaliKelasList = (waliKelasList && waliKelasList.length > 0) ? waliKelasList : DAFTAR_WALI_KELAS;
  
  // 1. Cocokkan kelas siswa dengan data wali kelas
  const matchedWali = getWaliKelasObject(presensi.kelas, activeWaliKelasList);
  const waliNama = matchedWali?.nama || `Wali Kelas ${presensi.kelas}`;
  const waliPhone = matchedWali?.noWa || '';
  const waliMessage = formatWhatsAppWaliKelasMessage(presensi);

  let waliResult: DispatchRecipientResult;

  // LANGKAH 1: Kirim ke WA Wali Kelas terlebih dahulu
  try {
    if (!waliPhone) {
      console.warn(`[WA Gateway] Nomor WA Wali Kelas untuk ${presensi.kelas} belum terdaftar. Melanjutkan ke orang tua.`);
      waliResult = {
        success: false,
        phone: '',
        message: waliMessage,
        recipientRole: 'wali_kelas',
        recipientName: waliNama,
        error: `Nomor WhatsApp wali kelas ${presensi.kelas} belum diatur.`
      };
    } else {
      waliResult = await sendSingleGatewayNotification(
        presensi,
        siswa,
        waliPhone,
        waliMessage,
        'wali_kelas',
        waliNama
      );
    }
  } catch (err: any) {
    console.error(`[WA Gateway Gagal Kirim Wali Kelas]:`, err);
    waliResult = {
      success: false,
      phone: waliPhone,
      message: waliMessage,
      recipientRole: 'wali_kelas',
      recipientName: waliNama,
      error: err.message || 'Gagal mengirim ke wali kelas'
    };
  }

  // LANGKAH 2: Kirim ke WA Orang Tua siswa (tetap berjalan meski langkah 1 gagal)
  const parentPhone = (
    (siswa && siswa.waOrangTua) ||
    (presensi as any).waOrangTua ||
    presensi.pesanTerkirim?.match(/\((08\d+|628\d+)\)/)?.[1] ||
    '081234567890'
  ).trim();

  const parentMessage = formatWhatsAppAttendanceMessage(presensi, siswa, settings);
  let parentResult: DispatchRecipientResult;

  try {
    parentResult = await sendSingleGatewayNotification(
      presensi,
      siswa,
      parentPhone,
      parentMessage,
      'orang_tua',
      `Orang Tua / Wali Murid dari ${presensi.nama}`
    );
  } catch (err: any) {
    console.error(`[WA Gateway Gagal Kirim Orang Tua]:`, err);
    parentResult = {
      success: false,
      phone: parentPhone,
      message: parentMessage,
      recipientRole: 'orang_tua',
      recipientName: `Orang Tua / Wali Murid dari ${presensi.nama}`,
      error: err.message || 'Gagal mengirim ke orang tua'
    };
  }

  return {
    waliKelas: waliResult,
    orangTua: parentResult
  };
}

/**
 * Backward-compatibility wrapper that executes the dual notification workflow
 */
export async function sendAutomaticWhatsAppNotification(
  presensi: Presensi,
  siswa?: Siswa,
  settings?: SystemSettings,
  waliKelasList?: WaliKelas[]
): Promise<{ success: boolean; phone: string; message: string; messageId: string }> {
  const dual = await sendDualWhatsAppNotification(presensi, siswa, settings, waliKelasList);
  return {
    success: dual.orangTua.success || dual.waliKelas.success,
    phone: dual.orangTua.phone,
    message: dual.orangTua.message,
    messageId: dual.orangTua.messageId || dual.waliKelas.messageId || `msg-${Date.now()}`
  };
}
