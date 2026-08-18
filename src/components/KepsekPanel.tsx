import { useState } from 'react';
import {
  TrendingUp,
  FileText,
  Download,
  Printer,
  Calendar,
  Layers,
  ChevronDown,
  UserCheck,
  AlertTriangle,
  Award
} from 'lucide-react';
import { Siswa, Presensi, DAFTAR_KELAS } from '../types';
import { getWaliKelasByKelas } from '../lib/demoData';
import {
  getLocalDateString,
  calculateClassAttendanceStats,
  calculateSchoolAttendanceStats,
} from '../lib/attendanceUtils';

interface KepsekPanelProps {
  siswaList: Siswa[];
  presensiList: Presensi[];
}

type LaporanFilterType = 'hari' | 'minggu' | 'bulan';

export default function KepsekPanel({ siswaList, presensiList }: KepsekPanelProps) {
  const [filterType, setFilterType] = useState<LaporanFilterType>('hari');
  const [selectedKelas, setSelectedKelas] = useState<string>('Semua Kelas');
  const [exportError, setExportError] = useState('');

  const todayStr = getLocalDateString();

  // Filtered lists based on filters chosen
  const getFilterData = () => {
    let base = [...presensiList];

    // Filter by class
    if (selectedKelas !== 'Semua Kelas') {
      base = base.filter((p) => p.kelas === selectedKelas);
    }

    // Filter by time horizon
    if (filterType === 'hari') {
      base = base.filter((p) => p.tanggal === todayStr);
    } else if (filterType === 'minggu') {
      // Last 7 days
      const limitDate = new Date();
      limitDate.setDate(limitDate.getDate() - 7);
      base = base.filter((p) => new Date(p.tanggal) >= limitDate);
    } else if (filterType === 'bulan') {
      // Last 30 days
      const limitDate = new Date();
      limitDate.setDate(limitDate.getDate() - 30);
      base = base.filter((p) => new Date(p.tanggal) >= limitDate);
    }

    return base;
  };

  const filteredLogs = getFilterData();

  // Statistics calculation helpers - Accurate unique students for today
  const schoolTodayStats = calculateSchoolAttendanceStats(
    siswaList,
    presensiList,
    todayStr,
    selectedKelas
  );

  const totalSiswaSesuaiFilter = schoolTodayStats.totalSiswa;

  // When filtering today, use exact unique pupil counts. When filtering range (minggu/bulan), use log totals
  const jmlHadir = filterType === 'hari' ? schoolTodayStats.hadir : filteredLogs.filter(p => p.status === 'Hadir').length;
  const jmlTerlambat = filterType === 'hari' ? schoolTodayStats.terlambat : filteredLogs.filter(p => p.status === 'Terlambat').length;
  const jmlSakit = filterType === 'hari' ? schoolTodayStats.sakit : filteredLogs.filter(p => p.status === 'Sakit').length;
  const jmlIzin = filterType === 'hari' ? schoolTodayStats.izin : filteredLogs.filter(p => p.status === 'Izin').length;
  const jmlAlfa = filterType === 'hari' ? schoolTodayStats.alfa : filteredLogs.filter(p => p.status === 'Alfa').length;
  const tIdakHadir = filterType === 'hari' ? schoolTodayStats.belumAbsen : Math.max(0, totalSiswaSesuaiFilter - (jmlHadir + jmlTerlambat + jmlSakit + jmlIzin));

  const persentaseHadir = filterType === 'hari'
    ? schoolTodayStats.persentaseKeaktifan
    : (totalSiswaSesuaiFilter > 0 ? Math.min(100, Math.round(((jmlHadir + jmlTerlambat) / totalSiswaSesuaiFilter) * 100)) : 0);

  // CSV Exporter download
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      setExportError('Tidak ada data presensi yang sesuai untuk diekspor saat ini.');
      setTimeout(() => setExportError(''), 3500);
      return;
    }

    // CSV header
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Tanggal,Waktu,NIS,Nama,Kelas,Status,Operator,Nomor WA Orang Tua\n';

    // CSV rows
    filteredLogs.forEach((p) => {
      const siswa = siswaList.find((s) => s.id === p.siswaId);
      const row = [
        p.tanggal,
        p.waktu,
        p.nis,
        `"${p.nama}"`,
        `"${p.kelas}"`,
        p.status,
        `"${p.operator}"`,
        siswa ? siswa.waOrangTua : '-'
      ].join(',');
      csvContent += row + '\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `REKAP_PRESENSI_SDN3_${selectedKelas.toUpperCase()}_${filterType.toUpperCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Printing trigger
  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* EXPORT FAILURE NOTICE */}
      {exportError && (
        <div className="p-4 px-5 bg-blue-50 border border-blue-200 text-blue-800 rounded-2xl flex items-center gap-2.5 text-xs font-semibold shadow-sm animate-in fade-in duration-200">
          <AlertTriangle className="w-4 h-4 text-blue-700 shrink-0" />
          <span>{exportError}</span>
        </div>
      )}
      
      {/* EXCLUSVIVE KEPALA SEKOLAH HEADER BANNER */}
      <div className="bg-gradient-to-r from-slate-800 to-indigo-900 rounded-3xl p-6 text-white border border-slate-700 shadow-lg relative overflow-hidden">
        {/* Flag representation */}
        <div className="absolute top-0 right-0 w-16 h-4 flex">
          <div className="w-1/2 bg-white" />
          <div className="w-1/2 bg-red-600" />
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full">
              Ruang Kepala Sekolah
            </span>
            <h2 className="text-2xl font-black tracking-tight mt-1">Dashboard Monitoring Kepala Sekolah</h2>
            <p className="text-xs text-indigo-200 opacity-90 mt-0.5 leading-normal">
              Selamat datang, Cucu Maspika, S.Pd.I.,M.Pd.,MCE. Pantau statistik, unduh arsip laporan, dan validasi rekaman presensi SDN 3 Karamatwangi.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              type="button"
              id="btn-kepsek-export-csv"
              className="bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl py-2 px-3.5 text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Ekspor CSV (Excel)
            </button>
            <button
              onClick={handlePrintReport}
              type="button"
              id="btn-kepsek-print"
              className="bg-slate-700 hover:bg-slate-650 text-white rounded-xl py-2 px-3.5 text-xs font-bold transition-all border border-slate-600 cursor-pointer flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              Cetak Dokumen
            </button>
          </div>
        </div>
      </div>

      {/* FILTER PANEL BANNER */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in-50 duration-200">
        <div className="flex items-center gap-2">
          <Calendar className="w-4.5 h-4.5 text-blue-700" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide font-display">Horizon Laporan:</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Horizon filters */}
          <div className="flex rounded-xl bg-slate-100 p-1 border border-gray-200 text-xs">
            {(['hari', 'minggu', 'bulan'] as LaporanFilterType[]).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`py-1.5 px-3.5 rounded-lg font-bold transition-all uppercase tracking-wider text-[10px] cursor-pointer ${
                  filterType === type
                    ? 'bg-blue-700 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                {type === 'hari' ? 'Hari Ini' : type === 'minggu' ? '7 Hari Terakhir' : '30 Hari Terakhir'}
              </button>
            ))}
          </div>

          {/* Rombel Class filter dropdown */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400 font-bold ml-2 font-display">Rombel:</span>
            <select
              value={selectedKelas}
              onChange={(e) => setSelectedKelas(e.target.value)}
              className="bg-white border border-gray-300 rounded-xl py-1.5 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-700 font-semibold text-slate-700"
            >
              <option value="Semua Kelas">Semua Kelas 1-6</option>
              {DAFTAR_KELAS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* STATISTICAL COUNTER GRID / CARD REKAP (Bento Design) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        
        {/* CARD 1: OVERALL ATTENDANCE RATIO */}
        <div className="col-span-2 bg-gradient-to-br from-emerald-600 to-teal-700 p-5 rounded-3xl text-white shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-100">Rasio Kehadiran</span>
            <Award className="w-5 h-5 text-emerald-250 animate-bounce" />
          </div>
          <div className="my-3">
            <h4 className="text-4xl font-black tracking-tight">{persentaseHadir}%</h4>
            <p className="text-[11px] text-emerald-100 mt-1">Presentase kedisiplinan guru & murid</p>
          </div>
          <div className="w-full bg-emerald-800/40 rounded-full h-1.5 overflow-hidden">
            <div className="bg-white h-full rounded-full transition-all duration-500" style={{ width: `${persentaseHadir}%` }} />
          </div>
        </div>

        {/* CARD 2: HADIR STATUS */}
        <div className="bg-white border border-gray-100 p-4 rounded-3xl shadow-xs flex flex-col justify-between text-left">
          <span className="text-[10px] uppercase font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full inline-block self-start">HADIR</span>
          <h4 className="text-3xl font-black text-slate-800 tracking-tight mt-3">{jmlHadir}</h4>
          <span className="text-[10px] text-gray-400 mt-1 block">Tercatat Hadir</span>
        </div>

        {/* CARD 3: TERLAMBAT STATUS */}
        <div className="bg-white border border-gray-100 p-4 rounded-3xl shadow-xs flex flex-col justify-between text-left">
          <span className="text-[10px] uppercase font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full inline-block self-start">TERLAMBAT</span>
          <h4 className="text-3xl font-black text-slate-800 tracking-tight mt-3">{jmlTerlambat}</h4>
          <span className="text-[10px] text-gray-400 mt-1 block">Lewat Jam Toleransi</span>
        </div>

        {/* CARD 4: ABSENTEE (Sakit/Izin/Alfa Group) */}
        <div className="bg-white border border-gray-100 p-4 rounded-3xl shadow-xs flex flex-col justify-between text-left">
          <span className="text-[10px] uppercase font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full inline-block self-start">IJIN/SAKIT</span>
          <h4 className="text-3xl font-black text-slate-800 tracking-tight mt-3">{jmlIzin + jmlSakit}</h4>
          <span className="text-[10px] text-gray-400 mt-1 block">Sakit: {jmlSakit} | Izin: {jmlIzin}</span>
        </div>

        {/* CARD 5: BELUM PRESENSI */}
        <div className="bg-white border border-gray-100 p-4 rounded-3xl shadow-xs flex flex-col justify-between text-left">
          <span className="text-[10px] uppercase font-black text-slate-650 bg-slate-105 px-2 py-0.5 rounded-full inline-block self-start">ALFA / BELUM</span>
          <h4 className="text-3xl font-black text-slate-800 tracking-tight mt-3">{jmlAlfa + tIdakHadir}</h4>
          <span className="text-[10px] text-gray-400 mt-1 block">Tidak ada keterangan</span>
        </div>

      </div>

      {/* GRAPHICAL REKAP & HISTORY REPORT TABLE (2 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-6">
        
        {/* Visual attendance ratios by kelas 1-6 (5 cols) */}
        <div className="lg:col-span-5 bg-white p-5 rounded-3xl border border-slate-205 shadow-sm space-y-4">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 font-display">
            <Layers className="w-4.5 h-4.5 text-blue-700 animate-pulse" />
            Rasio Kehadiran Per Rombel Kelas 1-6
          </h3>

          <div className="space-y-3 pt-2">
            {DAFTAR_KELAS.map((curKelasName) => {
              const pupilsInKelas = siswaList.filter((s) => s.kelas === curKelasName);
              const totalPupils = pupilsInKelas.length;
              const classStats = calculateClassAttendanceStats(pupilsInKelas, presensiList, todayStr);
              const safePercent = classStats.persentaseKeaktifan;
              const totalHadirCount = classStats.totalHadirSemua;

              return (
                <div key={curKelasName} className="space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                  <div className="flex justify-between items-start text-xs">
                    <div>
                      <span className="font-bold text-slate-800">{curKelasName} ({totalPupils} Siswa)</span>
                      <span className="text-[11px] text-slate-500 block font-medium">👤 {getWaliKelasByKelas(curKelasName)}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-black text-blue-700 block">{safePercent}% Hadir</span>
                      <span className="text-[10px] text-slate-500 font-medium">{totalHadirCount}/{totalPupils} Anak</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden border border-slate-250 mt-1">
                    <div 
                      className="bg-blue-700 h-full rounded-full transition-all duration-300" 
                      style={{ width: `${safePercent}%` }} 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Audit list of student attendance status sheet (7 cols) */}
        <div className="lg:col-span-7 bg-white p-5 rounded-3xl border border-slate-205 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider font-display">
              📝 Tabel REKAPITULASI DATA PRESENSI ({filteredLogs.length} Arsip)
            </h3>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-xs text-left">
              <thead className="bg-slate-50 uppercase tracking-wider text-[10px] text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="py-2.5 px-3 font-bold">Tanggal</th>
                  <th className="py-2.5 px-3 font-bold">Waktu</th>
                  <th className="py-2.5 px-3 font-bold flex items-center gap-1">Nama Siswa</th>
                  <th className="py-2.5 px-3 font-bold">Kelas</th>
                  <th className="py-2.5 px-3 font-bold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 font-sans">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-400 italic font-medium">
                      Tidak ada rekaman presensi pada filter terpilih.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((p) => {
                    const statusStyles =
                      p.status === 'Hadir'
                        ? 'bg-emerald-100 text-emerald-800'
                        : p.status === 'Terlambat'
                        ? 'bg-amber-100 text-amber-800 animate-pulse'
                        : p.status === 'Sakit'
                        ? 'bg-indigo-150 text-indigo-850 font-bold'
                        : 'bg-blue-50 text-blue-800 font-extrabold border border-blue-200';

                    return (
                      <tr key={p.id} className="hover:bg-slate-50 border-b border-gray-100">
                        <td className="py-2 px-3 font-mono text-slate-500">{p.tanggal}</td>
                        <td className="py-2 px-3 font-mono text-slate-500">{p.waktu}</td>
                        <td className="py-2 px-3 font-bold text-slate-800">{p.nama}</td>
                        <td className="py-2 px-3 font-semibold text-slate-600">{p.kelas}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${statusStyles}`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
}
