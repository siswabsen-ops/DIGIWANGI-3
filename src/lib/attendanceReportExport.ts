import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import {
  Siswa,
  Presensi,
  SystemSettings,
  DAFTAR_KELAS,
  PenilaianAkhlak,
  DAFTAR_DIMENSI_PROFIL,
  SKALA_PENILAIAN_MAP,
  isRecordMatchStudent,
  getApplicableJadwal
} from '../types';
import {
  isSameClass,
  isPresensiMatchSiswa,
  buildDailyAttendanceIndex,
  getAttendanceFromIndex,
  buildPeriodAttendanceLookup,
  calculateStudentsMetricsFromLookup,
  getPeriodAuthoritativeRecords,
  calculatePeriodRombelSummary,
  getSemesterYearMonths,
  calculateAllRombelSummaryList,
  normalizeDateKey,
  getAttendanceShift,
  getMondayOfWeek,
  safeAddDays,
  safeDateParts,
  formatDateIndoLong,
  formatDateIndoShort,
  formatMonthIndo,
  isRecordNewer,
  getLocalDateString
} from './attendanceUtils';
import { getWaliKelasByKelas } from './demoData';
import {
  DIGI_COLORS,
  THIN_GRID_BORDER,
  HEADER_GRID_BORDER,
  TOTAL_TOP_BORDER,
  TOTAL_BOTTOM_BORDER,
  createConfiguredWorkbook,
  buildStyledWorksheet,
  downloadWorkbookXlsx,
  workbookToXlsxBuffer,
  triggerExcelBlobDownload,
  getUniqueSheetName,
  styleStatusCodeCell,
  styleMetodeCell,
  styleQualificationOrRateCell,
  ExcelLegendItem
} from './excelExportEngine';

export interface ClassReportOption {
  kelas: string;
  waliKelas: string;
  totalSiswa: number;
}

const ATTENDANCE_LEGEND: ExcelLegendItem[] = [
  { code: 'H', label: 'Hadir Tepat Waktu', fillHex: 'FFECFDF5', fontHex: 'FF0D6E51' },
  { code: 'T', label: 'Terlambat', fillHex: 'FFFEF3C7', fontHex: 'FF92400E' },
  { code: 'S', label: 'Sakit', fillHex: 'FFE0E7FF', fontHex: 'FF3730A3' },
  { code: 'I', label: 'Izin', fillHex: 'FFE0F2FE', fontHex: 'FF0369A1' },
  { code: 'A', label: 'Alfa', fillHex: 'FFFEE2E2', fontHex: 'FF991B1B' }
];

function sortStudentsByClassAndName(list: Siswa[]): Siswa[] {
  return [...list].sort((a, b) => {
    if (a.kelas !== b.kelas) return a.kelas.localeCompare(b.kelas);
    return a.nama.localeCompare(b.nama);
  });
}

function formatShortKelasLabel(kelas: string): string {
  return (kelas || '').replace(/^Kelas\s*/i, '').trim() || '-';
}

function getTahunAjaran(settings?: SystemSettings, explicit?: string): string {
  return explicit || settings?.tahunAjaran || '2026–2027';
}

function getKepsekName(settings?: SystemSettings): string {
  return settings?.namaKepsek || 'Cucu Maspika, S.Pd.I., M.Pd., MCE.';
}

function createPeriodDatePredicate(
  mode: 'harian' | 'mingguan' | 'bulanan' | 'semester' | 'range',
  dateOrPeriod: string,
  semesterOptions?: { semesterType: '1' | '2'; tahunAjaran: string },
  rangeStartDate?: string,
  rangeEndDate?: string
): {
  datePredicate: (normDate: string) => boolean;
  periodeLabel: string;
  targetYearMonths: string[];
} {
  if (mode === 'harian') {
    const target = normalizeDateKey(dateOrPeriod);
    return {
      datePredicate: (d) => d === target,
      periodeLabel: formatDateIndoLong(target),
      targetYearMonths: []
    };
  }
  if (mode === 'mingguan') {
    const monday = getMondayOfWeek(dateOrPeriod);
    const weekSet = new Set([0, 1, 2, 3, 4].map((i) => safeAddDays(monday, i)));
    const friday = safeAddDays(monday, 4);
    return {
      datePredicate: (d) => weekSet.has(d),
      periodeLabel: `${formatDateIndoShort(monday)} – ${formatDateIndoShort(friday)}`,
      targetYearMonths: []
    };
  }
  if (mode === 'bulanan') {
    const ym = (dateOrPeriod || '').slice(0, 7);
    return {
      datePredicate: (d) => d.startsWith(ym),
      periodeLabel: formatMonthIndo(ym),
      targetYearMonths: [ym]
    };
  }
  if (mode === 'range') {
    const start = normalizeDateKey(rangeStartDate || dateOrPeriod);
    const end = normalizeDateKey(rangeEndDate || dateOrPeriod);
    return {
      datePredicate: (d) => d >= start && d <= end,
      periodeLabel: `${formatDateIndoShort(start)} – ${formatDateIndoShort(end)}`,
      targetYearMonths: []
    };
  }
  const semType = semesterOptions?.semesterType || (dateOrPeriod.includes('SEM_2') ? '2' : '1');
  const thn = semesterOptions?.tahunAjaran || '2026/2027';
  const targetYearMonths = getSemesterYearMonths(semType, thn);
  return {
    datePredicate: (d) => targetYearMonths.some((ym) => d.startsWith(ym)),
    periodeLabel: `${semType === '1' ? 'Semester 1 (Ganjil)' : 'Semester 2 (Genap)'} ${thn}`,
    targetYearMonths
  };
}

function resolveStatusCode(status: string): 'H' | 'T' | 'S' | 'I' | 'A' | '' {
  if (status === 'Hadir') return 'H';
  if (status === 'Terlambat') return 'T';
  if (status === 'Sakit') return 'S';
  if (status === 'Izin') return 'I';
  if (status === 'Alfa') return 'A';
  return '';
}

function resolveMetodeDisplay(p: Presensi): string {
  if (p.metode === 'QR_SCAN') return 'Scan QR Code';
  if (p.metode === 'MANUAL_TAP' || p.metode === 'MANUAL_OPERATOR') return 'Manual Tap Wali';
  if (p.metodeLabel) {
    if (p.metodeLabel.toLowerCase().includes('qr') || p.metodeLabel.toLowerCase().includes('scan')) {
      return 'Scan QR Code';
    }
    return p.metodeLabel;
  }
  if (p.status === 'Hadir' || p.status === 'Terlambat') return 'Scan QR Code';
  return 'Manual Tap Wali';
}

function resolveWaDisplay(p: Presensi): string {
  if (!p.waStatus || p.waStatus === 'Terkirim') return 'Terkirim ke Wali';
  if (p.waStatus === 'Gagal') return 'Gagal Terkirim';
  return 'Menunggu / Pending';
}

/**
 * ============================================================================
 * TEMPLATE 1: LOG PRESENSI HARIAN (QR & MANUAL) — SDN 3 KARAMATWANGI
 * Sesuai layout PDF resmi: DIGIWANGI_log_presensi_harian
 * ============================================================================
 */
