import { Siswa, Presensi, StatusKehadiran } from '../types';

/**
 * Mendapatkan string tanggal lokal (YYYY-MM-DD) berdasarkan zona waktu lokal peramban.
 * Ini mencegah bug pergeseran tanggal UTC (WIB = UTC+7) pada pagi hari.
 */
export const getLocalDateString = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Format jam menit detik lokal (HH:mm:ss)
 */
export const getLocalTimeString = (d: Date = new Date()): string => {
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

/**
 * Memeriksa apakah suatu catatan presensi sesuai dengan siswa yang dicari
 */
export const isPresensiMatchSiswa = (p: Presensi, s: Siswa): boolean => {
  if (p.siswaId && p.siswaId === s.id) return true;
  if (p.nis && s.nis && p.nis.trim() === s.nis.trim()) return true;
  if (p.nik && s.nik && p.nik.trim() === s.nik.trim()) return true;
  if (s.nisn && p.nis === s.nisn) return true;
  return false;
};

/**
 * Memeriksa apakah tanggal pada catatan presensi sesuai dengan tanggal target
 */
export const isPresensiDateMatch = (pTanggal: string, targetDateStr: string): boolean => {
  if (pTanggal === targetDateStr) return true;
  // Juga toleransi jika salah satu format menggunakan ISO UTC hari yang sama
  try {
    const d1 = new Date(pTanggal).toLocaleDateString('en-CA');
    const d2 = new Date(targetDateStr).toLocaleDateString('en-CA');
    return d1 === d2;
  } catch {
    return false;
  }
};

/**
 * Mengambil catatan presensi TERAKHIR / TERBARU untuk seorang siswa pada tanggal tertentu.
 * Jika siswa memindai beberapa kali pada hari yang sama, selalu gunakan status presensi terbaru.
 */
export const getLatestAttendanceForStudent = (
  siswa: Siswa,
  presensiList: Presensi[],
  targetDateStr: string = getLocalDateString()
): Presensi | null => {
  const matchingRecords = presensiList.filter(
    (p) => isPresensiMatchSiswa(p, siswa) && isPresensiDateMatch(p.tanggal, targetDateStr)
  );

  if (matchingRecords.length === 0) return null;
  if (matchingRecords.length === 1) return matchingRecords[0];

  // Urutkan berdasarkan waktu paling baru (misal '07:15:30' > '06:45:10' atau berdasarkan ID/Timestamp)
  return matchingRecords.sort((a, b) => {
    const timeA = a.waktu || '00:00:00';
    const timeB = b.waktu || '00:00:00';
    if (timeA !== timeB) {
      return timeB.localeCompare(timeA);
    }
    return b.id.localeCompare(a.id);
  })[0];
};

/**
 * Menghitung statistik kehadiran akurat per SISWA UNIK dalam satu rombel kelas.
 * Total Hadir + Terlambat + Sakit + Izin + Alfa + Belum Absen DIJAMIN selalu sama dengan totalSiswa.
 * Tidak akan pernah meluap/overcount akibat scan ganda atau duplicate logs di database.
 */
export interface AttendanceStatsSummary {
  totalSiswa: number;
  hadir: number;
  terlambat: number;
  sakit: number;
  izin: number;
  alfa: number;
  sakitDanIzin: number;
  belumAbsen: number;
  totalHadirSemua: number; // hadir + terlambat
  persentaseKeaktifan: number;
}

export const calculateClassAttendanceStats = (
  classStudents: Siswa[],
  presensiList: Presensi[],
  targetDateStr: string = getLocalDateString()
): AttendanceStatsSummary => {
  const totalSiswa = classStudents.length;

  let hadir = 0;
  let terlambat = 0;
  let sakit = 0;
  let izin = 0;
  let alfa = 0;
  let belumAbsen = 0;

  classStudents.forEach((siswa) => {
    const latestRecord = getLatestAttendanceForStudent(siswa, presensiList, targetDateStr);
    if (!latestRecord) {
      belumAbsen++;
    } else {
      switch (latestRecord.status) {
        case 'Hadir':
          hadir++;
          break;
        case 'Terlambat':
          terlambat++;
          break;
        case 'Sakit':
          sakit++;
          break;
        case 'Izin':
          izin++;
          break;
        case 'Alfa':
          alfa++;
          break;
        default:
          hadir++;
          break;
      }
    }
  });

  const totalHadirSemua = hadir + terlambat;
  const sakitDanIzin = sakit + izin;
  const persentaseKeaktifan = totalSiswa > 0 
    ? Math.min(100, Math.round((totalHadirSemua / totalSiswa) * 100)) 
    : 0;

  return {
    totalSiswa,
    hadir,
    terlambat,
    sakit,
    izin,
    alfa,
    sakitDanIzin,
    belumAbsen,
    totalHadirSemua,
    persentaseKeaktifan
  };
};

/**
 * Menghitung ringkasan statistik untuk seluruh sekolah (Semua Kelas) per siswa unik
 */
export const calculateSchoolAttendanceStats = (
  allStudents: Siswa[],
  presensiList: Presensi[],
  targetDateStr: string = getLocalDateString(),
  selectedKelas: string = 'Semua Kelas'
): AttendanceStatsSummary => {
  const studentsToEvaluate = selectedKelas === 'Semua Kelas'
    ? allStudents
    : allStudents.filter((s) => s.kelas === selectedKelas);

  return calculateClassAttendanceStats(studentsToEvaluate, presensiList, targetDateStr);
};
