import { useState, useMemo, useEffect } from 'react';
import { 
  Download, 
  X, 
  FileSpreadsheet, 
  Calendar, 
  Printer, 
  Check, 
  Loader2, 
  Users, 
  Layers, 
  Archive,
  Search,
  Filter,
  CheckCircle2
} from 'lucide-react';
import { Siswa, Presensi, SystemSettings, DAFTAR_KELAS } from '../types';
import { getWaliKelasByKelas } from '../lib/demoData';
import { downloadSingleClassReport, downloadAllClassesZip } from '../lib/attendanceReportExport';
import {
  isSameClass,
  getLocalDateString,
  calculateAllRombelSummaryList,
  calculateWeeklyRombelSummaryList,
  calculateMonthlyRombelSummaryList,
  calculateSemesterRombelSummaryList,
  getMondayOfWeek,
  safeAddDays,
  formatDateIndoShort,
  formatMonthIndo,
  ClassRombelSummary
} from '../lib/attendanceUtils';

interface ClassReportDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  siswaList: Siswa[];
  presensiList: Presensi[];
  settings?: SystemSettings;
  initialType?: 'harian' | 'mingguan' | 'bulanan' | 'semester';
  initialDate?: string;
  initialMonth?: string;
  onOpenPrintModal?: (type: 'harian' | 'mingguan' | 'bulanan' | 'rombel' | 'semester', kelas: string, date: string) => void;
}