export function addLogPresensiHarianSheet(
  wb: ExcelJS.Workbook,
  options: {
    sheetName?: string;
    periodeLabel: string;
    kelasFilter: string;
    records: Presensi[];
    siswaList: Siswa[];
    settings?: SystemSettings;
    mode?: 'harian' | 'mingguan' | 'bulanan' | 'semester' | 'range';
    dateOrPeriod?: string;
    semesterOptions?: { semesterType: '1' | '2'; tahunAjaran: string };
    rangeStartDate?: string;
    rangeEndDate?: string;
  }
) {
  const {
    sheetName = 'Log Presensi Harian',
    periodeLabel,
    kelasFilter,
    records,
    siswaList,
    settings,
    mode,
    dateOrPeriod,
    semesterOptions,
    rangeStartDate,
    rangeEndDate
  } = options;

  const isAll = !kelasFilter || kelasFilter === 'Semua Kelas' || kelasFilter === 'SEMUA KELAS';
  const datePredicate =
    mode && dateOrPeriod
      ? createPeriodDatePredicate(mode, dateOrPeriod, semesterOptions, rangeStartDate, rangeEndDate).datePredicate
      : () => true;

  // Gunakan sumber otoritatif terpadu agar jumlah Log sinkron 100% dengan Ringkasan Per Kelas (TOTAL LOG)
  const authoritativeItems = getPeriodAuthoritativeRecords(siswaList, records, datePredicate, kelasFilter);
  const sortedLogs = authoritativeItems.map((item) => item.record);

  const rows: (string | number)[][] = authoritativeItems.map(({ siswa, record: rec }, idx) => {
    const nisVal = siswa.nis || rec.nis || '-';
    const nisnVal = siswa.nisn || siswa.nik || '-';
    const namaVal = siswa.nama || rec.nama || '-';
    const kelasVal = formatShortKelasLabel(siswa.kelas || rec.kelas || '-');

    return [
      idx + 1,
      rec.tanggal,
      rec.waktu || '-',
      nisVal,
      nisnVal,
      namaVal,
      kelasVal,
      rec.status,
      resolveMetodeDisplay(rec),
      resolveWaDisplay(rec)
    ];
  });

  const waliName = isAll
    ? 'Panji Teguh Amarta Surya, S.Pd.I., Gr.'
    : getWaliKelasByKelas(kelasFilter);

  buildStyledWorksheet({
    workbook: wb,
    sheetName,
    tabColor: DIGI_COLORS.EMERALD_HEADER,
    title: 'LOG PRESENSI HARIAN (QR & MANUAL) — SDN 3 KARAMATWANGI',
    metaInfo: `Periode: ${periodeLabel} · Kelas: ${isAll ? 'Semua Kelas' : kelasFilter} · Total: ${sortedLogs.length} catatan`,
    headers: [
      'NO',
      'TANGGAL',
      'JAM (WIB)',
      'NIS',
      'NISN',
      'NAMA SISWA',
      'KELAS',
      'STATUS',
      'METODE',
      'NOTIFIKASI WA WALI'
    ],
    rows,
    columnMeta: [
      { width: 6, align: 'center', isNumeric: true },
      { width: 13, align: 'center' },
      { width: 12, align: 'center' },
      { width: 13, align: 'center', isTextId: true },
      { width: 15, align: 'center', isTextId: true },
      { minWidth: 28, maxWidth: 38, align: 'left' },
      { width: 10, align: 'center' },
      { width: 13, align: 'center' },
      { width: 18, align: 'center' },
      { width: 20, align: 'center' }
    ],
    cellStyler: (_rIdx, cIdx, val) => {
      if (cIdx === 6) return { align: 'center', bold: true };
      if (cIdx === 7) return styleStatusCodeCell(val);
      if (cIdx === 8) return styleMetodeCell(val);
      if (cIdx === 9) {
        const s = String(val || '').toLowerCase();
        if (s.includes('terkirim')) return { fillHex: 'FFECFDF5', fontHex: 'FF0D6E51', bold: true, align: 'center' };
        if (s.includes('gagal')) return { fillHex: 'FFFEE2E2', fontHex: 'FF991B1B', bold: true, align: 'center' };
        return { fontHex: DIGI_COLORS.TEXT_MUTED, align: 'center' };
      }
      return undefined;
    },
    signatureLeftLabel: 'Mengetahui,\nKepala Sekolah',
    signatureLeftName: getKepsekName(settings),
    signatureRightLabel: isAll
      ? `Cisurupan, Garut, ${periodeLabel}\nPetugas Piket / Operator`
      : `Cisurupan, Garut, ${periodeLabel}\nGuru / Wali ${kelasFilter}`,
    signatureRightName: waliName,
    orientation: 'landscape'
  });
}

/**
 * ============================================================================
 * TEMPLATE 2: DAFTAR HADIR SISWA KELAS (MATRIKS 2-ROW HEADER) — SDN 3 KARAMATWANGI
 * Sesuai layout PDF resmi: DIGIWANGI_Rekap_kelas
 * Mendukung mode Bulanan/Harian (Tanggal 1..30/31) maupun Mingguan (5 Hari Kerja)
 * ============================================================================
 */
