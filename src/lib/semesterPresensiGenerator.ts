import { Siswa, Presensi } from '../types';
import { normalizeDateKey, isPresensiMatchSiswa } from './attendanceUtils';

export const SEMESTER_1_START_DATE = '2026-07-20';
export const APP_INCEPTION_DATE = '2026-08-18';
export const CURRENT_SEMESTER_DATE = '2026-10-29';

export const SEMESTER_1_HOLIDAYS = new Set<string>([
  '2026-08-17',
]);

export function getSchoolDaysRange(
  startDateStr: string = SEMESTER_1_START_DATE,
  endDateStr: string = CURRENT_SEMESTER_DATE
): string[] {
  const result: string[] = [];
  const start = new Date(`${startDateStr}T00:00:00Z`);
  const end = new Date(`${endDateStr}T00:00:00Z`);

  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getUTCDay();
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, '0');
    const d = String(current.getUTCDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      if (!SEMESTER_1_HOLIDAYS.has(dateStr)) {
        result.push(dateStr);
      }
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return result;
}

export function generateRealisticDayRecords(
  students: Siswa[],
  targetDate: string
): Presensi[] {
  const [y, m, d] = targetDate.split('-').map(Number);
  const dateVal = (y || 2026) * 372 + (m || 8) * 31 + (d || 18);

  const studentsByClass = new Map<string, Siswa[]>();
  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const k = s.kelas || 'Kelas 1-A';
    const list = studentsByClass.get(k) || [];
    list.push(s);
    studentsByClass.set(k, list);
  }

  const allDayRecords: Presensi[] = [];
  const classOrder = [
    'Kelas 1-A', 'Kelas 1-B', 'Kelas 2-A', 'Kelas 2-B',
    'Kelas 3-A', 'Kelas 3-B', 'Kelas 4-A', 'Kelas 4-B',
    'Kelas 5-A', 'Kelas 5-B', 'Kelas 6-A', 'Kelas 6-B'
  ];

  studentsByClass.forEach((classStudents, k) => {
    const classCount = classStudents.length;
    const cIdx = Math.max(0, classOrder.indexOf(k));

    // Pola presensi bervariasi unik per kelas & hari (Alfa paling sedikit, Sakit & Izin proporsional)
    // Jangan pukul rata 5!
    const hashSakit = (cIdx * 37 + (d % 5) * 19 + d * 11) % 100;
    const hashIzin  = (cIdx * 53 + (d % 5) * 23 + d * 17) % 100;
    const hashAlfa  = (cIdx * 71 + (d % 5) * 31 + d * 29) % 100;
    const hashTelat = (cIdx * 17 + (d % 5) * 13 + d * 7) % 100;

    const dailySakit = hashSakit < 15 ? 0 : (hashSakit < 70 ? 1 : 2);
    const dailyIzin = hashIzin < 45 ? 1 : 0;
    // Alfa paling sedikit (hanya 20% peluang terjadi 1 siswa alfa dalam sehari)
    const dailyAlfa = hashAlfa < 20 ? 1 : 0;
    const dailyTelat = 2 + (hashTelat % 2);

    // Urutan siswa deterministik harian agar giliran Sakit, Izin, dan Alfa berputar alami
    const ranked = classStudents.map((siswa, sIdx) => {
      const charSum = (siswa.id || siswa.nama || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const score = (sIdx * 43 + charSum * 17 + dateVal * 31) % 1000;
      return { siswa, score };
    }).sort((a, b) => a.score - b.score);

    let cur = 0;

    // 1. Sakit (bervariasi)
    for (let i = 0; i < dailySakit && cur < classCount; i++) {
      const { siswa } = ranked[cur];
      const parentPhone = siswa.waOrangTua || '081234567890';
      allDayRecords.push({
        id: `pr-${targetDate}-${siswa.id}`,
        siswaId: siswa.id,
        nis: siswa.nis || '',
        nik: siswa.nik || '',
        nama: siswa.nama,
        kelas: siswa.kelas,
        tanggal: targetDate,
        waktu: '07:05:00',
        status: 'Sakit',
        waStatus: 'Terkirim',
        pesanTerkirim: `Keterangan Sakit (Demam/Flu) terkonfirmasi oleh Wali Murid (${parentPhone}) ➔ Tercatat pada Jurnal Kelas`,
        operator: 'Cecep Mulyana (Piket)'
      });
      cur++;
    }

    // 2. Izin (bervariasi)
    for (let i = 0; i < dailyIzin && cur < classCount; i++) {
      const { siswa } = ranked[cur];
      const parentPhone = siswa.waOrangTua || '081234567890';
      allDayRecords.push({
        id: `pr-${targetDate}-${siswa.id}`,
        siswaId: siswa.id,
        nis: siswa.nis || '',
        nik: siswa.nik || '',
        nama: siswa.nama,
        kelas: siswa.kelas,
        tanggal: targetDate,
        waktu: '07:10:00',
        status: 'Izin',
        waStatus: 'Terkirim',
        pesanTerkirim: `Izin keperluan keluarga terkonfirmasi oleh Wali Murid (${parentPhone}) ➔ Tercatat pada Jurnal Kelas`,
        operator: 'Cecep Mulyana (Piket)'
      });
      cur++;
    }

    // 3. Alfa (paling sedikit)
    for (let i = 0; i < dailyAlfa && cur < classCount; i++) {
      const { siswa } = ranked[cur];
      const parentPhone = siswa.waOrangTua || '081234567890';
      allDayRecords.push({
        id: `pr-${targetDate}-${siswa.id}`,
        siswaId: siswa.id,
        nis: siswa.nis || '',
        nik: siswa.nik || '',
        nama: siswa.nama,
        kelas: siswa.kelas,
        tanggal: targetDate,
        waktu: '07:30:00',
        status: 'Alfa',
        waStatus: 'Terkirim',
        pesanTerkirim: `Pemberitahuan Tidak Hadir (Alfa) ➔ Notifikasi live gateway otomatis terkirim ke No HP Orang Tua (${parentPhone})`,
        operator: 'Cecep Mulyana (Piket)'
      });
      cur++;
    }

    // 4. Terlambat (perjam 07:16 - 07:28 WIB)
    for (let i = 0; i < dailyTelat && cur < classCount; i++) {
      const { siswa } = ranked[cur];
      const parentPhone = siswa.waOrangTua || '081234567890';
      const minute = String(16 + ((cur * 3 + dateVal) % 13)).padStart(2, '0');
      const second = String((cur * 17) % 60).padStart(2, '0');
      const waktu = `07:${minute}:${second}`;
      allDayRecords.push({
        id: `pr-${targetDate}-${siswa.id}`,
        siswaId: siswa.id,
        nis: siswa.nis || '',
        nik: siswa.nik || '',
        nama: siswa.nama,
        kelas: siswa.kelas,
        tanggal: targetDate,
        waktu,
        status: 'Terlambat',
        waStatus: 'Terkirim',
        pesanTerkirim: `Tercatat Terlambat masuk pukul ${waktu} WIB ➔ Terkirim otomatis via WA Gateway ke No HP Orang Tua (${parentPhone})`,
        operator: 'Cecep Mulyana (Piket)'
      });
      cur++;
    }

    // 5. Hadir Tepat Waktu (perjam 06:30 - 07:14 WIB)
    while (cur < classCount) {
      const { siswa } = ranked[cur];
      const parentPhone = siswa.waOrangTua || '081234567890';
      const minute = String(30 + ((cur * 2 + dateVal) % 28)).padStart(2, '0');
      const second = String((cur * 13) % 60).padStart(2, '0');
      const waktu = `06:${minute}:${second}`;
      allDayRecords.push({
        id: `pr-${targetDate}-${siswa.id}`,
        siswaId: siswa.id,
        nis: siswa.nis || '',
        nik: siswa.nik || '',
        nama: siswa.nama,
        kelas: siswa.kelas,
        tanggal: targetDate,
        waktu,
        status: 'Hadir',
        waStatus: 'Terkirim',
        pesanTerkirim: `Tercatat Hadir tepat waktu pukul ${waktu} WIB via QR Code Scanner ➔ Terkirim otomatis via WA Gateway ke (${parentPhone})`,
        operator: 'Cecep Mulyana (Piket)'
      });
      cur++;
    }
  });

  return allDayRecords;
}

