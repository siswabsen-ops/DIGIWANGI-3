import { useState, useMemo } from 'react';
import { 
  Calendar, 
  Download, 
  Filter, 
  Users, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  HeartPulse, 
  Mail, 
  FileSpreadsheet, 
  TrendingUp, 
  Printer, 
  Search, 
  Check, 
  ChevronRight, 
  Info, 
  Award,
  Layers,
  ArrowUpDown,
  Sparkles,
  School
} from 'lucide-react';
import { Siswa, Presensi, StatusKehadiran, DAFTAR_KELAS } from '../types';
import {
  getLocalDateString,
  getLatestAttendanceForStudent,
  isPresensiMatchSiswa,
  isPresensiDateMatch,
  calculateAllRombelSummaryList,
  calculateClassAttendanceStats,
  calculateSchoolAttendanceStats
} from '../lib/attendanceUtils';

interface ReportPanelProps {
  siswaList: Siswa[];
  presensiList: Presensi[];
}

type ActiveTab = 'harian' | 'mingguan' | 'bulanan';
type StatusFilterType = 'semua' | 'hadir' | 'terlambat' | 'sakit_izin' | 'belum_absen';

export default function ReportPanel({ siswaList, presensiList }: ReportPanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('harian');
  const [selectedKelas, setSelectedKelas] = useState<string>('Semua Kelas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('semua');

  // 1. HARIAN STATE
  const [harianDate, setHarianDate] = useState<string>(() => getLocalDateString());

  // 2. MINGGUAN STATE (Start Monday value)
  const [mingguanDate, setMingguanDate] = useState<string>(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(now.setDate(diff));
    const tzOffset = monday.getTimezoneOffset() * 60000;
    return (new Date(monday.getTime() - tzOffset)).toISOString().slice(0, 10);
  });

  // Calculate the dates for the Monday - Friday range in Indonesian names
  const weekDates = useMemo(() => {
    const baseDate = new Date(mingguanDate);
    const dates: { dateStr: string; label: string; shortLabel: string }[] = [];
    const indonesianDays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
    
    for (let i = 0; i < 5; i++) {
      const nextDate = new Date(baseDate);
      nextDate.setDate(baseDate.getDate() + i);
      const tzOffset = nextDate.getTimezoneOffset() * 60000;
      const dateStr = (new Date(nextDate.getTime() - tzOffset)).toISOString().slice(0, 10);
      
      const dayNum = nextDate.getDate();
      const monthShort = nextDate.toLocaleDateString('id-ID', { month: 'short' });
      
      dates.push({
        dateStr,
        label: `${indonesianDays[i]} (${dayNum} ${monthShort})`,
        shortLabel: indonesianDays[i].substring(0, 3)
      });
    }
    return dates;
  }, [mingguanDate]);

  // 3. BULANAN STATE (Format YYYY-MM)
  const [bulananMonth, setBulananMonth] = useState<string>(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });

  // Rekapitulasi Rombel Semua Kelas (1-A s/d 6-B) untuk tanggal terpilih
  const allRombelSummary = useMemo(() => {
    return calculateAllRombelSummaryList(siswaList, presensiList, harianDate);
  }, [siswaList, presensiList, harianDate]);

  // Grand Total untuk Seluruh Sekolah pada tanggal terpilih
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

  // Common filtered list of students
  const filteredStudents = useMemo(() => {
    return siswaList.filter(s => {
      const matchKelas = selectedKelas === 'Semua Kelas' || s.kelas === selectedKelas;
      const matchQuery = s.nama.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         s.nis.includes(searchQuery);
      return matchKelas && matchQuery;
    });
  }, [siswaList, selectedKelas, searchQuery]);

  // HARIAN: Calculate attendance state per student for the selected date
  const harianReportDataRaw = useMemo(() => {
    return filteredStudents.map(siswa => {
      const record = getLatestAttendanceForStudent(siswa, presensiList, harianDate);
      return {
        siswa,
        record: record || null,
        status: record ? record.status : 'Belum Absen' as StatusKehadiran | 'Belum Absen',
        hasPresensi: !!record
      };
    });
  }, [filteredStudents, presensiList, harianDate]);

  // Apply Status Filter
  const harianReportData = useMemo(() => {
    if (statusFilter === 'semua') return harianReportDataRaw;
    if (statusFilter === 'hadir') return harianReportDataRaw.filter(r => r.status === 'Hadir');
    if (statusFilter === 'terlambat') return harianReportDataRaw.filter(r => r.status === 'Terlambat');
    if (statusFilter === 'sakit_izin') return harianReportDataRaw.filter(r => r.status === 'Sakit' || r.status === 'Izin');
    if (statusFilter === 'belum_absen') return harianReportDataRaw.filter(r => r.status === 'Belum Absen' || r.status === 'Alfa');
    return harianReportDataRaw;
  }, [harianReportDataRaw, statusFilter]);

  // Harian Statistics Summary for the active selection
  const harianStats = useMemo(() => {
    const total = harianReportDataRaw.length;
    if (total === 0) return { total: 0, hadir: 0, terlambat: 0, sakit: 0, izin: 0, alfa: 0, belumAbsen: 0, percentage: 0 };
    
    let hadir = 0;
    let terlambat = 0;
    let sakit = 0;
    let izin = 0;
    let alfa = 0;
    let belumAbsen = 0;

    harianReportDataRaw.forEach(row => {
      switch (row.status) {
        case 'Hadir': hadir++; break;
        case 'Terlambat': terlambat++; break;
        case 'Sakit': sakit++; break;
        case 'Izin': izin++; break;
        case 'Alfa': alfa++; break;
        case 'Belum Absen': default: belumAbsen++; break;
      }
    });

    const activeCount = hadir + terlambat;
    const percentage = total > 0 ? Math.round((activeCount / total) * 100) : 0;

    return { total, hadir, terlambat, sakit, izin, alfa, belumAbsen, percentage };
  }, [harianReportDataRaw]);

  // MINGGUAN: Calculate student matrix for Monday - Friday
  const mingguanReportData = useMemo(() => {
    return filteredStudents.map(siswa => {
      const recordsByDay = weekDates.map(wd => {
        const found = getLatestAttendanceForStudent(siswa, presensiList, wd.dateStr);
        return {
          dateStr: wd.dateStr,
          status: found ? found.status : '-' // dash indicates no record
        };
      });

      // Sum metrics
      const hadir = recordsByDay.filter(r => r.status === 'Hadir').length;
      const terlambat = recordsByDay.filter(r => r.status === 'Terlambat').length;
      const sakit = recordsByDay.filter(r => r.status === 'Sakit').length;
      const izin = recordsByDay.filter(r => r.status === 'Izin').length;
      const alfa = recordsByDay.filter(r => r.status === 'Alfa').length;
      const unmarked = recordsByDay.filter(r => r.status === '-').length;

      return {
        siswa,
        recordsByDay,
        summary: { hadir, terlambat, sakit, izin, alfa, unmarked }
      };
    });
  }, [filteredStudents, presensiList, weekDates]);

  // BULANAN: Aggregates for the whole month
  const bulananReportData = useMemo(() => {
    return filteredStudents.map(siswa => {
      const studentMonthRecords = presensiList.filter(p => isPresensiMatchSiswa(p, siswa) && p.tanggal.startsWith(bulananMonth));
      
      const dateMap = new Map<string, Presensi>();
      studentMonthRecords.forEach(r => {
        const existing = dateMap.get(r.tanggal);
        if (!existing || (r.waktu && existing.waktu && r.waktu > existing.waktu)) {
          dateMap.set(r.tanggal, r);
        }
      });

      const uniqueMonthlyRecords = Array.from(dateMap.values());
      
      let hadir = 0;
      let terlambat = 0;
      let sakit = 0;
      let izin = 0;
      let alfa = 0;

      uniqueMonthlyRecords.forEach(r => {
        switch (r.status) {
          case 'Hadir': hadir++; break;
          case 'Terlambat': terlambat++; break;
          case 'Sakit': sakit++; break;
          case 'Izin': izin++; break;
          case 'Alfa': alfa++; break;
        }
      });

      const uniqueDaysWithAttendance = Array.from(new Set(
        presensiList
          .filter(p => p.tanggal.startsWith(bulananMonth))
          .map(p => p.tanggal)
      )).length;

      const totalSchoolDays = Math.max(uniqueDaysWithAttendance, 1);
      const computedAlfa = Math.max(0, totalSchoolDays - (hadir + terlambat + sakit + izin));
      const presentCount = hadir + terlambat;
      const percentage = totalSchoolDays > 0 ? Math.round((presentCount / totalSchoolDays) * 100) : 0;

      return {
        siswa,
        metrics: {
          registrasi: uniqueMonthlyRecords.length,
          hadir,
          terlambat,
          sakit,
          izin,
          alfa: computedAlfa,
          persen: percentage,
          baseSchoolDays: totalSchoolDays
        }
      };
    });
  }, [filteredStudents, presensiList, bulananMonth]);

  // Bulanan stats overall
  const bulananStats = useMemo(() => {
    if (bulananReportData.length === 0) return { avgPersen: 0, totalApresiasi: 0 };
    const totalPercentage = bulananReportData.reduce((acc, curr) => acc + curr.metrics.persen, 0);
    const avgPersen = Math.round(totalPercentage / bulananReportData.length);
    const totalApresiasi = bulananReportData.filter(r => r.metrics.persen >= 90).length;

    return { avgPersen, totalApresiasi };
  }, [bulananReportData]);

  // -- DOWNLOAD TRIGGERS (CSV Generators) --

  const handleDownloadHarian = () => {
    const headers = ['No', 'NIS', 'Nama Siswa', 'Kelas', 'Tanggal', 'Waktu Scan', 'Status Kehadiran', 'WhatsApp Status', 'Operator Input'];
    const rows = harianReportData.map((row, idx) => [
      idx + 1,
      `'${row.siswa.nis}`,
      row.siswa.nama,
      row.siswa.kelas,
      harianDate,
      row.record ? row.record.waktu : '-',
      row.status,
      row.record ? row.record.waStatus : '-',
      row.record ? row.record.operator : '-'
    ]);

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.map(v => `"${(v + '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DIGIWANGI3_LAPORAN_HARIAN_${selectedKelas.replace(/\s+/g, '_')}_${harianDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadRekapRombel = () => {
    const headers = ['No', 'Kelas', 'Wali Kelas', 'Total Siswa', 'Hadir', 'Terlambat', 'Sakit', 'Izin', 'Alfa', 'Belum Absen', 'Total Masuk', 'Persentase (%)'];
    const rows = allRombelSummary.map((r, idx) => [
      idx + 1,
      r.kelas,
      r.waliKelas,
      r.totalSiswa,
      r.hadir,
      r.terlambat,
      r.sakit,
      r.izin,
      r.alfa,
      r.belumAbsen,
      r.totalHadir,
      `${r.persentase}%`
    ]);

    rows.push([
      '',
      'TOTAL KESELURUHAN SEKOLAH',
      '-',
      grandTotalSchool.totalSiswa,
      grandTotalSchool.hadir,
      grandTotalSchool.terlambat,
      grandTotalSchool.sakit,
      grandTotalSchool.izin,
      grandTotalSchool.alfa,
      grandTotalSchool.belumAbsen,
      grandTotalSchool.totalHadir,
      `${grandTotalSchool.persentase}%`
    ]);

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.map(v => `"${(v + '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DIGIWANGI3_REKAPITULASI_ROMBEL_SELURUH_KELAS_${harianDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadMingguan = () => {
    const headers = [
      'No', 
      'NIS', 
      'Nama Siswa', 
      'Kelas', 
      weekDates[0].label, 
      weekDates[1].label, 
      weekDates[2].label, 
      weekDates[3].label, 
      weekDates[4].label,
      'Total Hadir',
      'Total Terlambat',
      'Total Sakit',
      'Total Izin',
      'Total Alfa/Absen'
    ];

    const rows = mingguanReportData.map((row, idx) => [
      idx + 1,
      `'${row.siswa.nis}`,
      row.siswa.nama,
      row.siswa.kelas,
      row.recordsByDay[0].status,
      row.recordsByDay[1].status,
      row.recordsByDay[2].status,
      row.recordsByDay[3].status,
      row.recordsByDay[4].status,
      row.summary.hadir,
      row.summary.terlambat,
      row.summary.sakit,
      row.summary.izin,
      row.summary.alfa + row.summary.unmarked
    ]);

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.map(v => `"${(v + '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DIGIWANGI3_LAPORAN_MINGGUAN_${selectedKelas.replace(/\s+/g, '_')}_Mulai_${mingguanDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadBulanan = () => {
    const headers = [
      'No',
      'NIS',
      'Nama Siswa',
      'Kelas',
      'Hari Sekolah Terhitung',
      'Total Hadir',
      'Total Terlambat',
      'Total Sakit',
      'Total Izin',
      'Total Alfa/Absen',
      'Persentase Kehadiran (%)'
    ];

    const rows = bulananReportData.map((row, idx) => [
      idx + 1,
      `'${row.siswa.nis}`,
      row.siswa.nama,
      row.siswa.kelas,
      row.metrics.baseSchoolDays,
      row.metrics.hadir,
      row.metrics.terlambat,
      row.metrics.sakit,
      row.metrics.izin,
      row.metrics.alfa,
      `${row.metrics.persen}%`
    ]);

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.map(v => `"${(v + '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DIGIWANGI3_LAPORAN_BULANAN_${selectedKelas.replace(/\s+/g, '_')}_${bulananMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* HEADER SECTION WITH TITLE & DESCRIPTION */}
      <div className="bg-white rounded-3xl p-6 border border-slate-150 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full font-black uppercase tracking-widest leading-none">
              Fitur Laporan & Rekapitulasi
            </span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-black uppercase tracking-widest leading-none flex items-center gap-1">
              <Check className="w-3 h-3" /> Real-time Sinkron
            </span>
          </div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight mt-1.5 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-blue-600 shrink-0" />
            <span>Pusat Laporan & Rekap Absensi Siswa</span>
          </h2>
          <p className="text-gray-500 text-xs mt-1.5">
            Hasil rekapitulasi data presensi siswa SDN 3 Karamatwangi secara harian per rombel, mingguan, maupun bulanan. Diperbarui secara riil dan siap diekspor ke format .CSV untuk kelengkapan administrasi sekolah.
          </p>
        </div>

        {/* Global Print / Download shortcut */}
        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          <button
            onClick={handlePrintReport}
            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow transition-all cursor-pointer flex items-center gap-1.5 border border-slate-800"
          >
            <Printer className="w-4 h-4 text-slate-300" />
            <span>Cetak Halaman</span>
          </button>
        </div>
      </div>

      {/* FILTER & MENU TAB CONTROL BOX */}
      <div className="bg-white rounded-3xl border border-slate-150 shadow-sm p-4 flex flex-col xl:flex-row items-center gap-4 justify-between">
        
        {/* Navigation tabs inside Reports */}
        <div className="flex items-center p-1 bg-slate-100 rounded-2xl w-full xl:w-auto">
          <button
            onClick={() => setActiveTab('harian')}
            className={`flex-1 xl:flex-none py-2 px-4 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'harian'
                ? 'bg-blue-700 text-white shadow-sm'
                : 'text-slate-650 hover:text-slate-800'
            }`}
          >
            Laporan Harian & Rekap Rombel
          </button>
          <button
            onClick={() => setActiveTab('mingguan')}
            className={`flex-1 xl:flex-none py-2 px-4 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'mingguan'
                ? 'bg-blue-700 text-white shadow-sm'
                : 'text-slate-650 hover:text-slate-800'
            }`}
          >
            Laporan Mingguan
          </button>
          <button
            onClick={() => setActiveTab('bulanan')}
            className={`flex-1 xl:flex-none py-2 px-4 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'bulanan'
                ? 'bg-blue-700 text-white shadow-sm'
                : 'text-slate-650 hover:text-slate-800'
            }`}
          >
            Laporan Bulanan
          </button>
        </div>

        {/* Global Controls: Class filter + Search Query */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto self-stretch">
          
          {/* Class selector */}
          <div className="relative w-full sm:w-48 align-middle shrink-0">
            <span className="absolute left-3 top-2.5 text-slate-400">
              <Filter className="w-3.5 h-3.5" />
            </span>
            <select
              value={selectedKelas}
              onChange={(e) => setSelectedKelas(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="Semua Kelas">Semua Kelas ({siswaList.length} Siswa)</option>
              {DAFTAR_KELAS.map(k => {
                const count = siswaList.filter(s => s.kelas === k).length;
                return (
                  <option key={k} value={k}>{k} ({count} Siswa)</option>
                );
              })}
            </select>
          </div>

          {/* Student name search bar */}
          <div className="relative w-full sm:w-64 align-middle">
            <span className="absolute left-3 top-2.5 text-slate-400">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              placeholder="Cari nama / NIS siswa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-750 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* RENDER ACTIVE TAB */}
      <div className="space-y-6">
        
        {/* TAB 1: HARIAN */}
        {activeTab === 'harian' && (
          <div className="space-y-6">

            {/* Sub harian control widgets: Date Picker & Summary metrics */}
            <div className="bg-white border border-slate-150 p-5 rounded-3xl shadow-sm text-left flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full lg:w-auto">
                <span className="bg-blue-50 p-3 rounded-2xl text-blue-700 shrink-0">
                  <Calendar className="w-5 h-5" />
                </span>
                <div className="w-full">
                  <label className="block text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Tanggal Laporan & Rekapitulasi</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="date"
                      value={harianDate}
                      onChange={(e) => setHarianDate(e.target.value)}
                      className="font-bold text-xs text-slate-800 bg-slate-50 border border-slate-200 py-1.5 px-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    />
                    <button
                      onClick={() => setHarianDate(getLocalDateString())}
                      className="text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      Hari Ini
                    </button>
                  </div>
                </div>
              </div>

              {/* Statistics preview harian */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 w-full lg:w-auto">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-2.5 text-center min-w-[85px]">
                  <span className="text-[9px] font-black text-slate-500 block uppercase">Total Siswa</span>
                  <p className="text-base font-black text-slate-900 mt-0.5">{harianStats.total}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-2.5 text-center min-w-[85px]">
                  <span className="text-[9px] font-black text-emerald-800 block uppercase">Hadir Tepat</span>
                  <p className="text-base font-black text-emerald-950 mt-0.5">{harianStats.hadir}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-2.5 text-center min-w-[85px]">
                  <span className="text-[9px] font-black text-amber-800 block uppercase">Terlambat</span>
                  <p className="text-base font-black text-amber-950 mt-0.5">{harianStats.terlambat}</p>
                </div>
                <div className="bg-sky-50 border border-sky-100 rounded-2xl p-2.5 text-center min-w-[85px]">
                  <span className="text-[9px] font-black text-sky-850 block uppercase">Sakit & Izin</span>
                  <p className="text-base font-black text-sky-950 mt-0.5">{harianStats.izin + harianStats.sakit}</p>
                </div>
                <div className="bg-rose-50 border border-rose-100 rounded-2xl p-2.5 text-center min-w-[85px]">
                  <span className="text-[9px] font-black text-rose-800 block uppercase">Belum / Alfa</span>
                  <p className="text-base font-black text-rose-950 mt-0.5">{harianStats.belumAbsen + harianStats.alfa}</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-2.5 text-center min-w-[85px]">
                  <span className="text-[9px] font-black text-blue-800 block uppercase">Keaktifan</span>
                  <p className="text-base font-black text-blue-950 mt-0.5">{harianStats.percentage}%</p>
                </div>
              </div>
            </div>

            {/* SECTION 1: REKAPITULASI ROMBEL SELURUH KELAS 1-A s/d 6-B */}
            <div className="bg-white border border-slate-150 rounded-3xl shadow-sm overflow-hidden text-left">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-gradient-to-r from-slate-50 to-blue-50/40">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-blue-600 text-white rounded-lg">
                    <Layers className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className="text-xs font-black text-slate-800 tracking-wide uppercase">
                      Tabel Rekapitulasi Presensi Per Rombel Kelas (1-A s/d 6-B)
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Tanggal: <b>{new Date(harianDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</b> • Klik nama kelas untuk melihat rincian murid
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleDownloadRekapRombel}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl py-2 px-3 shadow-xs transition-all cursor-pointer flex items-center gap-1.5 border border-emerald-500 shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-100" />
                  <span>Download Rekap Rombel .CSV</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-extrabold text-left">
                      <th className="py-3 px-4 w-12 text-center">No</th>
                      <th className="py-3 px-4 w-32">Rombel Kelas</th>
                      <th className="py-3 px-4">Wali Kelas</th>
                      <th className="py-3 px-3 text-center w-24 bg-slate-200/50">Total Siswa</th>
                      <th className="py-3 px-3 text-center w-20 bg-green-50 text-green-800">Hadir</th>
                      <th className="py-3 px-3 text-center w-20 bg-amber-50 text-amber-800">Telat</th>
                      <th className="py-3 px-3 text-center w-24 bg-sky-50 text-sky-800">Sakit / Izin</th>
                      <th className="py-3 px-3 text-center w-24 bg-rose-50 text-rose-800">Belum / Alfa</th>
                      <th className="py-3 px-3 text-center w-24 bg-blue-50 text-blue-800">Total Masuk</th>
                      <th className="py-3 px-3 text-center w-24">Kehadiran</th>
                      <th className="py-3 px-3 text-center w-24">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allRombelSummary.map((rombel, idx) => {
                      const isSelected = selectedKelas === rombel.kelas;
                      let rateColor = 'text-rose-600';
                      if (rombel.persentase >= 90) rateColor = 'text-emerald-600 font-black';
                      else if (rombel.persentase >= 75) rateColor = 'text-blue-600 font-bold';

                      return (
                        <tr 
                          key={rombel.kelas} 
                          className={`hover:bg-blue-50/50 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50/80 font-bold' : ''}`}
                          onClick={() => setSelectedKelas(rombel.kelas)}
                        >
                          <td className="py-2.5 px-4 text-center text-slate-400 font-bold">{idx + 1}</td>
                          <td className="py-2.5 px-4 font-black text-slate-800 flex items-center gap-1.5">
                            <span>{rombel.kelas}</span>
                            {isSelected && (
                              <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.2 rounded font-bold">Aktif</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 font-medium">👤 {rombel.waliKelas}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-slate-800 bg-slate-50/70">{rombel.totalSiswa}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-green-700 bg-green-50/30">{rombel.hadir}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-amber-700 bg-amber-50/30">{rombel.terlambat}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-sky-700 bg-sky-50/30">{rombel.sakitDanIzin}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-rose-700 bg-rose-50/30">{rombel.belumAbsen + rombel.alfa}</td>
                          <td className="py-2.5 px-3 text-center font-black text-blue-800 bg-blue-50/30">{rombel.totalHadir}</td>
                          <td className={`py-2.5 px-3 text-center font-mono ${rateColor}`}>{rombel.persentase}%</td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedKelas(rombel.kelas);
                              }}
                              className="text-[10px] font-bold text-blue-700 hover:text-blue-800 bg-blue-100/70 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                            >
                              Filter Kelas
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Grand Total Row */}
                    <tr className="bg-slate-200/80 border-t-2 border-slate-300 font-black text-slate-800">
                      <td className="py-3 px-4 text-center">Σ</td>
                      <td className="py-3 px-4">TOTAL SEKOLAH</td>
                      <td className="py-3 px-4 text-slate-500 font-bold">12 Rombel Kelas</td>
                      <td className="py-3 px-3 text-center bg-slate-300/60 font-black">{grandTotalSchool.totalSiswa}</td>
                      <td className="py-3 px-3 text-center text-green-800 font-black">{grandTotalSchool.hadir}</td>
                      <td className="py-3 px-3 text-center text-amber-800 font-black">{grandTotalSchool.terlambat}</td>
                      <td className="py-3 px-3 text-center text-sky-800 font-black">{grandTotalSchool.sakitDanIzin}</td>
                      <td className="py-3 px-3 text-center text-rose-800 font-black">{grandTotalSchool.belumAbsen + grandTotalSchool.alfa}</td>
                      <td className="py-3 px-3 text-center text-blue-900 font-black">{grandTotalSchool.totalHadir}</td>
                      <td className="py-3 px-3 text-center text-blue-900 font-mono font-black">{grandTotalSchool.persentase}%</td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => setSelectedKelas('Semua Kelas')}
                          className="text-[10px] font-bold text-slate-700 bg-white px-2 py-1 rounded-lg border border-slate-300 transition-colors cursor-pointer"
                        >
                          Semua
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* SECTION 2: LIST DETAIL SISWA HARIAN DENGAN STATUS FILTER */}
            <div className="bg-white border border-slate-150 rounded-3xl shadow-sm overflow-hidden text-left">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-slate-50">
                <div>
                  <span className="text-xs font-extrabold text-slate-800 tracking-wide uppercase block">
                    Daftar Rincian Siswa: {selectedKelas}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Menampilkan <b>{harianReportData.length}</b> dari {harianReportDataRaw.length} murid
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Status filter buttons */}
                  <div className="flex items-center bg-slate-200/60 p-1 rounded-xl gap-1">
                    <button
                      onClick={() => setStatusFilter('semua')}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        statusFilter === 'semua' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Semua ({harianReportDataRaw.length})
                    </button>
                    <button
                      onClick={() => setStatusFilter('hadir')}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        statusFilter === 'hadir' ? 'bg-green-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Hadir ({harianStats.hadir})
                    </button>
                    <button
                      onClick={() => setStatusFilter('terlambat')}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        statusFilter === 'terlambat' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Telat ({harianStats.terlambat})
                    </button>
                    <button
                      onClick={() => setStatusFilter('sakit_izin')}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        statusFilter === 'sakit_izin' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Sakit/Izin ({harianStats.sakit + harianStats.izin})
                    </button>
                    <button
                      onClick={() => setStatusFilter('belum_absen')}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        statusFilter === 'belum_absen' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Belum Absen ({harianStats.belumAbsen + harianStats.alfa})
                    </button>
                  </div>

                  {/* Download CSV button */}
                  <button
                    onClick={handleDownloadHarian}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl py-1.5 px-3 shadow-xs transition-all cursor-pointer flex items-center gap-1 border border-emerald-500 shrink-0"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-100" />
                    <span>Download Siswa .CSV</span>
                  </button>
                </div>
              </div>

              {harianReportData.length === 0 ? (
                <div className="py-12 text-center text-gray-400 space-y-2">
                  <Info className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs">Tidak ada data siswa yang cocok dengan filter aktif.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-500 font-extrabold text-left">
                        <th className="py-3 px-4 w-12 text-center">No</th>
                        <th className="py-3 px-4 w-28 font-mono">NIS</th>
                        <th className="py-3 px-4">Nama Lengkap</th>
                        <th className="py-3 px-4 w-28">Kelas</th>
                        <th className="py-3 px-4 w-24 text-center">Waktu Scan</th>
                        <th className="py-3 px-4 w-36 text-center">Status Kehadiran</th>
                        <th className="py-3 px-4 w-44">Disubmit Oleh</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {harianReportData.map((row, idx) => {
                        let statusBadge = (
                          <span className="inline-block py-1 px-2.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                            Belum Presensi
                          </span>
                        );

                        if (row.record) {
                          if (row.record.status === 'Hadir') {
                            statusBadge = (
                              <span className="inline-block py-1 px-2.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Hadir
                              </span>
                            );
                          } else if (row.record.status === 'Terlambat') {
                            statusBadge = (
                              <span className="inline-block py-1 px-2.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                                Terlambat
                              </span>
                            );
                          } else if (row.record.status === 'Sakit') {
                            statusBadge = (
                              <span className="inline-block py-1 px-2.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
                                Sakit
                              </span>
                            );
                          } else if (row.record.status === 'Izin') {
                            statusBadge = (
                              <span className="inline-block py-1 px-2.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-sky-100 text-sky-800 border border-sky-200">
                                Izin
                              </span>
                            );
                          } else if (row.record.status === 'Alfa') {
                            statusBadge = (
                              <span className="inline-block py-1 px-2.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-800 border border-red-200">
                                Alfa
                              </span>
                            );
                          }
                        }

                        return (
                          <tr key={row.siswa.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-2.5 px-4 text-center text-slate-400 font-bold">{idx + 1}</td>
                            <td className="py-2.5 px-4 font-mono font-bold text-slate-600">{row.siswa.nis}</td>
                            <td className="py-2.5 px-4 font-extrabold text-slate-800 capitalize">{row.siswa.nama.toLowerCase()}</td>
                            <td className="py-2.5 px-4 text-slate-500 font-bold">{row.siswa.kelas}</td>
                            <td className="py-2.5 px-4 text-center font-mono font-semibold text-slate-600">
                              {row.record ? row.record.waktu.slice(0, 8) : '-'}
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              {statusBadge}
                            </td>
                            <td className="py-2.5 px-4 text-[11px] text-slate-500 font-medium font-sans">
                              {row.record ? (
                                <div className="space-y-0.5">
                                  <p className="font-bold text-slate-700 truncate">{row.record.operator.split(',')[0]}</p>
                                  <p className="text-[9px] text-[#075E54] truncate">Status WA: {row.record.waStatus || 'Terkirim'}</p>
                                </div>
                              ) : (
                                <span className="text-gray-400 font-light italic">Belum Terekam</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: MINGGUAN */}
        {activeTab === 'mingguan' && (
          <div className="space-y-6">

            {/* Sub-controls for selecting start Monday */}
            <div className="bg-white border border-slate-150 p-5 rounded-3xl shadow-sm text-left flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full md:w-auto">
                <span className="bg-blue-50 p-2.5 rounded-xl text-blue-700 shrink-0">
                  <Calendar className="w-5 h-5 flex-shrink-0" />
                </span>
                <div className="w-full">
                  <label className="block text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Minggu Mulai (Hari Senin)</label>
                  <input
                    type="date"
                    value={mingguanDate}
                    onChange={(e) => setMingguanDate(e.target.value)}
                    className="mt-0.5 max-w-full font-bold text-xs text-slate-750 bg-slate-50 border border-slate-200 py-1.5 px-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-[9px] text-slate-400 block mt-0.5">Disarankan memilih tanggal hari Senin</span>
                </div>
              </div>

              {/* Informative Range and Download trigger */}
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                <div className="bg-slate-50 border border-slate-150 py-2 px-4 rounded-xl text-xs space-y-0.5 text-left w-full sm:w-auto">
                  <span className="text-[9px] text-slate-400 font-bold block uppercase">Kisaran Tanggal Mingguan</span>
                  <p className="font-bold text-slate-750 text-xs">
                    {weekDates[0].dateStr.split('-').reverse().join('/')} ➔ {weekDates[4].dateStr.split('-').reverse().join('/')}
                  </p>
                </div>
                <button
                  onClick={handleDownloadMingguan}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-2xl py-2.5 px-5 shadow transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-emerald-500 w-full sm:w-auto"
                >
                  <Download className="w-4 h-4 text-emerald-100" />
                  <span>Download Jurnal Mingguan .CSV</span>
                </button>
              </div>
            </div>

            {/* Matrix Sheet Table for Monday - Friday */}
            <div className="bg-white border border-slate-150 rounded-3xl shadow-sm overflow-hidden text-left">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <span className="text-xs font-extrabold text-slate-750 tracking-wide uppercase">
                  Matriks Jurnal Kehadiran Mingguan • {selectedKelas}
                </span>
                <span className="text-[10px] text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded">Hari Kerja Sekolah (Senin - Jumat)</span>
              </div>

              {mingguanReportData.length === 0 ? (
                <div className="py-12 text-center text-gray-400 space-y-2">
                  <Info className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs">Tidak ada data siswa yang cocok dengan filter saat ini.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-500 font-extrabold">
                        <th className="py-3 px-4 w-12 text-center">No</th>
                        <th className="py-3 px-2 w-24 font-mono select-all">NIS</th>
                        <th className="py-3 px-4">Nama Siswa</th>
                        {weekDates.map(wd => (
                          <th key={wd.dateStr} className="py-2 px-2 text-center w-[100px] border-l border-slate-200">
                            {wd.label}
                          </th>
                        ))}
                        <th className="py-2 px-3 text-center border-l-2 border-slate-300 w-32 bg-slate-150">Rekap Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {mingguanReportData.map((row, idx) => {
                        return (
                          <tr key={row.siswa.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-2.5 px-4 text-center text-slate-400 font-bold">{idx + 1}</td>
                            <td className="py-2.5 px-2 font-mono font-semibold text-slate-600">{row.siswa.nis}</td>
                            <td className="py-2.5 px-4 font-black text-slate-855 capitalize truncate max-w-[150px]">
                              {row.siswa.nama.toLowerCase()}
                            </td>
                            
                            {/* Rendering the Matrix Columns (Monday to Friday) */}
                            {row.recordsByDay.map(dayRec => {
                              let cellChar = '-';
                              let badgeColor = 'text-slate-400 bg-slate-50';

                              if (dayRec.status === 'Hadir') {
                                cellChar = '✔';
                                badgeColor = 'text-green-800 bg-green-100 font-extrabold rounded-lg';
                              } else if (dayRec.status === 'Terlambat') {
                                cellChar = 'T';
                                badgeColor = 'text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg';
                              } else if (dayRec.status === 'Sakit') {
                                cellChar = 'S';
                                badgeColor = 'text-rose-800 bg-rose-50 border border-rose-100 rounded-lg';
                              } else if (dayRec.status === 'Izin') {
                                cellChar = 'I';
                                badgeColor = 'text-amber-800 bg-amber-50 border border-amber-100 rounded-lg';
                              } else if (dayRec.status === 'Alfa') {
                                cellChar = 'A';
                                badgeColor = 'text-red-800 bg-red-100 font-extrabold rounded-lg';
                              }

                              return (
                                <td key={dayRec.dateStr} className="py-2 px-1 text-center border-l border-slate-150">
                                  <span className={`inline-block w-8 h-7 leading-7 text-[11px] font-black ${badgeColor}`}>
                                    {cellChar}
                                  </span>
                                </td>
                              );
                            })}

                            {/* Summary Metrics */}
                            <td className="py-2 px-2 text-center border-l-2 border-slate-205 bg-slate-50/50">
                              <div className="flex items-center justify-center gap-1.5 font-mono text-[10px] font-bold text-slate-650 flex-wrap">
                                <span className="bg-green-100 text-green-800 px-1 rounded" title="Hadir">H:{row.summary.hadir + row.summary.terlambat}</span>
                                <span className="bg-sky-105 text-sky-800 px-1 rounded" title="Ijin / Sakit">IS:{row.summary.izin + row.summary.sakit}</span>
                                <span className="bg-red-101 text-red-800 px-1 rounded" title="Alfa">A:{row.summary.alfa}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Micro Legenda Matrix */}
            <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-3 text-left">
              <span className="font-extrabold text-slate-700">Keterangan Singkatan Simbol Matriks Jurnal:</span>
              <div className="flex flex-wrap gap-4 items-center font-bold">
                <span className="flex items-center gap-1"><span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-black">✔</span> Hadir Mulai Tepat Waktu</span>
                <span className="flex items-center gap-1"><span className="bg-emerald-50 border border-emerald-100 text-emerald-800 px-1 rounded font-black">T</span> Terlambat Masuk Kelas</span>
                <span className="flex items-center gap-1"><span className="bg-rose-50 border border-rose-100 text-rose-800 px-1 rounded font-black">S</span> Absen Sakit (Surat Wali)</span>
                <span className="flex items-center gap-1"><span className="bg-amber-50 border border-amber-100 text-amber-800 px-1 rounded font-black">I</span> Absen Izin Kepentingan Keluarga</span>
                <span className="flex items-center gap-1"><span className="bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-black">A</span> Alfa / Tanpa Keterangan Apapun</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BULANAN */}
        {activeTab === 'bulanan' && (
          <div className="space-y-6">

            {/* Bulanan Selector controls */}
            <div className="bg-white border border-slate-150 p-5 rounded-3xl shadow-sm text-left flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full md:w-auto">
                <span className="bg-blue-50 p-2.5 rounded-xl text-blue-700 shrink-0">
                  <Calendar className="w-5 h-5" />
                </span>
                <div className="w-full">
                  <label className="block text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Periode Bulan Jurnal</label>
                  <input
                    type="month"
                    value={bulananMonth}
                    onChange={(e) => setBulananMonth(e.target.value)}
                    className="mt-0.5 max-w-full font-bold text-xs text-slate-755 bg-slate-50 border border-slate-200 py-1.5 px-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Informative statistics of the month */}
              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-stretch sm:items-center">
                <div className="bg-blue-50/50 border border-blue-100 rounded-2xl py-1.5 px-4 text-center sm:text-left">
                  <span className="text-[9px] text-blue-800 font-black tracking-tight block uppercase">Rata-Rata Kehadiran Kelas</span>
                  <p className="text-base font-black text-slate-800">{bulananStats.avgPersen}%</p>
                </div>
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl py-1.5 px-4 text-center sm:text-left flex items-center gap-2">
                  <Award className="w-4 h-4 text-emerald-600 animate-bounce shrink-0" />
                  <div>
                    <span className="text-[9px] text-emerald-800 font-black tracking-tight block uppercase">Keaktifan Terbaik (≥90%)</span>
                    <p className="text-base font-black text-slate-800 font-sans">{bulananStats.totalApresiasi} Siswa</p>
                  </div>
                </div>
                
                {/* Download bulanan report */}
                <button
                  onClick={handleDownloadBulanan}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-2xl py-2.5 px-5 shadow transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-emerald-500 w-full sm:w-auto"
                >
                  <Download className="w-4 h-4 text-emerald-100 text-left" />
                  <span>Download Rekap Bulanan .CSV</span>
                </button>
              </div>
            </div>

            {/* List spreadsheet styled layout for Monthly rekap */}
            <div className="bg-white border border-slate-150 rounded-3xl shadow-sm overflow-hidden text-left font-sans">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <span className="text-xs font-extrabold text-slate-750 tracking-wide uppercase">
                  Log Akumulasi Bulanan: {selectedKelas} • Bulan {new Date(`${bulananMonth}-02`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                </span>
                <span className="text-[10px] text-gray-400 font-bold font-mono">Daftar Aktif</span>
              </div>

              {bulananReportData.length === 0 ? (
                <div className="py-12 text-center text-gray-400 space-y-2">
                  <Info className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs">Tidak ada data siswa yang terekam pada bulan ini.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-500 font-extrabold text-left">
                        <th className="py-3 px-4 w-12 text-center">No</th>
                        <th className="py-3 px-4 w-28 font-mono">NIS</th>
                        <th className="py-3 px-4">Nama Lengkap Siswa</th>
                        <th className="py-3 px-4 w-28">Kelas</th>
                        <th className="py-3 px-3 text-center border-l border-slate-200 w-20 bg-green-50 text-green-800">Hadir</th>
                        <th className="py-3 px-3 text-center border-l border-slate-200 w-20 bg-emerald-50 text-emerald-800">Late</th>
                        <th className="py-3 px-3 text-center border-l border-slate-200 w-20 bg-amber-50 text-amber-800 mr-2">Izin</th>
                        <th className="py-3 px-3 text-center border-l border-slate-200 w-20 bg-rose-50 text-rose-800 mr-2">Sakit</th>
                        <th className="py-3 px-3 text-center border-l border-slate-200 w-20 bg-red-50 text-red-800">Alfa</th>
                        <th className="py-3 px-4 text-center border-l border-slate-200 w-28 font-bold bg-slate-150">Keaktifan (%)</th>
                        <th className="py-3 px-4 w-32 border-l border-slate-200 text-center">Kualifikasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bulananReportData.map((row, idx) => {
                        let qualificationBadge = 'bg-red-100 text-red-700 border-red-200';
                        let qualificationText = 'Rendah (Butuh Perhatian)';

                        if (row.metrics.persen >= 90) {
                          qualificationBadge = 'bg-green-100 text-green-800 border-green-200';
                          qualificationText = 'Sempurna / Sangat Aktif';
                        } else if (row.metrics.persen >= 80) {
                          qualificationBadge = 'bg-emerald-50 text-emerald-800 border-emerald-100';
                          qualificationText = 'Baik (Aktif)';
                        } else if (row.metrics.persen >= 60) {
                          qualificationBadge = 'bg-amber-50 text-amber-805 border-amber-100';
                          qualificationText = 'Cukup Pendukung';
                        }

                        return (
                          <tr key={row.siswa.id} className="hover:bg-slate-50 transition-colors">
                            <td className="py-2.5 px-4 text-center text-slate-400 font-bold">{idx + 1}</td>
                            <td className="py-2.5 px-4 font-mono font-bold text-slate-600">{row.siswa.nis}</td>
                            <td className="py-2.5 px-4 font-extrabold text-slate-800 capitalize">{row.siswa.nama.toLowerCase()}</td>
                            <td className="py-2.5 px-4 text-slate-500 font-bold">{row.siswa.kelas}</td>
                            
                            <td className="py-2.5 px-3 text-center font-bold border-l border-slate-200 text-slate-700 font-mono bg-green-50/20">{row.metrics.hadir}</td>
                            <td className="py-2.5 px-3 text-center font-bold border-l border-slate-200 text-slate-700 font-mono bg-emerald-50/25">{row.metrics.terlambat}</td>
                            <td className="py-2.5 px-3 text-center font-bold border-l border-slate-200 text-slate-700 font-mono bg-amber-50/20">{row.metrics.izin}</td>
                            <td className="py-2.5 px-3 text-center font-bold border-l border-slate-200 text-slate-700 font-mono bg-rose-50/20">{row.metrics.sakit}</td>
                            <td className="py-2.5 px-3 text-center font-bold border-l border-slate-200 text-red-650 font-mono bg-red-50/20">{row.metrics.alfa}</td>
                            
                            {/* Score display */}
                            <td className="py-2.5 px-4 text-center font-sans font-black text-blue-700 border-l border-slate-205 bg-slate-50">
                              <div className="flex items-center justify-center gap-1">
                                <TrendingUp className="w-3 h-3 text-blue-600" />
                                <span>{row.metrics.persen}%</span>
                              </div>
                            </td>
                            {/* Qualification badge */}
                            <td className="py-2.5 px-4 border-l border-slate-150 text-center font-sans font-black">
                              <span className={`inline-block py-0.5 px-2 rounded-lg text-[9px] border font-black truncate max-w-full leading-relaxed ${qualificationBadge}`}>
                                {qualificationText}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