export function addDaftarHadirKelasSheet(
  wb: ExcelJS.Workbook,
  options: {
    sheetName?: string;
    kelas: string;
    mode: 'harian' | 'bulanan' | 'mingguan';
    monthOrMondayStr: string;
    highlightDateStr?: string;
    siswaList: Siswa[];
    presensiList: Presensi[];
    settings?: SystemSettings;
    tahunAjaran?: string;
  }
) {
  const {
    sheetName,
    kelas,
    mode,
    monthOrMondayStr,
    highlightDateStr,
    siswaList,
    presensiList,
    settings,
    tahunAjaran
  } = options;

  const isAll = !kelas || kelas === 'Semua Kelas' || kelas === 'SEMUA KELAS';
  const filteredStudents = sortStudentsByClassAndName(
    isAll ? siswaList : siswaList.filter((s) => isSameClass(s.kelas, kelas))
  );

  const shortKelas = isAll ? 'SEMUA KELAS' : formatShortKelasLabel(kelas);
  const resolvedSheetName = getUniqueSheetName(wb, sheetName || (isAll ? 'Daftar Hadir Semua' : `Kelas ${shortKelas}`));

  // Tentukan daftar kolom tanggal
  interface DayColDef {
    dateStr: string;
    headerLabel: string;
  }
  const dayCols: DayColDef[] = [];
  let periodeLabel = '';
  let groupHeaderLabel = '';
  let tanggalBarLabel = '';

  if (mode === 'harian') {
    const targetDate = normalizeDateKey(monthOrMondayStr);
    const { day } = safeDateParts(targetDate);
    const monthName = formatMonthIndo(targetDate.slice(0, 7));
    dayCols.push({
      dateStr: targetDate,
      headerLabel: String(day)
    });
    periodeLabel = formatDateIndoLong(targetDate);
    groupHeaderLabel = `TGL (${monthName.toUpperCase()})`;
    tanggalBarLabel = periodeLabel;
  } else if (mode === 'bulanan') {
    const ym = monthOrMondayStr.slice(0, 7);
    const [yrStr, moStr] = ym.split('-');
    const year = parseInt(yrStr, 10) || 2026;
    const month = parseInt(moStr, 10) || 11;
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthName = formatMonthIndo(ym);

    for (let d = 1; d <= daysInMonth; d++) {
      dayCols.push({
        dateStr: `${ym}-${String(d).padStart(2, '0')}`,
        headerLabel: String(d)
      });
    }
    periodeLabel = monthName;
    groupHeaderLabel = `TANGGAL (${monthName.toUpperCase()})`;
    tanggalBarLabel = highlightDateStr ? formatDateIndoLong(highlightDateStr) : monthName;
  } else {
    const monday = getMondayOfWeek(monthOrMondayStr);
    const dayShortNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum'];
    for (let i = 0; i < 5; i++) {
      const ds = safeAddDays(monday, i);
      const { day, month } = safeDateParts(ds);
      dayCols.push({
        dateStr: ds,
        headerLabel: `${dayShortNames[i]}\n${day}/${String(month).padStart(2, '0')}`
      });
    }
    const friday = dayCols[dayCols.length - 1].dateStr;
    periodeLabel = `${formatDateIndoShort(monday)} – ${formatDateIndoShort(friday)}`;
    groupHeaderLabel = `HARI & TANGGAL (${periodeLabel.toUpperCase()})`;
    tanggalBarLabel = periodeLabel;
  }

  // Indeks presensi harian untuk setiap kolom tanggal (O(N))
  const dayIndexes = dayCols.map((dc) => buildDailyAttendanceIndex(presensiList, dc.dateStr));

  // Gunakan jumlah hari efektif sekolah yang seragam di periode ini agar 100% sinkron dengan Ringkasan Per Kelas & UI
  const periodDateSet = new Set(dayCols.map((dc) => dc.dateStr));
  const activeDaysCount =
    mode === 'harian'
      ? 1
      : buildPeriodAttendanceLookup(siswaList, presensiList, (d) => periodDateSet.has(d)).effectiveDays;

  // Kumpulkan baris siswa + statistik harian & total
  let sumH = 0;
  let sumT = 0;
  let sumS = 0;
  let sumI = 0;
  let sumA = 0;
  const dailyHadirTelatCounts: number[] = dayCols.map(() => 0);

  interface PreparedStudentRow {
    no: number;
    nis: string;
    nisn: string;
    kelasShort: string;
    nama: string;
    dayCodes: string[];
    h: number;
    t: number;
    s: number;
    i: number;
    a: number;
    rateFraction: number;
  }

  const studentRows: PreparedStudentRow[] = filteredStudents.map((siswa, idx) => {
    let h = 0;
    let t = 0;
    let s = 0;
    let i = 0;
    let a = 0;

    const dayCodes = dayCols.map((_, dayIdx) => {
      const rec = getAttendanceFromIndex(siswa, dayIndexes[dayIdx]);
      if (!rec) return '';
      const code = resolveStatusCode(rec.status);
      if (code === 'H') {
        h++;
        dailyHadirTelatCounts[dayIdx]++;
      } else if (code === 'T') {
        t++;
        dailyHadirTelatCounts[dayIdx]++;
      } else if (code === 'S') {
        s++;
      } else if (code === 'I') {
        i++;
      } else if (code === 'A') {
        a++;
      }
      return code;
    });

    sumH += h;
    sumT += t;
    sumS += s;
    sumI += i;
    sumA += a;

    const totalMasuk = h + t;
    const rateFraction = Math.min(1, totalMasuk / activeDaysCount);

    return {
      no: idx + 1,
      nis: siswa.nis || '-',
      nisn: siswa.nisn || siswa.nik || '-',
      kelasShort: formatShortKelasLabel(siswa.kelas),
      nama: siswa.nama,
      dayCodes,
      h,
      t,
      s,
      i,
      a,
      rateFraction
    };
  });

  const totalLogs = sumH + sumT + sumS + sumI + sumA;
  const totalSlots = Math.max(1, filteredStudents.length * activeDaysCount);
  const overallFraction = filteredStudents.length > 0 ? Math.min(1, (sumH + sumT) / totalSlots) : 0;
  const overallPct = Math.round(overallFraction * 100);

  // Jam Shift & Wali Kelas
  const waliName = isAll ? 'Panji Teguh Amarta Surya, S.Pd.I., Gr.' : getWaliKelasByKelas(kelas);
  const shiftVal = getAttendanceShift(null, isAll ? 'Kelas 1-A' : kelas, undefined, settings);
  const jadwalKelas = settings ? getApplicableJadwal(isAll ? 'Kelas 1-A' : kelas, settings) : undefined;
  const jamMasukStr = jadwalKelas?.jamMasuk || (shiftVal === 'Siang' ? '12:30' : '07:00');
  const jamDisplay = `${jamMasukStr} WIB (${shiftVal})`;
  const thnAjar = getTahunAjaran(settings, tahunAjaran);

  // Total kolom tabel: 5 (NO..NAMA) + dayCols.length + 6 (H,T,S,I,A,% HADIR)
  const dateStartCol = 6;
  const dateEndCol = 5 + dayCols.length;
  const summaryStartCol = dateEndCol + 1;
  const totalCols = summaryStartCol + 5; // +6 cols (summaryStartCol .. summaryStartCol+5)

  const ws = wb.addWorksheet(resolvedSheetName, {
    properties: { tabColor: { argb: DIGI_COLORS.EMERALD_HEADER } },
    views: [{ showGridLines: true }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.28, right: 0.28, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 }
    }
  });

  // Row 1: Top Spacer
  ws.addRow([]).height = 8;

  // Row 2: Title
  const titleText = isAll
    ? 'DAFTAR HADIR SISWA SEMUA KELAS — SDN 3 KARAMATWANGI'
    : `DAFTAR HADIR SISWA KELAS ${shortKelas.toUpperCase()} — SDN 3 KARAMATWANGI`;
  const r2 = ws.addRow([titleText]);
  ws.mergeCells(2, 1, 2, totalCols);
  r2.height = 24;
  r2.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: DIGI_COLORS.EMERALD_TITLE } };
  r2.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // Row 3: Subtitle
  const r3 = ws.addRow([`Cisurupan, Garut | Tahun Pelajaran ${thnAjar} | Periode: ${periodeLabel}`]);
  ws.mergeCells(3, 1, 3, totalCols);
  r3.height = 17;
  r3.getCell(1).font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: DIGI_COLORS.TEXT_MUTED } };
  r3.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // Row 4: Mint Summary Box
  const summaryText =
    `Ringkasan: Total Siswa ${filteredStudents.length} · Tercatat ${totalLogs} log · ` +
    `Hadir (H): ${sumH} · Terlambat (T): ${sumT} · Sakit (S): ${sumS} · Izin (I): ${sumI} · Alfa (A): ${sumA} · ` +
    `Persentase Kehadiran: ${overallPct}%`;
  const r4 = ws.addRow([summaryText]);
  ws.mergeCells(4, 1, 4, totalCols);
  r4.height = 22;
  for (let c = 1; c <= totalCols; c++) {
    const cell = r4.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DIGI_COLORS.MINT_SUMMARY_BG } };
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: DIGI_COLORS.MINT_TOTAL_TEXT } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: DIGI_COLORS.MINT_SUMMARY_BORDER } },
      bottom: { style: 'thin', color: { argb: DIGI_COLORS.MINT_SUMMARY_BORDER } },
      left: c === 1 ? { style: 'thin', color: { argb: DIGI_COLORS.MINT_SUMMARY_BORDER } } : undefined,
      right: c === totalCols ? { style: 'thin', color: { argb: DIGI_COLORS.MINT_SUMMARY_BORDER } } : undefined
    };
  }

  // Row 5: JAM / TANGGAL / WALI KELAS Info Bar
  const r5 = ws.addRow([`JAM : ${jamDisplay}        TANGGAL : ${tanggalBarLabel}        WALI KELAS : ${waliName}`]);
  ws.mergeCells(5, 1, 5, totalCols);
  r5.height = 20;
  r5.getCell(1).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: DIGI_COLORS.TEXT_DARK } };
  r5.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // Row 6: Spacer
  ws.addRow([]).height = 6;

  // Row 7 & 8: 2-Row Grouped Header
  const headerTop = ws.addRow([]); // Row 7
  const headerBot = ws.addRow([]); // Row 8
  headerTop.height = 20;
  headerBot.height = mode === 'mingguan' ? 28 : 20;

  const fixedHeaders = ['NO', 'NIS', 'NISN', 'KELAS', 'NAMA SISWA'];
  fixedHeaders.forEach((lbl, idx) => {
    const c = idx + 1;
    headerTop.getCell(c).value = lbl;
    ws.mergeCells(7, c, 8, c);
  });

  headerTop.getCell(dateStartCol).value = groupHeaderLabel;
  if (dayCols.length > 1) {
    ws.mergeCells(7, dateStartCol, 7, dateEndCol);
  }
  dayCols.forEach((dc, idx) => {
    headerBot.getCell(dateStartCol + idx).value =
      mode === 'bulanan' || mode === 'harian' ? Number(dc.headerLabel) : dc.headerLabel;
  });

  headerTop.getCell(summaryStartCol).value = 'JUMLAH';
  ws.mergeCells(7, summaryStartCol, 7, totalCols);
  ['H', 'T', 'S', 'I', 'A', '% HADIR'].forEach((lbl, idx) => {
    headerBot.getCell(summaryStartCol + idx).value = lbl;
  });

  // Terapkan style Emerald ke seluruh sel header 2 baris
  for (let rIdx = 7; rIdx <= 8; rIdx++) {
    const r = ws.getRow(rIdx);
    for (let c = 1; c <= totalCols; c++) {
      const cell = r.getCell(c);
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DIGI_COLORS.EMERALD_HEADER } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: HEADER_GRID_BORDER,
        bottom: HEADER_GRID_BORDER,
        left: HEADER_GRID_BORDER,
        right: HEADER_GRID_BORDER
      };
    }
  }

  ws.views = [{ state: 'frozen', xSplit: 5, ySplit: 8, showGridLines: true }];

  // Student Data Rows
  studentRows.forEach((sr) => {
    const rowValues: (string | number)[] = [
      sr.no,
      sr.nis,
      sr.nisn,
      sr.kelasShort,
      sr.nama,
      ...sr.dayCodes,
      sr.h,
      sr.t,
      sr.s,
      sr.i,
      sr.a,
      sr.rateFraction
    ];

    const row = ws.addRow(rowValues);
    row.height = 19;

    for (let c = 1; c <= totalCols; c++) {
      const cell = row.getCell(c);
      const val = rowValues[c - 1];

      let bgHex = 'FFFFFFFF';
      let fontHex = DIGI_COLORS.TEXT_DARK;
      let bold = false;
      let horiz: 'left' | 'center' | 'right' = 'center';

      if (c === 1) {
        horiz = 'center';
        cell.numFmt = '#,##0';
      } else if (c === 2 || c === 3) {
        horiz = 'center';
        cell.numFmt = '@';
      } else if (c === 4) {
        horiz = 'center';
      } else if (c === 5) {
        horiz = 'left';
      } else if (c >= dateStartCol && c <= dateEndCol) {
        const override = styleStatusCodeCell(val as string);
        if (override?.fillHex) bgHex = override.fillHex;
        if (override?.fontHex) fontHex = override.fontHex;
        if (override?.bold) bold = true;
        horiz = 'center';
      } else if (c >= summaryStartCol && c <= summaryStartCol + 4) {
        horiz = 'center';
        cell.numFmt = '#,##0';
        bold = Number(val) > 0;
        if (c === summaryStartCol && Number(val) > 0) fontHex = DIGI_COLORS.EMERALD_TITLE;
      } else if (c === totalCols) {
        horiz = 'center';
        cell.numFmt = '0%';
        bold = true;
        fontHex =
          sr.rateFraction >= 0.8 ? DIGI_COLORS.EMERALD_TITLE : sr.rateFraction > 0 ? 'FF92400E' : DIGI_COLORS.TEXT_MUTED;
      }

      cell.font = { name: 'Calibri', size: 9, bold, color: { argb: fontHex } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgHex } };
      cell.alignment = { vertical: 'middle', horizontal: horiz };
      cell.border = {
        top: THIN_GRID_BORDER,
        bottom: THIN_GRID_BORDER,
        left: THIN_GRID_BORDER,
        right: THIN_GRID_BORDER
      };
    }
  });

  // Total Row (Mint Green)
  const totalValues: (string | number)[] = [
    `TOTAL KESELURUHAN (${filteredStudents.length} SISWA)`,
    '',
    '',
    '',
    '',
    ...dailyHadirTelatCounts.map((cnt) => (cnt > 0 ? cnt : '')),
    sumH,
    sumT,
    sumS,
    sumI,
    sumA,
    overallFraction
  ];

  const totalRow = ws.addRow(totalValues);
  totalRow.height = 22;
  ws.mergeCells(totalRow.number, 1, totalRow.number, 5);

  for (let c = 1; c <= totalCols; c++) {
    const cell = totalRow.getCell(c);
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: DIGI_COLORS.MINT_TOTAL_TEXT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DIGI_COLORS.MINT_TOTAL_BG } };
    cell.alignment = { vertical: 'middle', horizontal: c <= 5 ? 'left' : 'center' };
    if (c === totalCols) {
      cell.numFmt = '0%';
    } else if (c >= dateStartCol && typeof totalValues[c - 1] === 'number') {
      cell.numFmt = '#,##0';
    }
    cell.border = {
      top: TOTAL_TOP_BORDER,
      bottom: TOTAL_BOTTOM_BORDER,
      left: THIN_GRID_BORDER,
      right: THIN_GRID_BORDER
    };
  }

  // Column widths
  ws.getColumn(1).width = 4.8;
  ws.getColumn(2).width = 11.5;
  ws.getColumn(3).width = 13.5;
  ws.getColumn(4).width = 7.5;
  ws.getColumn(5).width = 28;
  for (let c = dateStartCol; c <= dateEndCol; c++) {
    ws.getColumn(c).width = mode === 'bulanan' ? 3.5 : mode === 'harian' ? 9 : 10;
  }
  for (let c = summaryStartCol; c <= summaryStartCol + 4; c++) {
    ws.getColumn(c).width = 5;
  }
  ws.getColumn(totalCols).width = 8.8;

  // Footer Legend
  ws.addRow([]).height = 6;
  const legendRow = ws.addRow([
    'Keterangan Kode: H = Hadir Tepat Waktu | T = Terlambat | S = Sakit | I = Izin | A = Alfa | ' +
      'Angka pada baris TOTAL kolom tanggal menunjukkan jumlah siswa Hadir/Terlambat.'
  ]);
  ws.mergeCells(legendRow.number, 1, legendRow.number, totalCols);
  legendRow.height = 17;
  legendRow.getCell(1).font = { name: 'Calibri', size: 8.5, italic: true, color: { argb: DIGI_COLORS.TEXT_MUTED } };
  legendRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

  // Signature Block
  ws.addRow([]).height = 10;
  const rightCol = Math.max(dateStartCol + Math.floor(dayCols.length * 0.68), totalCols - 6);

  const s1 = ws.addRow([]);
  s1.height = 16;
  s1.getCell(2).value = 'Mengetahui,';
  s1.getCell(2).font = { name: 'Calibri', size: 9.5, color: { argb: DIGI_COLORS.TEXT_DARK } };
  s1.getCell(rightCol).value = `Cisurupan, Garut, ${periodeLabel}`;
  s1.getCell(rightCol).font = { name: 'Calibri', size: 9.5, color: { argb: DIGI_COLORS.TEXT_DARK } };

  const s2 = ws.addRow([]);
  s2.height = 16;
  s2.getCell(2).value = 'Kepala Sekolah';
  s2.getCell(2).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: DIGI_COLORS.TEXT_DARK } };
  s2.getCell(rightCol).value = isAll ? 'Petugas Piket / Admin' : 'Guru / Wali Kelas';
  s2.getCell(rightCol).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: DIGI_COLORS.TEXT_DARK } };

  ws.addRow([]).height = 20;
  ws.addRow([]).height = 18;

  const sName = ws.addRow([]);
  sName.height = 18;
  sName.getCell(2).value = getKepsekName(settings);
  sName.getCell(2).font = { name: 'Calibri', size: 9.5, bold: true, underline: true, color: { argb: DIGI_COLORS.TEXT_DARK } };
  sName.getCell(rightCol).value = waliName;
  sName.getCell(rightCol).font = { name: 'Calibri', size: 9.5, bold: true, underline: true, color: { argb: DIGI_COLORS.TEXT_DARK } };
}

