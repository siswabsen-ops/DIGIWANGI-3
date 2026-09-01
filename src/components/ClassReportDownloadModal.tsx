import { useState, useMemo } from 'react';
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
import { Siswa, Presensi, DAFTAR_KELAS } from '../types';
import { getWaliKelasByKelas } from '../lib/demoData';
import { downloadSingleClassReport, downloadAllClassesZip } from '../lib/attendanceReportExport';
import { isSameClass, getLocalDateString } from '../lib/attendanceUtils';

interface ClassReportDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  siswaList: Siswa[];
  presensiList: Presensi[];
  initialType?: 'harian' | 'mingguan' | 'bulanan';
  initialDate?: string;
  initialMonth?: string;
  onOpenPrintModal?: (type: 'harian' | 'mingguan' | 'bulanan' | 'rombel', kelas: string, date: string) => void;
}

export default function ClassReportDownloadModal({
  isOpen,
  onClose,
  siswaList,
  presensiList,
  initialType = 'harian',
  initialDate = '',
  initialMonth = '',
  onOpenPrintModal
}: ClassReportDownloadModalProps) {
  const [reportType, setReportType] = useState<'harian' | 'mingguan' | 'bulanan'>(initialType);
  const [targetDate, setTargetDate] = useState<string>(initialDate || getLocalDateString());
  const [targetMonth, setTargetMonth] = useState<string>(initialMonth || new Date().toISOString().slice(0, 7));
  const [searchClass, setSearchClass] = useState<string>('');

  // Bulk ZIP loading state
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number; className: string } | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string>('');

  // Class list with count and wali kelas
  const classesInfo = useMemo(() => {
    return DAFTAR_KELAS.map(kelas => {
      const students = siswaList.filter(s => isSameClass(s.kelas, kelas));
      const waliKelas = getWaliKelasByKelas(kelas);
      return {
        kelas,
        waliKelas,
        totalSiswa: students.length
      };
    });
  }, [siswaList]);

  const filteredClasses = useMemo(() => {
    if (!searchClass.trim()) return classesInfo;
    const q = searchClass.toLowerCase();
    return classesInfo.filter(c => 
      c.kelas.toLowerCase().includes(q) || 
      c.waliKelas.toLowerCase().includes(q)
    );
  }, [classesInfo, searchClass]);

  if (!isOpen) return null;

  const activePeriod = reportType === 'bulanan' ? targetMonth : targetDate;

  // Handle single class download
  const handleDownloadClass = (kelas: string) => {
    try {
      downloadSingleClassReport(reportType, kelas, activePeriod, siswaList, presensiList);
      setDownloadSuccess(`Rekap ${reportType} kelas ${kelas} berhasil diunduh!`);
      setTimeout(() => setDownloadSuccess(''), 3500);
    } catch (err: any) {
      alert(`Gagal mengunduh: ${err.message || 'Kesalahan'}`);
    }
  };

  // Handle bulk ZIP download
  const handleDownloadAllZip = async () => {
    if (isZipping) return;
    try {
      setIsZipping(true);
      setZipProgress({ current: 0, total: DAFTAR_KELAS.length + 1, className: 'Mempersiapkan berkas...' });

      await downloadAllClassesZip(
        reportType, 
        activePeriod, 
        siswaList, 
        presensiList,
        (current, total, className) => {
          setZipProgress({ current, total, className });
        }
      );

      setDownloadSuccess(`Paket ZIP Rekap ${reportType} untuk seluruh kelas berhasil diunduh!`);
      setTimeout(() => setDownloadSuccess(''), 4000);
    } catch (err: any) {
      console.error('Gagal unduh paket ZIP:', err);
      alert(`Gagal mengunduh paket ZIP: ${err.message || 'Kesalahan'}`);
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
                Pusat Unduh Rekap Absensi Per Kelas
              </h2>
              <p className="text-xs text-emerald-100 opacity-90">
                Pilih format periode (Harian / Mingguan / Bulanan) dan unduh per rombel atau seluruh kelas sekaligus (.CSV / .ZIP)
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

        {/* FEEDBACK SUCCESS NOTICE */}
        {downloadSuccess && (
          <div className="mx-5 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-2 text-xs font-bold shadow-xs animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{downloadSuccess}</span>
          </div>
        )}

        {/* CONTROLS BAR: Report type & Date/Period */}
        <div className="p-5 border-b border-slate-150 bg-slate-50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          
          {/* Report Type Switcher */}
          <div className="flex items-center p-1 bg-slate-200 rounded-2xl w-full md:w-auto">
            <button
              onClick={() => setReportType('harian')}
              className={`flex-1 md:flex-none py-1.5 px-4 rounded-xl text-xs font-bold transition cursor-pointer ${
                reportType === 'harian' ? 'bg-white text-emerald-850 shadow-xs font-black' : 'text-slate-650 hover:text-slate-900'
              }`}
            >
              Rekap Harian
            </button>
            <button
              onClick={() => setReportType('mingguan')}
              className={`flex-1 md:flex-none py-1.5 px-4 rounded-xl text-xs font-bold transition cursor-pointer ${
                reportType === 'mingguan' ? 'bg-white text-emerald-850 shadow-xs font-black' : 'text-slate-650 hover:text-slate-900'
              }`}
            >
              Jurnal Mingguan
            </button>
            <button
              onClick={() => setReportType('bulanan')}
              className={`flex-1 md:flex-none py-1.5 px-4 rounded-xl text-xs font-bold transition cursor-pointer ${
                reportType === 'bulanan' ? 'bg-white text-emerald-850 shadow-xs font-black' : 'text-slate-650 hover:text-slate-900'
              }`}
            >
              Rekap Bulanan
            </button>
          </div>

          {/* Date Selector */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {reportType !== 'bulanan' ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">
                  {reportType === 'mingguan' ? 'Senin Mulai:' : 'Tanggal:'}
                </span>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="bg-white border border-slate-200 font-bold text-xs py-1.5 px-3 rounded-xl text-slate-800 cursor-pointer shadow-2xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Bulan Rekap:</span>
                <input
                  type="month"
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(e.target.value)}
                  className="bg-white border border-slate-200 font-bold text-xs py-1.5 px-3 rounded-xl text-slate-800 cursor-pointer shadow-2xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
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
                    Format: {reportType === 'harian' ? `Harian (${targetDate})` : reportType === 'mingguan' ? `Mingguan (${targetDate})` : `Bulanan (${targetMonth})`}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleDownloadClass(cls.kelas)}
                    className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 py-1.5 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Download CSV</span>
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
                Unduh rekapitulasi data presensi seluruh murid ({siswaList.length} siswa) dalam format ringkasan rombel sekolah.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleDownloadClass('Semua Kelas')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs py-2 px-3.5 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-blue-100" />
                <span>Download Semua Siswa .CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-medium">
            💡 Berkas .CSV kompatibel langsung dengan Microsoft Excel, Google Sheets, dan LibreOffice Calc.
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