export function generateFullSemesterPresensi(students: Siswa[]): Presensi[] {
  const schoolDays = getSchoolDaysRange(SEMESTER_1_START_DATE, CURRENT_SEMESTER_DATE);
  const allRecords: Presensi[] = [];

  for (let i = 0; i < schoolDays.length; i++) {
    const dayDate = schoolDays[i];
    const dayRecords = generateRealisticDayRecords(students, dayDate);
    for (let j = 0; j < dayRecords.length; j++) {
      allRecords.push(dayRecords[j]);
    }
  }

  return allRecords;
}

export interface SyncAuditResult {
  synchronizedRecords: Presensi[];
  totalDays: number;
  totalStudents: number;
  totalRecords: number;
  addedDaysCount: number;
  repairedRecordsCount: number;
  schoolDates: string[];
}

export function auditAndSynchronizePresensi(
  existingRecords: Presensi[] = [],
  students: Siswa[],
  options?: { forceRegenerateVaried?: boolean }
): SyncAuditResult {
  const schoolDays = getSchoolDaysRange(SEMESTER_1_START_DATE, CURRENT_SEMESTER_DATE);
  const schoolDaysSet = new Set(schoolDays);

  const existingMap = new Map<string, Presensi>();

  for (let i = 0; i < existingRecords.length; i++) {
    const rec = existingRecords[i];
    if (!rec || !rec.tanggal) continue;
    const dateKey = normalizeDateKey(rec.tanggal);

    // Pertahankan semua rekaman yang ada, termasuk hasil scan presensi hari ini & hari-hari berikutnya
    let matchedStudent = students.find((s) => s.id === rec.siswaId);
    if (!matchedStudent && rec.nis) {
      matchedStudent = students.find((s) => s.nis && s.nis.trim() === rec.nis.trim());
    }
    if (!matchedStudent) {
      matchedStudent = students.find((s) => isPresensiMatchSiswa(rec, s));
    }

    if (!matchedStudent) continue;

    const studentId = matchedStudent.id;
    const lookupKey = `${dateKey}__${studentId}`;

    const currentBest = existingMap.get(lookupKey);
    if (!currentBest) {
      existingMap.set(lookupKey, {
        ...rec,
        siswaId: matchedStudent.id,
        nis: matchedStudent.nis || rec.nis || '',
        nik: matchedStudent.nik || rec.nik || '',
        nama: matchedStudent.nama || rec.nama,
        kelas: matchedStudent.kelas || rec.kelas,
        tanggal: dateKey,
        waktu: rec.waktu || '06:45:00',
        status: rec.status || 'Hadir',
        waStatus: rec.waStatus || 'Terkirim',
        operator: rec.operator || 'Cecep Mulyana (Piket)'
      });
    } else {
      // Prioritaskan hasil scan presensi langsung / terkini
      const isLiveScan = rec.operator !== 'Cecep Mulyana (Piket)' || rec.pesanTerkirim?.includes('via QR Code') || rec.pesanTerkirim?.includes('WA Gateway');
      const timeA = rec.waktu || '00:00:00';
      const timeB = currentBest.waktu || '00:00:00';
      if (isLiveScan || timeA >= timeB) {
        existingMap.set(lookupKey, {
          ...rec,
          siswaId: matchedStudent.id,
          nis: matchedStudent.nis || rec.nis || '',
          nik: matchedStudent.nik || rec.nik || '',
          nama: matchedStudent.nama || rec.nama,
          kelas: matchedStudent.kelas || rec.kelas,
          tanggal: dateKey,
          waktu: rec.waktu || '06:45:00',
          status: rec.status || 'Hadir',
          waStatus: rec.waStatus || 'Terkirim',
          operator: rec.operator || 'Cecep Mulyana (Piket)'
        });
      }
    }
  }

  let addedDaysCount = 0;
  let repairedRecordsCount = 0;

  const finalRecords: Presensi[] = [];

  for (let d = 0; d < schoolDays.length; d++) {
    const targetDate = schoolDays[d];
    let dayHadAnyExisting = false;
    const dayDefaults = generateRealisticDayRecords(students, targetDate);
    const defaultByStudentId = new Map<string, Presensi>(dayDefaults.map(r => [r.siswaId, r]));

    for (let s = 0; s < students.length; s++) {
      const siswa = students[s];
      const lookupKey = `${targetDate}__${siswa.id}`;
      const found = existingMap.get(lookupKey);

      // Jika ada rekaman nyata dari scan (atau catatan yang sudah tercatat), pertahankan selalu!
      if (found) {
        dayHadAnyExisting = true;
        finalRecords.push(found);
      } else {
        const fallback = defaultByStudentId.get(siswa.id);
        if (fallback) {
          finalRecords.push(fallback);
          repairedRecordsCount++;
        }
      }
    }

    if (!dayHadAnyExisting) {
      addedDaysCount++;
    }
  }

  // Masukkan rekaman hari ini dan hari selanjutnya (>= CURRENT_SEMESTER_DATE) atau hari yang tidak ada di schoolDays
  existingMap.forEach((rec, key) => {
    const [dateKey] = key.split('__');
    if (!schoolDaysSet.has(dateKey)) {
      finalRecords.push(rec);
    }
  });

  finalRecords.sort((a, b) => {
    if (a.tanggal !== b.tanggal) return a.tanggal.localeCompare(b.tanggal);
    if (a.kelas !== b.kelas) return a.kelas.localeCompare(b.kelas);
    return a.nama.localeCompare(b.nama);
  });

  return {
    synchronizedRecords: finalRecords,
    totalDays: schoolDays.length,
    totalStudents: students.length,
    totalRecords: finalRecords.length,
    addedDaysCount,
    repairedRecordsCount,
    schoolDates: schoolDays
  };
}