/**
 * ============================================================================
 * TEMPLATE 3: RINGKASAN KEAKTIFAN PER KELAS — SDN 3 KARAMATWANGI
 * Sesuai layout PDF resmi: DIGIWANGI_ringkasan_perkelas
 * ============================================================================
 */
export function addRingkasanPerKelasSheet(
  wb: ExcelJS.Workbook,
  options: {
    sheetName?: string;
    mode: 'harian' | 'mingguan' | 'bulanan' | 'semester' | 'range';
    dateOrPeriod: string;
    siswaList: Siswa[];
    presensiList: Presensi[];
    semesterOptions?: { semesterType: '1' | '2'; tahunAjaran: string };
    rangeStartDate?: string;
    rangeEndDate?: string;
    settings?: SystemSettings;
  }
) {
  const {
    sheetName = 'Ringkasan Per Kelas',
    mode,
    dateOrPeriod,
    siswaList,
    presensiList,
    semesterOptions,
    rangeStartDate,
    rangeEndDate,
    settings
  } = options;

  const thnAjar = getTahunAjaran(settings, semesterOptions?.tahunAjaran);
  let periodeLabel = '';
  let effectiveDays = 1;
  let summaryList = calculateAllRombelSummaryList(siswaList, presensiList, dateOrPeriod, settings);
  let grandPct = 0;

  if (mode === 'harian') {
    periodeLabel = formatDateIndoLong(dateOrPeriod);
    effectiveDays = 1;
    const totalSiswaHarian = summaryList.reduce((acc, r) => acc + r.totalSiswa, 0);
    const totalMasukHarian = summaryList.reduce((acc, r) => acc + r.totalHadir, 0);
    grandPct = totalSiswaHarian > 0 ? Math.min(100, Math.round((totalMasukHarian / totalSiswaHarian) * 100)) : 0;
  } else {
    const resolved = createPeriodDatePredicate(mode, dateOrPeriod, semesterOptions, rangeStartDate, rangeEndDate);
    periodeLabel = resolved.periodeLabel;
    const periodName =
      mode === 'mingguan'
        ? 'Mingguan'
        : mode === 'bulanan'
        ? 'Bulanan'
        : mode === 'range'
        ? 'Rentang Waktu'
        : 'Semester';
    const periodSummary = calculatePeriodRombelSummary(
      siswaList,
      presensiList,
      resolved.datePredicate,
      periodName,
      settings
    );
    summaryList = periodSummary.rombelList;
    effectiveDays = periodSummary.effectiveDays;
    grandPct = periodSummary.persentase;
  }

  let totalSiswaAll = 0;
  let totalLogsAll = 0;
  let totalHAll = 0;
  let totalTAll = 0;
  let totalSAll = 0;
  let totalIAll = 0;
  let totalAAll = 0;

  const rows: (string | number)[][] = summaryList.map((r, idx) => {
    const totalLogs = r.hadir + r.terlambat + r.sakit + r.izin + r.alfa;
    totalSiswaAll += r.totalSiswa;
    totalLogsAll += totalLogs;
    totalHAll += r.hadir;
    totalTAll += r.terlambat;
    totalSAll += r.sakit;
    totalIAll += r.izin;
    totalAAll += r.alfa;

    return [
      idx + 1,
      r.kelas,
      r.totalSiswa,
      totalLogs,
      r.hadir,
      r.terlambat,
      r.sakit,
      r.izin,
      r.alfa,
      (r.persentase || 0) / 100
    ];
  });

  buildStyledWorksheet({
    workbook: wb,
    sheetName,
    tabColor: DIGI_COLORS.EMERALD_HEADER,
    title: 'RINGKASAN KEAKTIFAN PER KELAS — SDN 3 KARAMATWANGI',
    metaInfo: `Periode: ${periodeLabel} · Tahun Pelajaran ${thnAjar} · Hari Efektif: ${effectiveDays} Hari`,
    headers: [
      'NO',
      'KELAS',
      'JUMLAH SISWA',
      'TOTAL LOG',
      'HADIR (H)',
      'TERLAMBAT (T)',
      'SAKIT (S)',
      'IZIN (I)',
      'ALFA (A)',
      '% KEAKTIFAN'
    ],
    rows,
    totalRow: [
      '-',
      'TOTAL SEKOLAH',
      totalSiswaAll,
      totalLogsAll,
      totalHAll,
      totalTAll,
      totalSAll,
      totalIAll,
      totalAAll,
      grandPct / 100
    ],
    columnMeta: [
      { width: 6, align: 'center', isNumeric: true },
      { width: 15, align: 'center' },
      { width: 15, align: 'center', isNumeric: true },
      { width: 13, align: 'center', isNumeric: true },
      { width: 12, align: 'center', isNumeric: true },
      { width: 15, align: 'center', isNumeric: true },
      { width: 12, align: 'center', isNumeric: true },
      { width: 11, align: 'center', isNumeric: true },
      { width: 11, align: 'center', isNumeric: true },
      { width: 14, align: 'center', isPercent: true }
    ],
    cellStyler: (_rIdx, cIdx, val) => {
      if (cIdx === 1) return { bold: true, align: 'center', fontHex: DIGI_COLORS.TEXT_DARK };
      if (cIdx === 4 && Number(val) > 0) return { fontHex: DIGI_COLORS.EMERALD_TITLE, bold: true, align: 'center' };
      if (cIdx === 9) return styleQualificationOrRateCell(val);
      return undefined;
    },
    legendItems: ATTENDANCE_LEGEND,
    signatureLeftLabel: 'Mengetahui,\nKepala Sekolah',
    signatureLeftName: getKepsekName(settings),
    signatureRightLabel: `Cisurupan, Garut, ${periodeLabel}\nPetugas Piket / Admin`,
    signatureRightName: 'Panji Teguh Amarta Surya, S.Pd.I., Gr.',
    orientation: 'landscape'
  });
}