export default function ClassReportDownloadModal({
  isOpen,
  onClose,
  siswaList,
  presensiList,
  settings,
  initialType = 'harian',
  initialDate = '',
  initialMonth = '',
  onOpenPrintModal
}: ClassReportDownloadModalProps) {
  const [reportType, setReportType] = useState<'harian' | 'mingguan' | 'bulanan' | 'semester'>(initialType);
  const [targetDate, setTargetDate] = useState<string>(initialDate || getLocalDateString());
  const [targetMonth, setTargetMonth] = useState<string>(initialMonth || getLocalDateString().slice(0, 7));
  const [targetSemesterType, setTargetSemesterType] = useState<'1' | '2'>('1');
  const [targetTahunAjaran, setTargetTahunAjaran] = useState<string>('2026/2027');
  const [searchClass, setSearchClass] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setReportType(initialType);
      setTargetDate(initialDate || getLocalDateString());
      setTargetMonth(initialMonth || getLocalDateString().slice(0, 7));
    }
  }, [isOpen, initialType, initialDate, initialMonth]);

  // Bulk ZIP loading state
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [isDownloadingSingle, setIsDownloadingSingle] = useState<string | null>(null);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number; className: string } | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string>('');
  const [downloadError, setDownloadError] = useState<string>('');

  // Ringkasan live per kelas sesuai tipe laporan & periode terpilih agar konsisten dengan Excel yang diunduh
  const rombelSummaryMap = useMemo(() => {
    let summaries: ClassRombelSummary[] = [];
    if (reportType === 'harian') {
      summaries = calculateAllRombelSummaryList(siswaList, presensiList, targetDate, settings);
    } else if (reportType === 'mingguan') {
      summaries = calculateWeeklyRombelSummaryList(siswaList, presensiList, targetDate, settings);
    } else if (reportType === 'bulanan') {
      summaries = calculateMonthlyRombelSummaryList(siswaList, presensiList, targetMonth, settings);
    } else {
      summaries = calculateSemesterRombelSummaryList(
        siswaList,
        presensiList,
        targetSemesterType,
        targetTahunAjaran,
        settings
      );
    }
    const map = new Map<string, ClassRombelSummary>();
    summaries.forEach((s) => map.set(s.kelas, s));
    return map;
  }, [
    reportType,
    targetDate,
    targetMonth,
    targetSemesterType,
    targetTahunAjaran,
    siswaList,
    presensiList,
    settings
  ]);

  // Class list with count, wali kelas, and synchronized metrics
  const classesInfo = useMemo(() => {
    return DAFTAR_KELAS.map(kelas => {
      const students = siswaList.filter(s => isSameClass(s.kelas, kelas));
      const waliKelas = getWaliKelasByKelas(kelas);
      const stats = rombelSummaryMap.get(kelas);
      return {
        kelas,
        waliKelas,
        totalSiswa: students.length,
        stats
      };
    });
  }, [siswaList, rombelSummaryMap]);

  const filteredClasses = useMemo(() => {
    if (!searchClass.trim()) return classesInfo;
    const q = searchClass.toLowerCase();
    return classesInfo.filter(c => 
      c.kelas.toLowerCase().includes(q) || 
      c.waliKelas.toLowerCase().includes(q)
    );
  }, [classesInfo, searchClass]);

  if (!isOpen) return null;

  const activePeriod = reportType === 'bulanan'
    ? targetMonth
    : reportType === 'semester'
    ? `SEM_${targetSemesterType}_${targetTahunAjaran.replace('/', '_')}`
    : targetDate;

  // Handle single class download (.xlsx)
  const handleDownloadClass = async (kelas: string) => {
    if (isDownloadingSingle) return;
    setDownloadError('');
    setIsDownloadingSingle(kelas);
    try {
      await downloadSingleClassReport(
        reportType, 
        kelas, 
        activePeriod, 
        siswaList, 
        presensiList,
        reportType === 'semester' ? { semesterType: targetSemesterType, tahunAjaran: targetTahunAjaran } : undefined,
        settings
      );
      setDownloadSuccess(`File Excel (.xlsx) rekap ${reportType} ${kelas} berhasil diunduh!`);
      setTimeout(() => setDownloadSuccess(''), 3500);
    } catch (err: any) {
      setDownloadError(`Gagal mengunduh Excel: ${err?.message || 'Kesalahan'}`);
      setTimeout(() => setDownloadError(''), 4000);
    } finally {
      setIsDownloadingSingle(null);
    }
  };

  // Handle bulk ZIP download
  const handleDownloadAllZip = async () => {
    if (isZipping) return;
    setDownloadError('');
    try {
      setIsZipping(true);
      setZipProgress({ current: 0, total: DAFTAR_KELAS.length + 3, className: 'Mempersiapkan berkas Excel...' });

      await downloadAllClassesZip(
        reportType, 
        activePeriod, 
        siswaList, 
        presensiList,
        (current, total, className) => {
          setZipProgress({ current, total, className });
        },
        reportType === 'semester' ? { semesterType: targetSemesterType, tahunAjaran: targetTahunAjaran } : undefined,
        settings
      );

      setDownloadSuccess(`Paket ZIP Excel (.xlsx) rekap ${reportType} seluruh kelas berhasil diunduh!`);
      setTimeout(() => setDownloadSuccess(''), 4000);
    } catch (err: any) {
      console.error('Gagal unduh paket ZIP:', err);
      setDownloadError(`Gagal mengunduh paket ZIP: ${err?.message || 'Kesalahan'}`);
      setTimeout(() => setDownloadError(''), 4000);
    } finally {
      setIsZipping(false);
      setZipProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* MODAL HEADER */}
        <div className="p-5 bg-gradient-to-r from-emerald-700 via-teal-800 to-emerald-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-xs text-white shadow-inner">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">
                Pusat Unduh Rekap Absensi Excel (.xlsx)
              </h2>
              <p className="text-xs text-emerald-100 opacity-90">
                Unduh laporan Excel (.xlsx) rapih &amp; modern per rombel, workbook 12 kelas, atau paket arsip lengkap (.ZIP)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition cursor-pointer"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FEEDBACK SUCCESS / ERROR NOTICE */}
        {downloadSuccess && (
          <div className="mx-5 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-2 text-xs font-bold shadow-xs animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{downloadSuccess}</span>
          </div>
        )}
        {downloadError && (
          <div className="mx-5 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center gap-2 text-xs font-bold shadow-xs animate-in fade-in">
            <X className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{downloadError}</span>
          </div>
        )}

        {/* CONTROLS BAR: Report type & Date/Period */}
        <div className="p-5 border-b border-slate-150 bg-slate-50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          
          {/* Report Type Switcher */}
          <div className="flex items-center p-1 bg-slate-200 rounded-2xl w-full md:w-auto flex-wrap">
            <button
              onClick={() => setReportType('harian')}
              className={`flex-1 md:flex-none py-1.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                reportType === 'harian' ? 'bg-white text-emerald-850 shadow-xs font-black' : 'text-slate-650 hover:text-slate-900'
              }`}
            >
              Harian
            </button>
            <button
              onClick={() => setReportType('mingguan')}
              className={`flex-1 md:flex-none py-1.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                reportType === 'mingguan' ? 'bg-white text-emerald-850 shadow-xs font-black' : 'text-slate-650 hover:text-slate-900'
              }`}
            >
              Mingguan
            </button>
            <button
              onClick={() => setReportType('bulanan')}
              className={`flex-1 md:flex-none py-1.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                reportType === 'bulanan' ? 'bg-white text-emerald-850 shadow-xs font-black' : 'text-slate-650 hover:text-slate-900'
              }`}
            >
              Bulanan
            </button>
            <button
              onClick={() => setReportType('semester')}
              className={`flex-1 md:flex-none py-1.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                reportType === 'semester' ? 'bg-white text-emerald-850 shadow-xs font-black' : 'text-slate-650 hover:text-slate-900'
              }`}
            >
              Semester
            </button>
          </div>

          {/* Date / Period Selector */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {reportType === 'harian' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Tanggal:</span>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="bg-white border border-slate-200 font-bold text-xs py-1.5 px-3 rounded-xl text-slate-800 cursor-pointer shadow-2xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            )}

            {reportType === 'mingguan' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Senin Mulai:</span>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="bg-white border border-slate-200 font-bold text-xs py-1.5 px-3 rounded-xl text-slate-800 cursor-pointer shadow-2xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            )}

            {reportType === 'bulanan' && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Bulan Rekap:</span>
                <input
                  type="month"
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(e.target.value)}
                  className="bg-white border border-slate-200 font-bold text-xs py-1.5 px-3 rounded-xl text-slate-800 cursor-pointer shadow-2xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTargetMonth('2026-08')}
                    className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition cursor-pointer ${
                      targetMonth === '2026-08'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Agustus 2026
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetMonth('2026-09')}
                    className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition cursor-pointer ${
                      targetMonth === '2026-09'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    September 2026
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetMonth('2026-10')}
                    className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition cursor-pointer ${
                      targetMonth === '2026-10'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Oktober 2026
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetMonth('2026-11')}
                    className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition cursor-pointer ${
                      targetMonth === '2026-11'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    November 2026
                  </button>
                </div>
              </div>
            )}

            {reportType === 'semester' && (
              <div className="flex items-center gap-2">
                <select
                  value={targetTahunAjaran}
                  onChange={(e) => setTargetTahunAjaran(e.target.value)}
                  className="bg-white border border-slate-200 font-bold text-xs py-1.5 px-2.5 rounded-xl text-slate-800 cursor-pointer shadow-2xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="2026/2027">TA 2026/2027</option>
                  <option value="2025/2026">TA 2025/2026</option>
                  <option value="2024/2025">TA 2024/2025</option>
                </select>
                <select
                  value={targetSemesterType}
                  onChange={(e) => setTargetSemesterType(e.target.value as '1' | '2')}
                  className="bg-white border border-slate-200 font-bold text-xs py-1.5 px-2.5 rounded-xl text-slate-800 cursor-pointer shadow-2xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="1">Sem 1 (Ganjil)</option>
                  <option value="2">Sem 2 (Genap)</option>
                </select>
              </div>
            )}

            {/* Quick Master All Classes ZIP Download */}
            <button
              type="button"
              disabled={isZipping}
              onClick={handleDownloadAllZip}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-black py-2 px-4 rounded-xl shadow transition-all flex items-center gap-1.5 cursor-pointer border border-emerald-500 shrink-0"
              title="Unduh seluruh rekap kelas dalam 1 paket arsip ZIP"
            >
              {isZipping ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Mengemas ZIP ({zipProgress?.current}/{zipProgress?.total})...</span>
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4 text-emerald-100" />
                  <span>Download Semua Kelas (ZIP)</span>
                </>
              )}
            </button>
          </div>
        </div>


        {/* CLASS SEARCH BAR */}
        <div className="px-5 pt-3 pb-1 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-xs">
            <span className="absolute left-3 top-2.5 text-slate-400">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              placeholder="Filter nama kelas / wali..."
              value={searchClass}
              onChange={(e) => setSearchClass(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Menampilkan <b>{filteredClasses.length}</b> rombel kelas
          </span>
        </div>

        {/* CLASSES LIST GRID */}
        <div className="p-5 overflow-y-auto space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredClasses.map((cls) => (
              <div 
                key={cls.kelas} 
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs hover:shadow-sm hover:border-emerald-300 transition-all flex flex-col justify-between gap-3 text-left group"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="bg-emerald-100 text-emerald-900 px-2.5 py-0.5 rounded-lg text-xs font-black tracking-wide uppercase">
                      {cls.kelas}
                    </span>
                    <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                      <Users className="w-3 h-3 text-slate-400" />
                      {cls.totalSiswa} Siswa
                    </span>
                  </div>
                  <h4 className="text-xs font-extrabold text-slate-800 mt-2 truncate">
                    Wali: {cls.waliKelas}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                    Format:{' '}
                    {reportType === 'harian'
                      ? `Harian (${formatDateIndoShort(targetDate)})`
                      : reportType === 'mingguan'
                      ? `Mingguan (${formatDateIndoShort(getMondayOfWeek(targetDate))} – ${formatDateIndoShort(safeAddDays(getMondayOfWeek(targetDate), 4))})`
                      : reportType === 'bulanan'
                      ? `Bulanan (${formatMonthIndo(targetMonth)})`
                      : `Semester ${targetSemesterType} (${targetTahunAjaran})`}
                  </p>
                  {cls.stats && (
                    <div className="mt-2 flex items-center justify-between gap-1 text-[10px] font-bold bg-slate-50 border border-slate-150 rounded-xl px-2.5 py-1.5">
                      <span className="text-emerald-700">H:{cls.stats.hadir} T:{cls.stats.terlambat}</span>
                      <span className="text-slate-500">S/I/A:{cls.stats.sakit + cls.stats.izin + cls.stats.alfa}</span>
                      <span className="text-blue-700 font-black">{cls.stats.persentase}%</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={isDownloadingSingle !== null}
                    onClick={() => handleDownloadClass(cls.kelas)}
                    className="flex-1 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-60 text-emerald-800 border border-emerald-200 py-1.5 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{isDownloadingSingle === cls.kelas ? 'Menyusun...' : 'Unduh Excel (.xlsx)'}</span>
                  </button>

                  {onOpenPrintModal && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenPrintModal(reportType, cls.kelas, activePeriod);
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 py-1.5 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                      title="Pratinjau & Cetak Dokumen Resmi"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-600" />
                      <span>Cetak</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* MASTER SUMMARY ALL ROMBEL ACTION CARD */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-left">
            <div>
              <span className="text-[10px] bg-blue-600 text-white font-black px-2 py-0.5 rounded uppercase tracking-wider">
                Rekapitulasi Seluruh Sekolah
              </span>
              <h4 className="text-xs font-black text-slate-800 mt-1">
                Rekapitulasi Gabungan Semua Rombel (1-A s/d 6-B)
              </h4>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Unduh workbook Excel (.xlsx) multi-sheet lengkap (Ringkasan Rombel + Detail {siswaList.length} siswa).
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isDownloadingSingle !== null}
                onClick={() => handleDownloadClass('Semua Kelas')}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-extrabold text-xs py-2 px-3.5 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-blue-100" />
                <span>{isDownloadingSingle === 'Semua Kelas' ? 'Menyusun...' : 'Unduh Excel Semua Kelas (.xlsx)'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-medium">
            💡 File Excel (.xlsx) modern berwarna, rapi dengan Kop Resmi SDN 3 Karamatwangi, siap dibuka di Excel, Google Sheets &amp; HP Android.
          </span>
          <button
            onClick={onClose}
            className="bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 px-4 py-1.5 rounded-xl transition cursor-pointer"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
}
