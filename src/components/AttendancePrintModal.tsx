import { useState, useMemo } from 'react';
import { 
  Printer, 
  X, 
  Download, 
  Calendar, 
  Layers, 
  CheckCircle2, 
  FileText,
  Building,
  School
} from 'lucide-react';
import { Siswa, Presensi, SystemSettings, DAFTAR_KELAS } from '../types';
import { DEFAULT_DIGIWANGI_LOGO, DEFAULT_SDN3_LOGO } from '../assets/officialLogos';
import { DIGIWANGI_LOGO_BASE64 } from '../assets/logoBase64';
import { 
  buildDailyAttendanceIndex, 
  getAttendanceFromIndex, 
  isSameClass, 
  calculateAllRombelSummaryList,
  normalizeDateKey
} from '../lib/attendanceUtils';
import { getWaliKelasByKelas } from '../lib/demoData';

interface AttendancePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  siswaList: Siswa[];
  presensiList: Presensi[];
  settings?: SystemSettings;
  defaultType?: 'harian' | 'mingguan' | 'bulanan' | 'rombel';
  defaultKelas?: string;
  defaultDate?: string;
  defaultMonth?: string;
}

export default function AttendancePrintModal({
  isOpen,
  onClose,
  siswaList,
  presensiList,
  settings,
  defaultType = 'harian',
  defaultKelas = 'Semua Kelas',
  defaultDate = '',
  defaultMonth = ''
}: AttendancePrintModalProps) {
  const [printType, setPrintType] = useState<'harian' | 'mingguan' | 'bulanan' | 'rombel'>(defaultType);
  const [selectedKelas, setSelectedKelas] = useState<string>(defaultKelas);
  const [targetDate, setTargetDate] = useState<string>(defaultDate || new Date().toISOString().slice(0, 10));
  const [targetMonth, setTargetMonth] = useState<string>(defaultMonth || new Date().toISOString().slice(0, 7));

  // Logo sources
  const appLogo = settings?.appLogoUrl || DEFAULT_DIGIWANGI_LOGO || DIGIWANGI_LOGO_BASE64;
  const schoolLogo = DEFAULT_SDN3_LOGO || appLogo;

  // Filter students
  const filteredStudents = useMemo(() => {
    const isAll = selectedKelas === 'Semua Kelas' || !selectedKelas;
    const list = isAll ? [...siswaList] : siswaList.filter(s => isSameClass(s.kelas, selectedKelas));
    return list.sort((a, b) => {
      if (a.kelas !== b.kelas) return a.kelas.localeCompare(b.kelas);
      return a.nama.localeCompare(b.nama);
    });
  }, [siswaList, selectedKelas]);

  // Daily index & stats
  const dailyIndex = useMemo(() => {
    return buildDailyAttendanceIndex(presensiList, targetDate);
  }, [presensiList, targetDate]);

  // Rombel summary list
  const rombelSummary = useMemo(() => {
    return calculateAllRombelSummaryList(siswaList, presensiList, targetDate);
  }, [siswaList, presensiList, targetDate]);

  // Weekly dates
  const weekDates = useMemo(() => {
    const baseDate = new Date(targetDate);
    const day = baseDate.getDay();
    const diff = baseDate.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(baseDate.setDate(diff));

    const dates: { dateStr: string; label: string; shortDay: string }[] = [];
    const indonesianDays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];

    for (let i = 0; i < 5; i++) {
      const nextDate = new Date(monday);
      nextDate.setDate(monday.getDate() + i);
      const tzOffset = nextDate.getTimezoneOffset() * 60000;
      const dateStr = (new Date(nextDate.getTime() - tzOffset)).toISOString().slice(0, 10);
      const dayNum = nextDate.getDate();
      const monthShort = nextDate.toLocaleDateString('id-ID', { month: 'short' });

      dates.push({
        dateStr,
        label: `${indonesianDays[i]}, ${dayNum} ${monthShort}`,
        shortDay: indonesianDays[i]
      });
    }
    return dates;
  }, [targetDate]);

  const weeklyIndexes = useMemo(() => {
    return weekDates.map(w => buildDailyAttendanceIndex(presensiList, w.dateStr));
  }, [weekDates, presensiList]);

  // Bulanan metrics
  const bulananEffectiveDays = useMemo(() => {
    const setDates = new Set<string>();
    presensiList.forEach(p => {
      const norm = normalizeDateKey(p.tanggal);
      if (norm.startsWith(targetMonth)) {
        setDates.add(norm);
      }
    });
    return Math.max(1, setDates.size || 20);
  }, [presensiList, targetMonth]);

  const formattedDateIndo = useMemo(() => {
    try {
      const d = new Date(targetDate);
      return d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return targetDate;
    }
  }, [targetDate]);

  const formattedMonthIndo = useMemo(() => {
    try {
      const d = new Date(`${targetMonth}-02`);
      return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    } catch {
      return targetMonth;
    }
  }, [targetMonth]);

  const waliKelasName = selectedKelas !== 'Semua Kelas' ? getWaliKelasByKelas(selectedKelas) : 'Seluruh Dewan Guru & Wali Kelas';

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white print:static">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-none print:rounded-none">
        
        {/* MODAL CONTROL HEADER (Hidden on Print) */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 rounded-2xl text-white shadow-md">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                Pratinjau & Cetak Dokumen Rekapitulasi Presensi
              </h2>
              <p className="text-xs text-blue-200">
                SDN 3 Karamatwangi • Format resmi A4 Siap Cetak atau Simpan sebagai PDF
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handlePrint}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-black py-2.5 px-4 rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer border border-blue-400"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Sekarang (Print / PDF)</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition cursor-pointer"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL CONFIGURATION FILTER TOOLBAR (Hidden on Print) */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-3 print:hidden text-xs">
          {/* Print Type Selector */}
          <div className="flex items-center bg-white rounded-xl p-1 border border-slate-200 shadow-2xs">
            <button
              onClick={() => setPrintType('harian')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                printType === 'harian' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rekap Harian
            </button>
            <button
              onClick={() => setPrintType('rombel')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                printType === 'rombel' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rekap Semua Rombel
            </button>
            <button
              onClick={() => setPrintType('mingguan')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                printType === 'mingguan' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Jurnal Mingguan
            </button>
            <button
              onClick={() => setPrintType('bulanan')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                printType === 'bulanan' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rekap Bulanan
            </button>
          </div>

          {/* Class filter (Disabled on Rombel) */}
          {printType !== 'rombel' && (
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-500">Kelas:</span>
              <select
                value={selectedKelas}
                onChange={(e) => setSelectedKelas(e.target.value)}
                className="bg-white border border-slate-200 font-bold py-1.5 px-3 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs"
              >
                <option value="Semua Kelas">Semua Kelas ({siswaList.length} Siswa)</option>
                {DAFTAR_KELAS.map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
          )}

          {/* Date Picker */}
          {printType !== 'bulanan' ? (
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-500">
                {printType === 'mingguan' ? 'Minggu Mulai:' : 'Tanggal:'}
              </span>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="bg-white border border-slate-200 font-bold py-1 px-2.5 rounded-xl text-slate-800 cursor-pointer shadow-2xs"
              />
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-500">Bulan:</span>
              <input
                type="month"
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                className="bg-white border border-slate-200 font-bold py-1 px-2.5 rounded-xl text-slate-800 cursor-pointer shadow-2xs"
              />
            </div>
          )}

          <div className="ml-auto text-[11px] text-slate-500 font-medium">
            Total Siswa Terpilih: <b>{printType === 'rombel' ? siswaList.length : filteredStudents.length} Siswa</b>
          </div>
        </div>

        {/* PRINTABLE DOCUMENT BODY */}
        <div className="p-6 sm:p-8 overflow-y-auto print:p-0 print:overflow-visible bg-white text-slate-900">
          
          {/* 1. KOP SURAT RESMI */}
          <div className="border-b-4 border-double border-black pb-3 mb-5 flex items-center justify-between text-center relative">
            <div className="w-20 h-20 shrink-0 flex items-center justify-center p-1">
              <img 
                src={schoolLogo} 
                alt="Logo Tut Wuri / Sekolah" 
                className="max-w-full max-h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            
            <div className="flex-1 px-4 text-center">
              <h4 className="text-xs sm:text-sm font-bold tracking-wider uppercase text-black leading-tight">
                PEMERINTAH KABUPATEN GARUT
              </h4>
              <h3 className="text-xs sm:text-sm font-extrabold tracking-wider uppercase text-black leading-tight">
                DINAS PENDIDIKAN
              </h3>
              <h2 className="text-base sm:text-xl font-black tracking-tight uppercase text-black leading-tight mt-0.5">
                SEKOLAH DASAR NEGERI 3 KARAMATWANGI
              </h2>
              <p className="text-[10px] sm:text-xs text-black font-medium leading-tight mt-1">
                Alamat: Kp. Cikopo RT 02 / RW 04, Desa Karamatwangi, Kec. Cisurupan, Kab. Garut, Jawa Barat 44163
              </p>
              <p className="text-[9px] sm:text-[10px] text-black font-semibold tracking-wide mt-0.5">
                NPSN: 20227181 • Akreditasi: A • Website / DIGIWANGI 3 Smart System
              </p>
            </div>

            <div className="w-20 h-20 shrink-0 flex items-center justify-center p-1">
              <img 
                src={appLogo} 
                alt="Logo DIGIWANGI 3" 
                className="max-w-full max-h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>

          {/* 2. DOKUMEN TITLE & METADATA */}
          <div className="text-center mb-5">
            <h1 className="text-base sm:text-lg font-black uppercase tracking-wide text-black underline underline-offset-4 decoration-1">
              {printType === 'harian' && `REKAPITULASI PRESENSI HARIAN SISWA`}
              {printType === 'rombel' && `REKAPITULASI PRESENSI HARIAN SELURUH ROMBEL KELAS (1-A s/d 6-B)`}
              {printType === 'mingguan' && `JURNAL MATRIKS KEHADIRAN SISWA MINGGUAN`}
              {printType === 'bulanan' && `BUKU REKAPITULASI KEHADIRAN BULANAN SISWA`}
            </h1>
            
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs text-black font-bold mt-2">
              {printType !== 'rombel' && (
                <span>Kelas / Rombel: <b className="text-black uppercase">{selectedKelas}</b></span>
              )}
              {printType === 'harian' && (
                <span>Hari / Tanggal: <b>{formattedDateIndo}</b></span>
              )}
              {printType === 'rombel' && (
                <span>Hari / Tanggal: <b>{formattedDateIndo}</b></span>
              )}
              {printType === 'mingguan' && (
                <span>Periode: <b>{weekDates[0].label} s/d {weekDates[4].label}</b></span>
              )}
              {printType === 'bulanan' && (
                <span>Periode Bulan: <b>{formattedMonthIndo}</b></span>
              )}
              <span>Tahun Pelajaran: <b>2025/2026</b></span>
            </div>
          </div>

          {/* 3. TABLE BODY DEPENDING ON PRINT TYPE */}

          {/* TYPE A: HARIAN DETAIL SISWA */}
          {printType === 'harian' && (
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-[11px] border-collapse border border-black">
                <thead>
                  <tr className="bg-slate-100 text-black font-black text-center border-b border-black">
                    <th className="border border-black py-1.5 px-2 w-10">No</th>
                    <th className="border border-black py-1.5 px-2 w-20">NIS</th>
                    <th className="border border-black py-1.5 px-3 text-left">Nama Lengkap Siswa</th>
                    <th className="border border-black py-1.5 px-2 w-16">Kelas</th>
                    <th className="border border-black py-1.5 px-2 w-16">Waktu</th>
                    <th className="border border-black py-1.5 px-3 w-28">Status</th>
                    <th className="border border-black py-1.5 px-3 w-32">Keterangan / Operator</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((siswa, idx) => {
                    const record = getAttendanceFromIndex(siswa, dailyIndex);
                    const status = record ? record.status : 'Belum Absen';
                    const waktu = record ? record.waktu : '-';
                    const operator = record ? record.operator : '-';

                    return (
                      <tr key={siswa.id} className="border-b border-black text-black">
                        <td className="border border-black py-1 px-2 text-center font-bold">{idx + 1}</td>
                        <td className="border border-black py-1 px-2 font-mono text-center">{siswa.nis || '-'}</td>
                        <td className="border border-black py-1 px-3 font-bold text-left">{siswa.nama}</td>
                        <td className="border border-black py-1 px-2 text-center">{siswa.kelas}</td>
                        <td className="border border-black py-1 px-2 text-center font-mono">{waktu}</td>
                        <td className="border border-black py-1 px-3 text-center font-black">
                          {status === 'Hadir' && 'HADIR'}
                          {status === 'Terlambat' && 'TERLAMBAT'}
                          {status === 'Sakit' && 'SAKIT'}
                          {status === 'Izin' && 'IZIN'}
                          {status === 'Alfa' && 'ALFA'}
                          {status === 'Belum Absen' && 'BELUM ABSEN'}
                        </td>
                        <td className="border border-black py-1 px-3 text-xs text-left truncate max-w-[120px]">
                          {operator}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* TYPE B: REKAPITULASI ROMBEL (1-A s/d 6-B) */}
          {printType === 'rombel' && (
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-[11px] border-collapse border border-black">
                <thead>
                  <tr className="bg-slate-100 text-black font-black text-center border-b border-black">
                    <th className="border border-black py-2 px-2 w-8" rowSpan={2}>No</th>
                    <th className="border border-black py-2 px-2 text-left w-20" rowSpan={2}>Rombel</th>
                    <th className="border border-black py-2 px-3 text-left w-36" rowSpan={2}>Wali Kelas</th>
                    <th className="border border-black py-2 px-2 w-14" rowSpan={2}>Jumlah Siswa</th>
                    <th className="border border-black py-1 px-2" colSpan={2}>Hadir Masuk</th>
                    <th className="border border-black py-1 px-2" colSpan={4}>Tidak Masuk / Pengurang</th>
                    <th className="border border-black py-2 px-2 w-16" rowSpan={2}>Total Hadir</th>
                    <th className="border border-black py-2 px-2 w-16" rowSpan={2}>Keaktifan (%)</th>
                  </tr>
                  <tr className="bg-slate-100 text-black font-bold text-center border-b border-black">
                    <th className="border border-black py-1 px-1.5 w-12">Tepat</th>
                    <th className="border border-black py-1 px-1.5 w-12">Telat</th>
                    <th className="border border-black py-1 px-1.5 w-12">Sakit</th>
                    <th className="border border-black py-1 px-1.5 w-12">Izin</th>
                    <th className="border border-black py-1 px-1.5 w-12">Alfa</th>
                    <th className="border border-black py-1 px-1.5 w-12">Belum</th>
                  </tr>
                </thead>
                <tbody>
                  {rombelSummary.map((r, idx) => (
                    <tr key={r.kelas} className="border-b border-black text-black">
                      <td className="border border-black py-1 px-2 text-center font-bold">{idx + 1}</td>
                      <td className="border border-black py-1 px-2 font-black text-left">{r.kelas}</td>
                      <td className="border border-black py-1 px-3 text-left">{r.waliKelas}</td>
                      <td className="border border-black py-1 px-2 text-center font-bold">{r.totalSiswa}</td>
                      <td className="border border-black py-1 px-1.5 text-center">{r.hadir}</td>
                      <td className="border border-black py-1 px-1.5 text-center">{r.terlambat}</td>
                      <td className="border border-black py-1 px-1.5 text-center">{r.sakit}</td>
                      <td className="border border-black py-1 px-1.5 text-center">{r.izin}</td>
                      <td className="border border-black py-1 px-1.5 text-center">{r.alfa}</td>
                      <td className="border border-black py-1 px-1.5 text-center">{r.belumAbsen}</td>
                      <td className="border border-black py-1 px-2 text-center font-black">{r.totalHadir}</td>
                      <td className="border border-black py-1 px-2 text-center font-black">{r.persentase}%</td>
                    </tr>
                  ))}
                  {/* GRAND TOTAL ROW */}
                  {(() => {
                    let totalS = 0, h = 0, t = 0, s = 0, i = 0, a = 0, b = 0, th = 0;
                    rombelSummary.forEach(r => {
                      totalS += r.totalSiswa; h += r.hadir; t += r.terlambat; s += r.sakit;
                      i += r.izin; a += r.alfa; b += r.belumAbsen; th += r.totalHadir;
                    });
                    const grandP = totalS > 0 ? Math.min(100, Math.round((th / totalS) * 100)) : 0;
                    return (
                      <tr className="bg-slate-200 font-black border-t-2 border-black text-black">
                        <td className="border border-black py-1.5 px-2 text-center" colSpan={3}>TOTAL KESELURUHAN SEKOLAH</td>
                        <td className="border border-black py-1.5 px-2 text-center">{totalS}</td>
                        <td className="border border-black py-1.5 px-1.5 text-center">{h}</td>
                        <td className="border border-black py-1.5 px-1.5 text-center">{t}</td>
                        <td className="border border-black py-1.5 px-1.5 text-center">{s}</td>
                        <td className="border border-black py-1.5 px-1.5 text-center">{i}</td>
                        <td className="border border-black py-1.5 px-1.5 text-center">{a}</td>
                        <td className="border border-black py-1.5 px-1.5 text-center">{b}</td>
                        <td className="border border-black py-1.5 px-2 text-center">{th}</td>
                        <td className="border border-black py-1.5 px-2 text-center">{grandP}%</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )}

          {/* TYPE C: MINGGUAN MATRIKS */}
          {printType === 'mingguan' && (
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-[11px] border-collapse border border-black">
                <thead>
                  <tr className="bg-slate-100 text-black font-black text-center border-b border-black">
                    <th className="border border-black py-1.5 px-2 w-8" rowSpan={2}>No</th>
                    <th className="border border-black py-1.5 px-2 w-16" rowSpan={2}>NIS</th>
                    <th className="border border-black py-1.5 px-3 text-left" rowSpan={2}>Nama Lengkap Siswa</th>
                    <th className="border border-black py-1.5 px-2 w-12" rowSpan={2}>Kelas</th>
                    <th className="border border-black py-1 px-2" colSpan={5}>Hari Kerja Efektif (Senin - Jumat)</th>
                    <th className="border border-black py-1 px-2" colSpan={4}>Rekapitulasi</th>
                    <th className="border border-black py-1.5 px-2 w-14" rowSpan={2}>%</th>
                  </tr>
                  <tr className="bg-slate-100 text-black font-bold text-center border-b border-black">
                    {weekDates.map(w => (
                      <th key={w.dateStr} className="border border-black py-1 px-1 w-12 text-[10px]">
                        {w.shortDay}
                      </th>
                    ))}
                    <th className="border border-black py-1 px-1 w-8 text-[10px]">H</th>
                    <th className="border border-black py-1 px-1 w-8 text-[10px]">S</th>
                    <th className="border border-black py-1 px-1 w-8 text-[10px]">I</th>
                    <th className="border border-black py-1 px-1 w-8 text-[10px]">A</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((siswa, idx) => {
                    let hCount = 0, sCount = 0, iCount = 0, aCount = 0;
                    const dayStatuses = weekDates.map((w, dayIdx) => {
                      const record = getAttendanceFromIndex(siswa, weeklyIndexes[dayIdx]);
                      if (!record) return '-';
                      if (record.status === 'Hadir') { hCount++; return 'H'; }
                      if (record.status === 'Terlambat') { hCount++; return 'T'; }
                      if (record.status === 'Sakit') { sCount++; return 'S'; }
                      if (record.status === 'Izin') { iCount++; return 'I'; }
                      if (record.status === 'Alfa') { aCount++; return 'A'; }
                      return '-';
                    });
                    const persen = Math.round((hCount / 5) * 100);

                    return (
                      <tr key={siswa.id} className="border-b border-black text-black">
                        <td className="border border-black py-1 px-2 text-center font-bold">{idx + 1}</td>
                        <td className="border border-black py-1 px-2 font-mono text-center">{siswa.nis || '-'}</td>
                        <td className="border border-black py-1 px-3 font-bold text-left">{siswa.nama}</td>
                        <td className="border border-black py-1 px-2 text-center">{siswa.kelas}</td>
                        {dayStatuses.map((st, i) => (
                          <td key={i} className="border border-black py-1 px-1 text-center font-black text-[10px]">
                            {st}
                          </td>
                        ))}
                        <td className="border border-black py-1 px-1 text-center font-bold">{hCount}</td>
                        <td className="border border-black py-1 px-1 text-center">{sCount}</td>
                        <td className="border border-black py-1 px-1 text-center">{iCount}</td>
                        <td className="border border-black py-1 px-1 text-center">{aCount}</td>
                        <td className="border border-black py-1 px-2 text-center font-black">{persen}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-2 text-[10px] text-black font-semibold flex items-center gap-4">
                <span>Keterangan:</span>
                <span><b>H:</b> Hadir (Tepat/Telat)</span>
                <span><b>S:</b> Sakit</span>
                <span><b>I:</b> Izin</span>
                <span><b>A:</b> Alfa</span>
                <span><b>-:</b> Belum Presensi</span>
              </div>
            </div>
          )}

          {/* TYPE D: BULANAN REKAP */}
          {printType === 'bulanan' && (
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-[11px] border-collapse border border-black">
                <thead>
                  <tr className="bg-slate-100 text-black font-black text-center border-b border-black">
                    <th className="border border-black py-1.5 px-2 w-8">No</th>
                    <th className="border border-black py-1.5 px-2 w-20">NIS</th>
                    <th className="border border-black py-1.5 px-3 text-left">Nama Lengkap Siswa</th>
                    <th className="border border-black py-1.5 px-2 w-14">Kelas</th>
                    <th className="border border-black py-1.5 px-2 w-16">Hari Efektif</th>
                    <th className="border border-black py-1.5 px-2 w-12">Hadir</th>
                    <th className="border border-black py-1.5 px-2 w-12">Telat</th>
                    <th className="border border-black py-1.5 px-2 w-12">Sakit</th>
                    <th className="border border-black py-1.5 px-2 w-12">Izin</th>
                    <th className="border border-black py-1.5 px-2 w-12">Alfa</th>
                    <th className="border border-black py-1.5 px-2 w-16">Keaktifan</th>
                    <th className="border border-black py-1.5 px-3 w-28">Kualifikasi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((siswa, idx) => {
                    const studentRecords = presensiList.filter(p => {
                      const matchSiswa = (p.siswaId && p.siswaId === siswa.id) ||
                                         (p.nis && siswa.nis && p.nis.trim() === siswa.nis.trim()) ||
                                         (p.nama && p.nama.trim().toLowerCase() === siswa.nama.trim().toLowerCase() && isSameClass(p.kelas, siswa.kelas));
                      if (!matchSiswa) return false;
                      const norm = normalizeDateKey(p.tanggal);
                      return norm.startsWith(targetMonth);
                    });

                    let hadir = 0, terlambat = 0, sakit = 0, izin = 0, alfa = 0;
                    const dateMap = new Map<string, string>();
                    studentRecords.forEach(r => {
                      const d = normalizeDateKey(r.tanggal);
                      if (!dateMap.has(d)) dateMap.set(d, r.status);
                    });

                    dateMap.forEach(status => {
                      if (status === 'Hadir') hadir++;
                      else if (status === 'Terlambat') terlambat++;
                      else if (status === 'Sakit') sakit++;
                      else if (status === 'Izin') izin++;
                      else if (status === 'Alfa') alfa++;
                    });

                    const totalMasuk = hadir + terlambat;
                    const persen = Math.min(100, Math.round((totalMasuk / bulananEffectiveDays) * 100));

                    let predikat = 'Rendah';
                    if (persen >= 90) predikat = 'Sangat Baik';
                    else if (persen >= 80) predikat = 'Baik';
                    else if (persen >= 60) predikat = 'Cukup';

                    return (
                      <tr key={siswa.id} className="border-b border-black text-black">
                        <td className="border border-black py-1 px-2 text-center font-bold">{idx + 1}</td>
                        <td className="border border-black py-1 px-2 font-mono text-center">{siswa.nis || '-'}</td>
                        <td className="border border-black py-1 px-3 font-bold text-left">{siswa.nama}</td>
                        <td className="border border-black py-1 px-2 text-center">{siswa.kelas}</td>
                        <td className="border border-black py-1 px-2 text-center font-mono">{bulananEffectiveDays}</td>
                        <td className="border border-black py-1 px-2 text-center font-bold">{hadir}</td>
                        <td className="border border-black py-1 px-2 text-center">{terlambat}</td>
                        <td className="border border-black py-1 px-2 text-center">{sakit}</td>
                        <td className="border border-black py-1 px-2 text-center">{izin}</td>
                        <td className="border border-black py-1 px-2 text-center">{alfa}</td>
                        <td className="border border-black py-1 px-2 text-center font-black">{persen}%</td>
                        <td className="border border-black py-1 px-3 text-center font-bold">{predikat}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 4. LEMBAR TANDA TANGAN / PENGESAHAN */}
          <div className="mt-8 pt-4 grid grid-cols-2 text-xs text-black break-inside-avoid">
            <div className="text-center px-4">
              <p className="font-medium">Mengetahui,</p>
              <p className="font-bold">Kepala SDN 3 Karamatwangi</p>
              <div className="h-20 flex items-center justify-center">
                {/* Space for stamp/signature */}
              </div>
              <p className="font-black underline uppercase">
                {settings?.namaKepsek || 'Cucu Maspika, S.Pd.I.,M.Pd.,MCE'}
              </p>
              <p className="font-mono text-[11px]">
                NIP. {settings?.nipKepsek || '197805122008012006'}
              </p>
            </div>

            <div className="text-center px-4">
              <p className="font-medium">
                Karamatwangi, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <p className="font-bold">
                {selectedKelas !== 'Semua Kelas' ? `Wali Kelas ${selectedKelas}` : 'Petugas Rekapitulasi Presensi'}
              </p>
              <div className="h-20 flex items-center justify-center">
                {/* Space for signature */}
              </div>
              <p className="font-black underline uppercase">
                {waliKelasName}
              </p>
              <p className="font-mono text-[11px]">
                NIP. ....................................................
              </p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