/**
 * ============================================================================
 * HELPER: REKAP SEMESTER PER KELAS (Gaya Clean Emerald DIGIWANGI 3)
 * ============================================================================
 */
export function addSemesterClassSheetToWorkbook(
  wb: ExcelJS.Workbook,
  sheetName: string,
  kelas: string,
  semesterType: '1' | '2',
  tahunAjaran: string,
  siswaList: Siswa[],
  presensiList: Presensi[],
  settings?: SystemSettings
) {
  const isAll = !kelas || kelas === 'Semua Kelas' || kelas === 'SEMUA KELAS';
  const filteredStudents = sortStudentsByClassAndName(
    isAll ? siswaList : siswaList.filter((s) => isSameClass(s.kelas, kelas))
  );
  const targetYearMonths = getSemesterYearMonths(semesterType, tahunAjaran);
  const lookup = buildPeriodAttendanceLookup(siswaList, presensiList, (d) =>
    targetYearMonths.some((ym) => d.startsWith(ym))
  );
  const effectiveDays = lookup.effectiveDays;
  const studentMetrics = calculateStudentsMetricsFromLookup(filteredStudents, lookup);

  let sumH = 0;
  let sumT = 0;
  let sumS = 0;
  let sumI = 0;
  let sumA = 0;
  let sumMasuk = 0;

  const rows: (string | number)[][] = studentMetrics.map((m, idx) => {
    const { siswa, hadir, terlambat, sakit, izin, alfa, totalMasuk, persen } = m;
    let predikat = 'Perlu Bimbingan';
    if (persen >= 90) predikat = 'Sangat Baik (A)';
    else if (persen >= 80) predikat = 'Baik (B)';
    else if (persen >= 60) predikat = 'Cukup (C)';

    sumH += hadir;
    sumT += terlambat;
    sumS += sakit;
    sumI += izin;
    sumA += alfa;
    sumMasuk += totalMasuk;

    return [
      idx + 1,
      siswa.nis || '-',
      siswa.nisn || siswa.nik || '-',
      formatShortKelasLabel(siswa.kelas),
      siswa.nama,
      effectiveDays,
      hadir,
      terlambat,
      sakit,
      izin,
      alfa,
      totalMasuk,
      persen / 100,
      predikat
    ];
  });

  const totalSlots = filteredStudents.length * effectiveDays;
  const overallPersen = totalSlots > 0 ? Math.min(100, Math.round((sumMasuk / totalSlots) * 100)) : 0;
  const semLabel = semesterType === '1' ? 'Semester 1 (Ganjil • Juli–Des)' : 'Semester 2 (Genap • Jan–Jun)';
  const waliName = isAll ? 'Panji Teguh Amarta Surya, S.Pd.I., Gr.' : getWaliKelasByKelas(kelas);

  buildStyledWorksheet({
    workbook: wb,
    sheetName,
    tabColor: DIGI_COLORS.EMERALD_HEADER,
    title: `REKAP PRESENSI SEMESTER ${isAll ? 'SEMUA KELAS' : kelas.toUpperCase()} — SDN 3 KARAMATWANGI`,
    metaInfo: `Cisurupan, Garut | Tahun Pelajaran ${tahunAjaran} | ${semLabel} | Hari Efektif: ${effectiveDays} Hari`,
    headers: ['NO', 'NIS', 'NISN', 'KELAS', 'NAMA SISWA', 'EFEKTIF', 'H', 'T', 'S', 'I', 'A', 'MASUK', '% HADIR', 'PREDIKAT'],
    rows,
    totalRow: [
      '-',
      '',
      '',
      isAll ? 'SEMUA' : formatShortKelasLabel(kelas),
      `TOTAL (${filteredStudents.length} SISWA)`,
      effectiveDays,
      sumH,
      sumT,
      sumS,
      sumI,
      sumA,
      sumMasuk,
      overallPersen / 100,
      overallPersen >= 90 ? 'Sangat Baik (A)' : overallPersen >= 80 ? 'Baik (B)' : overallPersen >= 60 ? 'Cukup (C)' : 'Perlu Bimbingan'
    ],
    columnMeta: [
      { width: 6, align: 'center', isNumeric: true },
      { width: 13, align: 'center', isTextId: true },
      { width: 15, align: 'center', isTextId: true },
      { width: 9, align: 'center' },
      { minWidth: 26, maxWidth: 36, align: 'left' },
      { width: 9, align: 'center', isNumeric: true },
      { width: 7, align: 'center', isNumeric: true },
      { width: 7, align: 'center', isNumeric: true },
      { width: 7, align: 'center', isNumeric: true },
      { width: 7, align: 'center', isNumeric: true },
      { width: 7, align: 'center', isNumeric: true },
      { width: 9, align: 'center', isNumeric: true },
      { width: 10, align: 'center', isPercent: true },
      { width: 18, align: 'center' }
    ],
    cellStyler: (_rIdx, cIdx, val) => {
      if (cIdx === 12 || cIdx === 13) return styleQualificationOrRateCell(val);
      return undefined;
    },
    legendItems: ATTENDANCE_LEGEND,
    signatureLeftLabel: 'Mengetahui,\nKepala Sekolah',
    signatureLeftName: getKepsekName(settings),
    signatureRightLabel: isAll
      ? `Cisurupan, Garut\nPetugas Piket / Admin`
      : `Cisurupan, Garut\nGuru / Wali ${kelas}`,
    signatureRightName: waliName,
    orientation: 'landscape'
  });
}

