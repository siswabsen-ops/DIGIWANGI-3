import { useState, useMemo, memo } from 'react';
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
  Award,
  School
} from 'lucide-react';
import { Siswa, Presensi, DAFTAR_KELAS } from '../types';
import { getWaliKelasByKelas } from '../lib/demoData';
import {
  getLocalDateString,
  calculateClassAttendanceStats,
  calculateSchoolAttendanceStats,
  calculateAllRombelSummaryList,
  isPresensiDateMatch,
  isSameClass,
} from '../lib/attendanceUtils';

interface KepsekPanelProps {
  siswaList: Siswa[];
  presensiList: Presensi[];
}

type LaporanFilterType = 'hari' | 'minggu' | 'bulan';

function KepsekPanel({ siswaList, presensiList }: KepsekPanelProps) {
  const [filterType, setFilterType] = useState<LaporanFilterType>('hari');
  const [selectedKelas, setSelectedKelas] = useState<string>('Semua Kelas');
  const [exportError, setExportError] = useState('');

  const todayStr = getLocalDateString();

  // Filtered lists based on filters chosen
  const filteredLogs = useMemo(() => {
    let base = [...presensiList];

    // Filter by class
    if (selectedKelas !== 'Semua Kelas') {
      base = base.filter((p) => isSameClass(p.kelas, selectedKelas));
    }

    // Filter by time horizon
    if (filterType === 'hari') {
      base = base.filter((p) => isPresensiDateMatch(p.tanggal, todayStr));
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
  }, [presensiList, selectedKelas, filterType, todayStr]);

  // Statistics calculation helpers - Accurate unique students for today
  const schoolTodayStats = useMemo(() => {
    return calculateSchoolAttendanceStats(
      siswaList,
      presensiList,
      todayStr,
      selectedKelas
    );
  }, [siswaList, presensiList, todayStr, selectedKelas]);

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

  // Rombel summary list for all 12 classes
  const allRombelSummary = useMemo(() => {
    return calculateAllRombelSummaryList(siswaList, presensiList, todayStr);
  }, [siswaList, presensiList, todayStr]);

  const grandTotalSchool = useMemo(() => {
    let totalSiswa = 0;
    let hadir = 0;
    let terlambat = 0;
    let sakit = 0;
    let izin = 0;
    let alfa = 0;
    let sakitDanIzin = 0;
    let belumAbsen = 0;
    let totalHadir = 0;

    allRombelSummary.forEach((r) => {
      totalSiswa += r.totalSiswa;
      hadir += r.hadir;
      terlambat += r.terlambat;
      sakit += r.sakit;
      izin += r.izin;
      alfa += r.alfa;
      sakitDanIzin += r.sakitDanIzin;
      belumAbsen += r.belumAbsen;
      totalHadir += r.totalHadir;
    });

    const persentase = totalSiswa > 0 ? Math.round((totalHadir / totalSiswa) * 100) : 0;

    return {
      totalSiswa,
      hadir,
      terlambat,
      sakit,
      izin,
      alfa,
      sakitDanIzin,
      belumAbsen,
      totalHadir,
      persentase
    };
  }, [allRombelSummary]);

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

      {/* REKAPITULASI ROMBEL KELAS 1-A S/D 6-B TERPADU */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4 font-sans">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <School className="w-5 h-5 text-indigo-700" />
            <div>
              <h3 className="text-sm font-black text-slate-850 uppercase tracking-wider font-display">
                REKAPITULASI KEHADIRAN PER ROMBEL KELAS (1-A s/d 6-B)
              </h3>
              <p className="text-[11px] text-slate-500">
                Data presensi per rombel untuk tanggal <b>{todayStr}</b>. Tersinkronisasi secara real-time.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold bg-indigo-50 text-indigo-800 px-3 py-1 rounded-xl border border-indigo-200">
            Total Seluruh: {grandTotalSchool.totalHadir}/{grandTotalSchool.totalSiswa} Siswa ({grandTotalSchool.persentase}%)
          </span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-xs text-left">
            <thead className="bg-slate-900 text-white uppercase text-[10px] font-mono tracking-wider">
              <tr>
                <th className="py-3 px-3.5">Rombel Kelas</th>
                <th className="py-3 px-3.5">Wali Kelas</th>
                <th className="py-3 px-2.5 text-center">Total</th>
                <th className="py-3 px-2.5 text-center text-emerald-400">Hadir</th>
                <th className="py-3 px-2.5 text-center text-amber-400">Telat</th>
                <th className="py-3 px-2.5 text-center text-sky-400">Sakit</th>
                <th className="py-3 px-2.5 text-center text-sky-400">Izin</th>
                <th className="py-3 px-2.5 text-center text-rose-400">Alfa</th>
                <th className="py-3 px-2.5 text-center text-slate-400">Belum</th>
                <th className="py-3 px-3 text-center">Keaktifan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {allRombelSummary.map((rombel) => (
                <tr key={rombel.kelas} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 px-3.5 font-black text-slate-800">{rombel.kelas}</td>
                  <td className="py-2.5 px-3.5 text-slate-600">{rombel.waliKelas}</td>
                  <td className="py-2.5 px-2.5 text-center font-bold text-slate-800">{rombel.totalSiswa}</td>
                  <td className="py-2.5 px-2.5 text-center font-black text-emerald-700">{rombel.hadir}</td>
                  <td className="py-2.5 px-2.5 text-center font-bold text-amber-700">{rombel.terlambat}</td>
                  <td className="py-2.5 px-2.5 text-center text-slate-600">{rombel.sakit}</td>
                  <td className="py-2.5 px-2.5 text-center text-slate-600">{rombel.izin}</td>
                  <td className="py-2.5 px-2.5 text-center text-slate-600">{rombel.alfa}</td>
                  <td className="py-2.5 px-2.5 text-center font-semibold text-slate-400">{rombel.belumAbsen}</td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="w-12 bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            rombel.persentase >= 80
                              ? 'bg-emerald-600'
                              : rombel.persentase >= 50
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                          style={{ width: `${rombel.persentase}%` }}
                        />
                      </div>
                      <span className="font-mono font-black text-slate-800 text-[11px]">{rombel.persentase}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-900 text-white font-mono text-[11px] font-bold">
              <tr>
                <td className="py-3 px-3.5" colSpan={2}>TOTAL KESELURUHAN SEKOLAH</td>
                <td className="py-3 px-2.5 text-center font-black">{grandTotalSchool.totalSiswa}</td>
                <td className="py-3 px-2.5 text-center text-emerald-400 font-black">{grandTotalSchool.hadir}</td>
                <td className="py-3 px-2.5 text-center text-amber-400 font-black">{grandTotalSchool.terlambat}</td>
                <td className="py-3 px-2.5 text-center text-sky-400">{grandTotalSchool.sakit}</td>
                <td className="py-3 px-2.5 text-center text-sky-400">{grandTotalSchool.izin}</td>
                <td className="py-3 px-2.5 text-center text-rose-400">{grandTotalSchool.alfa}</td>
                <td className="py-3 px-2.5 text-center text-slate-400">{grandTotalSchool.belumAbsen}</td>
                <td className="py-3 px-3 text-center font-black text-emerald-400">
                  {grandTotalSchool.persentase}%
                </td>
              </tr>
            </tfoot>
          </table>
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

export default memo(KepsekPanel);