/**
 * ============================================================================
 * EXPORT BUILDER WORKBOOK (Dapat dipakai baik untuk download browser maupun verifikasi)
 * ============================================================================
 */
export function buildSingleClassReportWorkbook(
  type: 'harian' | 'mingguan' | 'bulanan' | 'semester',
  kelas: string,
  dateOrPeriod: string,
  siswaList: Siswa[],
  presensiList: Presensi[],
  semesterOptions?: { semesterType: '1' | '2'; tahunAjaran: string },
  settings?: SystemSettings
): { workbook: ExcelJS.Workbook; filename: string } {
  const wb = createConfiguredWorkbook();
  const isAll = !kelas || kelas === 'Semua Kelas' || kelas === 'SEMUA KELAS';
  const cleanKelas = kelas.replace(/[\s-]+/g, '_').toUpperCase();
  const { periodeLabel } = createPeriodDatePredicate(type, dateOrPeriod, semesterOptions);

  let filename = '';

  if (type === 'harian') {
    const normDay = normalizeDateKey(dateOrPeriod);
    const monthStr = normDay.slice(0, 7);
    if (isAll) {
      addRingkasanPerKelasSheet(wb, {
        sheetName: 'Ringkasan Per Kelas',
        mode: 'harian',
        dateOrPeriod: normDay,
        siswaList,
        presensiList,
        settings
      });
      addLogPresensiHarianSheet(wb, {
        sheetName: 'Log Presensi Harian',
        periodeLabel,
        kelasFilter: 'Semua Kelas',
        records: presensiList,
        siswaList,
        settings,
        mode: 'harian',
        dateOrPeriod: normDay
      });
      DAFTAR_KELAS.forEach((cls) => {
        addDaftarHadirKelasSheet(wb, {
          sheetName: `Kelas ${formatShortKelasLabel(cls)}`,
          kelas: cls,
          mode: 'harian',
          monthOrMondayStr: normDay,
          highlightDateStr: normDay,
          siswaList,
          presensiList,
          settings
        });
      });
    } else {
      addDaftarHadirKelasSheet(wb, {
        sheetName: `Daftar Hadir ${formatShortKelasLabel(kelas)}`,
        kelas,
        mode: 'harian',
        monthOrMondayStr: normDay,
        highlightDateStr: normDay,
        siswaList,
        presensiList,
        settings
      });
      addLogPresensiHarianSheet(wb, {
        sheetName: 'Log Presensi Harian',
        periodeLabel,
        kelasFilter: kelas,
        records: presensiList,
        siswaList,
        settings,
        mode: 'harian',
        dateOrPeriod: normDay
      });
      addDaftarHadirKelasSheet(wb, {
        sheetName: `Matriks ${formatMonthIndo(monthStr)}`,
        kelas,
        mode: 'bulanan',
        monthOrMondayStr: monthStr,
        highlightDateStr: normDay,
        siswaList,
        presensiList,
        settings
      });
    }
    filename = `DIGIWANGI_REKAP_HARIAN_${cleanKelas}_${normDay}.xlsx`;
  } else if (type === 'mingguan') {
    const monday = getMondayOfWeek(dateOrPeriod);
    if (isAll) {
      addRingkasanPerKelasSheet(wb, {
        sheetName: 'Ringkasan Per Kelas',
        mode: 'mingguan',
        dateOrPeriod: monday,
        siswaList,
        presensiList,
        settings
      });
      addLogPresensiHarianSheet(wb, {
        sheetName: 'Log Presensi Harian',
        periodeLabel,
        kelasFilter: 'Semua Kelas',
        records: presensiList,
        siswaList,
        settings,
        mode: 'mingguan',
        dateOrPeriod: monday
      });
      DAFTAR_KELAS.forEach((cls) => {
        addDaftarHadirKelasSheet(wb, {
          sheetName: `Kelas ${formatShortKelasLabel(cls)}`,
          kelas: cls,
          mode: 'mingguan',
          monthOrMondayStr: monday,
          siswaList,
          presensiList,
          settings
        });
      });
    } else {
      addDaftarHadirKelasSheet(wb, {
        sheetName: `Daftar Hadir ${formatShortKelasLabel(kelas)}`,
        kelas,
        mode: 'mingguan',
        monthOrMondayStr: monday,
        siswaList,
        presensiList,
        settings
      });
      addLogPresensiHarianSheet(wb, {
        sheetName: 'Log Presensi Harian',
        periodeLabel,
        kelasFilter: kelas,
        records: presensiList,
        siswaList,
        settings,
        mode: 'mingguan',
        dateOrPeriod: monday
      });
    }
    filename = `DIGIWANGI_REKAP_MINGGUAN_${cleanKelas}_${monday}.xlsx`;
  } else if (type === 'bulanan') {
    const ym = dateOrPeriod.slice(0, 7);
    if (isAll) {
      addRingkasanPerKelasSheet(wb, {
        sheetName: 'Ringkasan Per Kelas',
        mode: 'bulanan',
        dateOrPeriod: ym,
        siswaList,
        presensiList,
        settings
      });
      addLogPresensiHarianSheet(wb, {
        sheetName: 'Log Presensi Harian',
        periodeLabel,
        kelasFilter: 'Semua Kelas',
        records: presensiList,
        siswaList,
        settings,
        mode: 'bulanan',
        dateOrPeriod: ym
      });
      DAFTAR_KELAS.forEach((cls) => {
        addDaftarHadirKelasSheet(wb, {
          sheetName: `Kelas ${formatShortKelasLabel(cls)}`,
          kelas: cls,
          mode: 'bulanan',
          monthOrMondayStr: ym,
          siswaList,
          presensiList,
          settings
        });
      });
    } else {
      addDaftarHadirKelasSheet(wb, {
        sheetName: `Daftar Hadir ${formatShortKelasLabel(kelas)}`,
        kelas,
        mode: 'bulanan',
        monthOrMondayStr: ym,
        siswaList,
        presensiList,
        settings
      });
      addLogPresensiHarianSheet(wb, {
        sheetName: 'Log Presensi Harian',
        periodeLabel,
        kelasFilter: kelas,
        records: presensiList,
        siswaList,
        settings,
        mode: 'bulanan',
        dateOrPeriod: ym
      });
    }
    filename = `DIGIWANGI_REKAP_BULANAN_${cleanKelas}_${ym}.xlsx`;
  } else {
    const semType = semesterOptions?.semesterType || (dateOrPeriod.includes('SEM_2') ? '2' : '1');
    const thn = semesterOptions?.tahunAjaran || '2026/2027';
    if (isAll) {
      addRingkasanPerKelasSheet(wb, {
        sheetName: 'Ringkasan Per Kelas',
        mode: 'semester',
        dateOrPeriod,
        siswaList,
        presensiList,
        semesterOptions: { semesterType: semType, tahunAjaran: thn },
        settings
      });
      addLogPresensiHarianSheet(wb, {
        sheetName: 'Log Presensi Harian',
        periodeLabel,
        kelasFilter: 'Semua Kelas',
        records: presensiList,
        siswaList,
        settings,
        mode: 'semester',
        dateOrPeriod,
        semesterOptions: { semesterType: semType, tahunAjaran: thn }
      });
      addSemesterClassSheetToWorkbook(wb, 'Rekap Semua Siswa', 'Semua Kelas', semType, thn, siswaList, presensiList, settings);
    } else {
      addSemesterClassSheetToWorkbook(wb, `Semester ${formatShortKelasLabel(kelas)}`, kelas, semType, thn, siswaList, presensiList, settings);
      addLogPresensiHarianSheet(wb, {
        sheetName: 'Log Presensi Harian',
        periodeLabel,
        kelasFilter: kelas,
        records: presensiList,
        siswaList,
        settings,
        mode: 'semester',
        dateOrPeriod,
        semesterOptions: { semesterType: semType, tahunAjaran: thn }
      });
    }
    filename = `DIGIWANGI_REKAP_SEMESTER_${semType}_${cleanKelas}_${thn.replace('/', '-')}.xlsx`;
  }

  return { workbook: wb, filename };
}

/**
 * TRIGGER DOWNLOAD SINGLE CLASS / ALL CLASSES MODERN STYLED EXCEL (.XLSX)
 */
export async function downloadSingleClassReport(
  type: 'harian' | 'mingguan' | 'bulanan' | 'semester',
  kelas: string,
  dateOrPeriod: string,
  siswaList: Siswa[],
  presensiList: Presensi[],
  semesterOptions?: { semesterType: '1' | '2'; tahunAjaran: string },
  settings?: SystemSettings
): Promise<void> {
  const { workbook, filename } = buildSingleClassReportWorkbook(
    type,
    kelas,
    dateOrPeriod,
    siswaList,
    presensiList,
    semesterOptions,
    settings
  );
  await downloadWorkbookXlsx(workbook, filename);
}

/**
 * TRIGGER DOWNLOAD SEMUA KELAS DALAM PAKET ZIP (.XLSX PER KELAS + MASTER WORKBOOK + RINGKASAN + LOG)
 */
export async function downloadAllClassesZip(
  type: 'harian' | 'mingguan' | 'bulanan' | 'semester',
  dateOrPeriod: string,
  siswaList: Siswa[],
  presensiList: Presensi[],
  onProgress?: (current: number, total: number, className: string) => void,
  semesterOptions?: { semesterType: '1' | '2'; tahunAjaran: string },
  settings?: SystemSettings
) {
  const zip = new JSZip();
  const classes = DAFTAR_KELAS;
  const total = classes.length + 3;
  const { periodeLabel } = createPeriodDatePredicate(type, dateOrPeriod, semesterOptions);

  // 01: Ringkasan Per Kelas
  onProgress?.(1, total, 'Ringkasan Keaktifan Per Kelas (.xlsx)');
  const summaryWb = createConfiguredWorkbook();
  addRingkasanPerKelasSheet(summaryWb, {
    sheetName: 'Ringkasan Per Kelas',
    mode: type,
    dateOrPeriod,
    siswaList,
    presensiList,
    semesterOptions,
    settings
  });
  zip.file(`01_DIGIWANGI_RINGKASAN_PER_KELAS_${dateOrPeriod.replace('/', '-')}.xlsx`, await workbookToXlsxBuffer(summaryWb));

  // 02: Log Presensi Harian (QR & Manual)
  onProgress?.(2, total, 'Log Presensi Harian QR & Manual (.xlsx)');
  const logWb = createConfiguredWorkbook();
  addLogPresensiHarianSheet(logWb, {
    sheetName: 'Log Presensi Harian',
    periodeLabel,
    kelasFilter: 'Semua Kelas',
    records: presensiList,
    siswaList,
    settings,
    mode: type,
    dateOrPeriod,
    semesterOptions
  });
  zip.file(`02_DIGIWANGI_LOG_PRESENSI_HARIAN_${dateOrPeriod.replace('/', '-')}.xlsx`, await workbookToXlsxBuffer(logWb));

  // Per-Kelas Workbooks
  for (let i = 0; i < classes.length; i++) {
    const cls = classes[i];
    onProgress?.(i + 3, total, `Daftar Hadir ${cls}`);
    const { workbook: clsWb } = buildSingleClassReportWorkbook(
      type,
      cls,
      dateOrPeriod,
      siswaList,
      presensiList,
      semesterOptions,
      settings
    );
    const cleanName = cls.replace(/[\s-]+/g, '_');
    zip.file(`REKAP_${cleanName}_${dateOrPeriod.replace('/', '-')}.xlsx`, await workbookToXlsxBuffer(clsWb));
  }

  // 00: Master Workbook Lengkap (Ringkasan + Log + 12 Kelas)
  onProgress?.(total, total, 'Master Workbook Lengkap (.xlsx)');
  const { workbook: masterWb } = buildSingleClassReportWorkbook(
    type,
    'Semua Kelas',
    dateOrPeriod,
    siswaList,
    presensiList,
    semesterOptions,
    settings
  );
  zip.file(`00_MASTER_LENGKAP_DIGIWANGI_${dateOrPeriod.replace('/', '-')}.xlsx`, await workbookToXlsxBuffer(masterWb));

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerExcelBlobDownload(zipBlob, `PAKET_LAPORAN_DIGIWANGI_${type.toUpperCase()}_${dateOrPeriod.replace('/', '-')}.zip`);
}

/**
 * EKSPOR EXCEL DASHBOARD KEPALA SEKOLAH (Template 3 Ringkasan Per Kelas + Template 1 Log Presensi Harian)
 */
export function buildKepsekRekapWorkbook(
  selectedKelas: string,
  filterType: string,
  filteredLogs: Presensi[],
  siswaList: Siswa[],
  presensiList: Presensi[],
  settings?: SystemSettings
): { workbook: ExcelJS.Workbook; filename: string } {
  const wb = createConfiguredWorkbook();
  const today = getLocalDateString();
  const isDaily = filterType === 'hari';
  const startDate = filterType === 'minggu' ? safeAddDays(today, -6) : safeAddDays(today, -29);
  const periodLabel = isDaily
    ? formatDateIndoLong(today)
    : filterType === 'minggu'
    ? `7 Hari Terakhir (${formatDateIndoShort(startDate)} – ${formatDateIndoShort(today)})`
    : `30 Hari Terakhir (${formatDateIndoShort(startDate)} – ${formatDateIndoShort(today)})`;

  // Sheet 1: Ringkasan Keaktifan Per Kelas
  addRingkasanPerKelasSheet(wb, {
    sheetName: 'Ringkasan Per Kelas',
    mode: isDaily ? 'harian' : 'range',
    dateOrPeriod: today,
    rangeStartDate: isDaily ? undefined : startDate,
    rangeEndDate: isDaily ? undefined : today,
    siswaList,
    presensiList,
    settings
  });

  // Sheet 2: Log Presensi Harian (QR & Manual) sesuai filter kepsek
  addLogPresensiHarianSheet(wb, {
    sheetName: 'Log Presensi Harian',
    periodeLabel: periodLabel,
    kelasFilter: selectedKelas,
    records: presensiList.length > 0 ? presensiList : filteredLogs,
    siswaList,
    settings,
    mode: isDaily ? 'harian' : 'range',
    dateOrPeriod: today,
    rangeStartDate: isDaily ? undefined : startDate,
    rangeEndDate: isDaily ? undefined : today
  });

  const cleanCls = selectedKelas.replace(/[\s-]+/g, '_').toUpperCase();
  return {
    workbook: wb,
    filename: `DIGIWANGI_LAPORAN_KEPSEK_${cleanCls}_${today}.xlsx`
  };
}

export async function downloadKepsekRekapExcel(
  selectedKelas: string,
  filterType: string,
  filteredLogs: Presensi[],
  siswaList: Siswa[],
  presensiList: Presensi[],
  settings?: SystemSettings
): Promise<void> {
  const { workbook, filename } = buildKepsekRekapWorkbook(
    selectedKelas,
    filterType,
    filteredLogs,
    siswaList,
    presensiList,
    settings
  );
  await downloadWorkbookXlsx(workbook, filename);
}

/**
 * EKSPOR EXCEL PENILAIAN AKHLAK & PROFIL PELAJAR PANCASILA (Gaya Clean Emerald DIGIWANGI 3)
 */
export async function downloadAkhlakRekapExcel(
  selectedKelas: string,
  filteredList: PenilaianAkhlak[],
  siswaList: Siswa[]
): Promise<void> {
  const wb = createConfiguredWorkbook();

  const rows: (string | number)[][] = filteredList.map((item, idx) => {
    const student = siswaList.find((s) => isRecordMatchStudent(item.kunci_siswa, s));
    const dim = DAFTAR_DIMENSI_PROFIL.find((d) => d.id === item.dimensi_profil);
    const skalaInfo = SKALA_PENILAIAN_MAP[item.nilai_skala];

    return [
      idx + 1,
      item.kunci_siswa || '-',
      student ? student.nama : 'Tidak Ditemukan',
      student ? formatShortKelasLabel(student.kelas) : '-',
      item.tanggal,
      dim ? dim.nama : `Dimensi ${item.dimensi_profil}`,
      item.sub_bidang_akhlak || '-',
      item.nilai_skala,
      skalaInfo ? skalaInfo.label : '-',
      item.catatan_singkat || '-',
      item.tahun_ajaran,
      `Sem ${item.semester}`,
      item.penilai || '-'
    ];
  });

  const waliName = selectedKelas === 'Semua Kelas' ? 'Guru PAI & Wali Kelas' : getWaliKelasByKelas(selectedKelas);

  buildStyledWorksheet({
    workbook: wb,
    sheetName: 'Penilaian Akhlak P5',
    tabColor: DIGI_COLORS.EMERALD_HEADER,
    title: `REKAP PENILAIAN AKHLAK & PROFIL PELAJAR PANCASILA — SDN 3 KARAMATWANGI`,
    metaInfo: `Kelas: ${selectedKelas} · Total Catatan: ${filteredList.length} · Kurikulum Merdeka`,
    headers: [
      'NO',
      'NISN / NIK',
      'NAMA SISWA',
      'KELAS',
      'TANGGAL',
      'DIMENSI PROFIL PANCASILA',
      'SUB-BIDANG AKHLAK',
      'SKALA',
      'KETERANGAN SKALA',
      'CATATAN PENGAMATAN GURU',
      'TAHUN PELAJARAN',
      'SEMESTER',
      'PENILAI'
    ],
    rows,
    columnMeta: [
      { width: 6, align: 'center', isNumeric: true },
      { minWidth: 14, maxWidth: 18, align: 'center', isTextId: true },
      { minWidth: 24, maxWidth: 32, align: 'left' },
      { width: 10, align: 'center' },
      { width: 12, align: 'center' },
      { minWidth: 22, maxWidth: 30, align: 'left', wrapText: true },
      { minWidth: 18, maxWidth: 26, align: 'left', wrapText: true },
      { width: 8, align: 'center' },
      { width: 20, align: 'center' },
      { minWidth: 26, maxWidth: 38, align: 'left', wrapText: true },
      { width: 14, align: 'center' },
      { width: 10, align: 'center' },
      { minWidth: 18, maxWidth: 26, align: 'left' }
    ],
    cellStyler: (_rIdx, cIdx, val) => {
      if (cIdx === 7 || cIdx === 8) return styleQualificationOrRateCell(val);
      return undefined;
    },
    signatureLeftLabel: 'Mengetahui,\nKepala Sekolah',
    signatureLeftName: 'Cucu Maspika, S.Pd.I., M.Pd., MCE.',
    signatureRightLabel: `Cisurupan, Garut\nPenilai / ${selectedKelas}`,
    signatureRightName: waliName
  });

  await downloadWorkbookXlsx(
    wb,
    `DIGIWANGI_PENILAIAN_AKHLAK_${selectedKelas.replace(/[\s-]+/g, '_').toUpperCase()}_${getLocalDateString()}.xlsx`
  );
}
