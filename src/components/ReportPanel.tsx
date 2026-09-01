import { useState, useMemo, memo } from 'react';
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
  School,
  FileDown
} from 'lucide-react';
import { Siswa, Presensi, StatusKehadiran, SystemSettings, DAFTAR_KELAS } from '../types';
import AttendanceBarChart from './AttendanceBarChart';
import AttendancePrintModal from './AttendancePrintModal';
import ClassReportDownloadModal from './ClassReportDownloadModal';
import {
  getLocalDateString,
  getLatestAttendanceForStudent,
  isPresensiMatchSiswa,
  isPresensiDateMatch,
  calculateAllRombelSummaryList,
  calculateClassAttendanceStats,
  calculateSchoolAttendanceStats,
  isSameClass,
  buildDailyAttendanceIndex,
  getAttendanceFromIndex,
  normalizeDateKey,
} from '../lib/attendanceUtils';
import { downloadSingleClassReport } from '../lib/attendanceReportExport';

interface ReportPanelProps {
  siswaList: Siswa[];
  presensiList: Presensi[];
  settings?: SystemSettings;
}

type ActiveTab = 'harian' | 'mingguan' | 'bulanan';
type StatusFilterType = 'semua' | 'hadir_total' | 'hadir' | 'terlambat' | 'sakit' | 'izin' | 'alfa' | 'belum_absen';

function ReportPanel({ siswaList, presensiList, settings }: ReportPanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('harian');
  const [selectedKelas, setSelectedKelas] = useState<string>('Semua Kelas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('semua');

  // Modals state
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printConfig, setPrintConfig] = useState<{
    type: 'harian' | 'mingguan' | 'bulanan' | 'rombel';
    kelas: string;
    date: string;
    month: string;
  }>({
    type: 'harian',
    kelas: 'Semua Kelas',
    date: getLocalDateString(),
    month: new Date().toISOString().slice(0, 7)
  });

  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [downloadModalType, setDownloadModalType] = useState<'harian' | 'mingguan' | 'bulanan'>('harian');

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
    let totalTidakHadir = 0;
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
      totalTidakHadir += r.totalTidakHadir;
      totalHadir += r.totalHadir;
    });

    const persentase = totalSiswa > 0 ? Math.min(100, Math.round((totalHadir / totalSiswa) * 100)) : 0;

    return {
      totalSiswa,
      hadir,
      terlambat,
      sakit,
      izin,
      alfa,
      sakitDanIzin,
      belumAbsen,
      totalTidakHadir,
      totalHadir,
      persentase
    };
  }, [allRombelSummary]);

  // Common filtered list of students
  const filteredStudents = useMemo(() => {
    return siswaList.filter(s => {
      const matchKelas = selectedKelas === 'Semua Kelas' || isSameClass(s.kelas, selectedKelas);
      const matchQuery = s.nama.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         s.nis.includes(searchQuery);
      return matchKelas && matchQuery;
    });
  }, [siswaList, selectedKelas, searchQuery]);

  // Daily index memoized for instant O(1) student matching
  const harianDailyIndex = useMemo(() => {
    return buildDailyAttendanceIndex(presensiList, harianDate);
  }, [presensiList, harianDate]);

  // HARIAN: Calculate attendance state per student for the selected date
  const harianReportDataRaw = useMemo(() => {
    return filteredStudents.map(siswa => {
      const record = getAttendanceFromIndex(siswa, harianDailyIndex);
      return {
        siswa,
        record: record || null,
        status: record ? record.status : ('Belum Absen' as StatusKehadiran | 'Belum Absen'),
        hasPresensi: !!record
      };
    });
  }, [filteredStudents, harianDailyIndex]);

  // Apply Status Filter
  const [harianPageLimit, setHarianPageLimit] = useState(40);

  const harianReportData = useMemo(() => {
    if (statusFilter === 'semua') return harianReportDataRaw;
    if (statusFilter === 'hadir_total') return harianReportDataRaw.filter(r => r.status === 'Hadir' || r.status === 'Terlambat');
    if (statusFilter === 'hadir') return harianReportDataRaw.filter(r => r.status === 'Hadir');
    if (statusFilter === 'terlambat') return harianReportDataRaw.filter(r => r.status === 'Terlambat');
    if (statusFilter === 'sakit') return harianReportDataRaw.filter(r => r.status === 'Sakit');
    if (statusFilter === 'izin') return harianReportDataRaw.filter(r => r.status === 'Izin');
    if (statusFilter === 'alfa') return harianReportDataRaw.filter(r => r.status === 'Alfa');
    if (statusFilter === 'belum_absen') return harianReportDataRaw.filter(r => r.status === 'Belum Absen');
    return harianReportDataRaw;
  }, [harianReportDataRaw, statusFilter]);

  const displayedHarianRows = useMemo(() => {
    return harianReportData.slice(0, harianPageLimit);
  }, [harianReportData, harianPageLimit]);

  // Harian Statistics Summary for the active selection
  const harianStats = useMemo(() => {
    const total = harianReportDataRaw.length;
    if (total === 0) return { total: 0, hadir: 0, terlambat: 0, sakit: 0, izin: 0, alfa: 0, belumAbsen: 0, totalHadirSemua: 0, totalTidakHadir: 0, percentage: 0 };
    
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

    const totalHadirSemua = hadir + terlambat;
    const totalTidakHadir = sakit + izin + alfa + belumAbsen;
    const percentage = total > 0 ? Math.min(100, Math.round((totalHadirSemua / total) * 100)) : 0;

    return { total, hadir, terlambat, sakit, izin, alfa, belumAbsen, totalHadirSemua, totalTidakHadir, percentage };
  }, [harianReportDataRaw]);

  // MINGGUAN: Calculate student matrix for Monday - Friday (Instant indexed execution)
  const mingguanReportData = useMemo(() => {
    if (activeTab !== 'mingguan') return [];

    const weekIndexes = weekDates.map(wd => ({
      dateStr: wd.dateStr,
      index: buildDailyAttendanceIndex(presensiList, wd.dateStr)
    }));

    return filteredStudents.map(siswa => {
      const recordsByDay = weekIndexes.map(item => {
        const found = getAttendanceFromIndex(siswa, item.index);
        return {
          dateStr: item.dateStr,
          status: found ? found.status : '-'
        };
      });

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
  }, [filteredStudents, presensiList, weekDates, activeTab]);

  // BULANAN: Aggregates for the whole month (Optimized with pre-built student bucket map)
  const bulananReportData = useMemo(() => {
    if (activeTab !== 'bulanan') return [];

    const monthRecords = presensiList.filter(p => p.tanggal && normalizeDateKey(p.tanggal).startsWith(bulananMonth));
    const uniqueDaysWithAttendance = Array.from(new Set(monthRecords.map(p => normalizeDateKey(p.tanggal)))).length;
    const totalSchoolDays = Math.max(uniqueDaysWithAttendance, 1);

    // Pre-bucket month records by student ID & NIS for O(1) lookup
    const recordsByStudentKey = new Map<string, Presensi[]>();
    for (const r of monthRecords) {
      if (r.siswaId) {
        const arr = recordsByStudentKey.get(r.siswaId) || [];
        arr.push(r);
        recordsByStudentKey.set(r.siswaId, arr);
      }
      if (r.nis) {
        const cleanNis = r.nis.trim();
        const arr = recordsByStudentKey.get(`nis:${cleanNis}`) || [];
        arr.push(r);
        recordsByStudentKey.set(`nis:${cleanNis}`, arr);
      }
    }

    return filteredStudents.map(siswa => {
      let studentMonthRecords = recordsByStudentKey.get(siswa.id);
      if (!studentMonthRecords && siswa.nis) {
        studentMonthRecords = recordsByStudentKey.get(`nis:${siswa.nis.trim()}`);
      }
      if (!studentMonthRecords) {
        studentMonthRecords = monthRecords.filter(p => isPresensiMatchSiswa(p, siswa));
      }
      
      const dateMap = new Map<string, Presensi>();
      studentMonthRecords.forEach(r => {
        const dKey = normalizeDateKey(r.tanggal);
        const existing = dateMap.get(dKey);
        if (!existing || (r.waktu && existing.waktu && r.waktu > existing.waktu)) {
          dateMap.set(dKey, r);
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
  }, [filteredStudents, presensiList, bulananMonth, activeTab]);

  // Bulanan stats overall
  const bulananStats = useMemo(() => {
    if (bulananReportData.length === 0) return { avgPersen: 0, totalApresiasi: 0 };
    const totalPercentage = bulananReportData.reduce((acc, curr) => acc + curr.metrics.persen, 0);
    const avgPersen = Math.round(totalPercentage / bulananReportData.length);
    const totalApresiasi = bulananReportData.filter(r => r.metrics.persen >= 90).length;

    return { avgPersen, totalApresiasi };
  }, [bulananReportData]);

  // -- DOWNLOAD TRIGGERS (Centralized CSV & ZIP Generators) --

  const handleDownloadHarian = () => {
    downloadSingleClassReport('harian', selectedKelas, harianDate, siswaList, presensiList);
  };

  const handleDownloadRekapRombel = () => {
    downloadSingleClassReport('harian', 'Semua Kelas', harianDate, siswaList, presensiList);
  };

  const handleDownloadMingguan = () => {
    downloadSingleClassReport('mingguan', selectedKelas, mingguanDate, siswaList, presensiList);
  };

  const handleDownloadBulanan = () => {
    downloadSingleClassReport('bulanan', selectedKelas, bulananMonth, siswaList, presensiList);
  };

  const handleOpenPrintModal = (
    type: 'harian' | 'mingguan' | 'bulanan' | 'rombel' = activeTab, 
    kelas: string = selectedKelas, 
    date: string = activeTab === 'mingguan' ? mingguanDate : harianDate
  ) => {
    setPrintConfig({
      type,
      kelas,
      date,
      month: bulananMonth
    });
    setIsPrintModalOpen(true);
  };

  const handleOpenDownloadModal = (type: 'harian' | 'mingguan' | 'bulanan' = activeTab) => {
    setDownloadModalType(type);
    setIsDownloadModalOpen(true);
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
            Hasil rekapitulasi data presensi siswa SDN 3 Karamatwangi secara harian per rombel, mingguan, maupun bulanan. Diperbarui secara riil dan siap diekspor ke format .CSV per kelas atau dicetak langsung dengan format kop surat resmi.
          </p>
        </div>

        {/* Global Print / Download shortcut */}
        <div className="flex flex-wrap items-center gap-2 shrink-0 self-end md:self-auto">
          <button
            type="button"
            onClick={() => handleOpenDownloadModal(activeTab)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-2.5 px-4 rounded-xl shadow transition-all cursor-pointer flex items-center gap-1.5 border border-emerald-500"
            title="Pusat unduh rekap absensi per kelas"
          >
            <Download className="w-4 h-4 text-emerald-100" />
            <span>Unduh Rekap Per Kelas</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenPrintModal(activeTab, selectedKelas)}
            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow transition-all cursor-pointer flex items-center gap-1.5 border border-slate-800"
            title="Pratinjau cetak / simpan sebagai PDF"
          >
            <Printer className="w-4 h-4 text-slate-300" />
            <span>Cetak Dokumen Resmi</span>
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
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 w-full lg:w-auto">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-2 text-center min-w-[75px]">
                  <span className="text-[9px] font-black text-slate-600 block uppercase">Total Siswa</span>
                  <p className="text-base font-black text-slate-900 mt-0.5">{harianStats.total}</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-2 text-center min-w-[75px]">
                  <span className="text-[9px] font-black text-blue-800 block uppercase">Total Masuk</span>
                  <p className="text-base font-black text-blue-950 mt-0.5">{harianStats.totalHadirSemua}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-2 text-center min-w-[75px]">
                  <span className="text-[9px] font-black text-emerald-800 block uppercase">Hadir Tepat</span>
                  <p className="text-base font-black text-emerald-950 mt-0.5">{harianStats.hadir}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-2 text-center min-w-[75px]">
                  <span className="text-[9px] font-black text-amber-800 block uppercase">Terlambat</span>
                  <p className="text-base font-black text-amber-950 mt-0.5">{harianStats.terlambat}</p>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-2 text-center min-w-[75px]">
                  <span className="text-[9px] font-black text-indigo-800 block uppercase">Sakit</span>
                  <p className="text-base font-black text-indigo-950 mt-0.5">{harianStats.sakit}</p>
                </div>
                <div className="bg-sky-50 border border-sky-100 rounded-2xl p-2 text-center min-w-[75px]">
                  <span className="text-[9px] font-black text-sky-850 block uppercase">Izin</span>
                  <p className="text-base font-black text-sky-950 mt-0.5">{harianStats.izin}</p>
                </div>
                <div className="bg-rose-50 border border-rose-100 rounded-2xl p-2 text-center min-w-[75px]">
                  <span className="text-[9px] font-black text-rose-800 block uppercase">Alfa</span>
                  <p className="text-base font-black text-rose-950 mt-0.5">{harianStats.alfa}</p>
                </div>
                <div className="bg-slate-100 border border-slate-200 rounded-2xl p-2 text-center min-w-[75px]">
                  <span className="text-[9px] font-black text-slate-600 block uppercase">Belum Absen</span>
                  <p className="text-base font-black text-slate-800 mt-0.5">{harianStats.belumAbsen}</p>
                </div>
              </div>
            </div>

            {/* FORMULA REKAPITULASI TRANSPARAN */}
            <div className="bg-gradient-to-r from-blue-50 via-slate-50 to-emerald-50 border border-blue-200/80 rounded-2xl p-3.5 text-xs text-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="bg-blue-600 text-white p-1.5 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </span>
                <div>
                  <p className="font-extrabold text-slate-800">
                    Sinkronisasi Data Presensi ({selectedKelas}):
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Total Siswa ({harianStats.total}) = <b>Hadir Masuk ({harianStats.totalHadirSemua})</b> + <b>Tidak Hadir / Pengurang ({harianStats.totalTidakHadir})</b>
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                  Masuk: {harianStats.hadir} Tepat + {harianStats.terlambat} Telat = {harianStats.totalHadirSemua} Siswa ({harianStats.percentage}%)
                </span>
                <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded-md">
                  Pengurang: {harianStats.sakit} Sakit + {harianStats.izin} Izin + {harianStats.alfa} Alfa + {harianStats.belumAbsen} Belum = {harianStats.totalTidakHadir} Siswa
                </span>
              </div>
            </div>

            {/* GRAFIK ANALITIK BATANG (RECHARTS BAR CHART) */}
            <AttendanceBarChart
              siswaList={siswaList}
              presensiList={presensiList}
              selectedDate={harianDate}
              selectedKelas={selectedKelas}
              onSelectKelas={(kelas) => setSelectedKelas(kelas)}
            />

            {/* SECTION 1: REKAPITULASI ROMBEL SELURUH KELAS 1-A s/d 6-B */}
            <div className="bg-white border border-slate-150 rounded-3xl shadow-sm overflow-hidden text-left">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-50 to-blue-50/40">
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
                
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOpenDownloadModal('harian')}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl py-2 px-3 shadow-xs transition-all cursor-pointer flex items-center gap-1.5 border border-emerald-500"
                    title="Pusat unduh rekap per kelas (CSV / ZIP)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-100" />
                    <span>Unduh Rekap Per Kelas</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadRekapRombel}
                    className="bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl py-2 px-3 shadow-xs transition-all cursor-pointer flex items-center gap-1.5 border border-teal-500"
                  >
                    <Download className="w-3.5 h-3.5 text-teal-100" />
                    <span>Download Rekap Rombel .CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenPrintModal('rombel', 'Semua Kelas', harianDate)}
                    className="bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs rounded-xl py-2 px-3 shadow-xs transition-all cursor-pointer flex items-center gap-1.5 border border-slate-700"
                    title="Cetak format rekapitulasi rombel A4"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-300" />
                    <span>Cetak Rombel</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-black text-left whitespace-nowrap">
                      <th className="py-3 px-3 w-10 text-center">No</th>
                      <th className="py-3 px-3 w-28">Rombel</th>
                      <th className="py-3 px-3">Wali Kelas</th>
                      <th className="py-3 px-2.5 text-center bg-slate-200/60 text-slate-800">Total Murid</th>
                      <th className="py-3 px-2 text-center bg-emerald-100/60 text-emerald-900">Hadir</th>
                      <th className="py-3 px-2 text-center bg-amber-100/60 text-amber-900">Telat</th>
                      <th className="py-3 px-2 text-center bg-indigo-100/60 text-indigo-900">Sakit</th>
                      <th className="py-3 px-2 text-center bg-sky-100/60 text-sky-900">Izin</th>
                      <th className="py-3 px-2 text-center bg-rose-100/60 text-rose-900">Alfa</th>
                      <th className="py-3 px-2 text-center bg-slate-100 text-slate-700">Belum</th>
                      <th className="py-3 px-2.5 text-center bg-blue-100/70 text-blue-950 font-black">Total Masuk</th>
                      <th className="py-3 px-2.5 text-center bg-rose-50 text-rose-900 font-black">Pengurang</th>
                      <th className="py-3 px-2.5 text-center bg-emerald-50 text-emerald-900">% Keaktifan</th>
                      <th className="py-3 px-2.5 text-center">Aksi / Unduh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 whitespace-nowrap">
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
                          <td className="py-2.5 px-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-black text-slate-800 flex items-center gap-1.5">
                            <span>{rombel.kelas}</span>
                            {isSelected && (
                              <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.2 rounded font-bold">Aktif</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 font-medium">👤 {rombel.waliKelas}</td>
                          <td className="py-2.5 px-2.5 text-center font-black text-slate-900 bg-slate-50/80">{rombel.totalSiswa}</td>
                          <td className="py-2.5 px-2 text-center font-bold text-emerald-800 bg-emerald-50/40">{rombel.hadir}</td>
                          <td className="py-2.5 px-2 text-center font-bold text-amber-800 bg-amber-50/40">{rombel.terlambat}</td>
                          <td className="py-2.5 px-2 text-center font-bold text-indigo-800 bg-indigo-50/40">{rombel.sakit}</td>
                          <td className="py-2.5 px-2 text-center font-bold text-sky-800 bg-sky-50/40">{rombel.izin}</td>
                          <td className="py-2.5 px-2 text-center font-bold text-rose-800 bg-rose-50/40">{rombel.alfa}</td>
                          <td className="py-2.5 px-2 text-center font-medium text-slate-600 bg-slate-50/40">{rombel.belumAbsen}</td>
                          <td className="py-2.5 px-2.5 text-center font-black text-blue-900 bg-blue-50/60">{rombel.totalHadir}</td>
                          <td className="py-2.5 px-2.5 text-center font-bold text-rose-700 bg-rose-50/40">{rombel.totalTidakHadir}</td>
                          <td className={`py-2.5 px-2.5 text-center font-mono font-black ${rateColor}`}>{rombel.persentase}%</td>
                          <td className="py-2.5 px-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                title={`Download CSV Kelas ${rombel.kelas}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadSingleClassReport('harian', rombel.kelas, harianDate, siswaList, presensiList);
                                }}
                                className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-100/70 hover:bg-emerald-100 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <Download className="w-3 h-3" />
                                <span>CSV</span>
                              </button>

                              <button
                                type="button"
                                title={`Cetak Dokumen Kelas ${rombel.kelas}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenPrintModal('harian', rombel.kelas, harianDate);
                                }}
                                className="text-[10px] font-bold text-slate-700 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <Printer className="w-3 h-3" />
                                <span>Cetak</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedKelas(rombel.kelas);
                                }}
                                className="text-[10px] font-bold text-blue-700 hover:text-blue-800 bg-blue-100/70 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                              >
                                Detail
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Grand Total Row */}
                    <tr className="bg-slate-200/90 border-t-2 border-slate-300 font-black text-slate-900">
                      <td className="py-3 px-3 text-center">Σ</td>
                      <td className="py-3 px-3">TOTAL SEKOLAH</td>
                      <td className="py-3 px-3 text-slate-600 font-bold">12 Rombel Kelas</td>
                      <td className="py-3 px-2.5 text-center bg-slate-300/70 font-black text-slate-950">{grandTotalSchool.totalSiswa}</td>
                      <td className="py-3 px-2 text-center text-emerald-900 font-black">{grandTotalSchool.hadir}</td>
                      <td className="py-3 px-2 text-center text-amber-900 font-black">{grandTotalSchool.terlambat}</td>
                      <td className="py-3 px-2 text-center text-indigo-900 font-black">{grandTotalSchool.sakit}</td>
                      <td className="py-3 px-2 text-center text-sky-900 font-black">{grandTotalSchool.izin}</td>
                      <td className="py-3 px-2 text-center text-rose-900 font-black">{grandTotalSchool.alfa}</td>
                      <td className="py-3 px-2 text-center text-slate-700 font-black">{grandTotalSchool.belumAbsen}</td>
                      <td className="py-3 px-2.5 text-center text-blue-950 font-black bg-blue-100/80">{grandTotalSchool.totalHadir}</td>
                      <td className="py-3 px-2.5 text-center text-rose-900 font-black bg-rose-100/80">{grandTotalSchool.totalTidakHadir}</td>
                      <td className="py-3 px-2.5 text-center text-blue-950 font-mono font-black">{grandTotalSchool.persentase}%</td>
                      <td className="py-3 px-2.5 text-center">
                        <button
                          onClick={() => setSelectedKelas('Semua Kelas')}
                          className="text-[10px] font-bold text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-300 transition-colors cursor-pointer"
                        >
                          Semua Kelas
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
                  <div className="flex flex-wrap items-center bg-slate-200/60 p-1 rounded-xl gap-1">
                    <button
                      onClick={() => setStatusFilter('semua')}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                        statusFilter === 'semua' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      Semua ({harianReportDataRaw.length})
                    </button>
                    <button
                      onClick={() => setStatusFilter('hadir_total')}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                        statusFilter === 'hadir_total' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      Total Masuk ({harianStats.totalHadirSemua})
                    </button>
                    <button
                      onClick={() => setStatusFilter('hadir')}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                        statusFilter === 'hadir' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      Hadir ({harianStats.hadir})
                    </button>
                    <button
                      onClick={() => setStatusFilter('terlambat')}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                        statusFilter === 'terlambat' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      Telat ({harianStats.terlambat})
                    </button>
                    <button
                      onClick={() => setStatusFilter('sakit')}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                        statusFilter === 'sakit' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      Sakit ({harianStats.sakit})
                    </button>
                    <button
                      onClick={() => setStatusFilter('izin')}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                        statusFilter === 'izin' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      Izin ({harianStats.izin})
                    </button>
                    <button
                      onClick={() => setStatusFilter('alfa')}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                        statusFilter === 'alfa' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      Alfa ({harianStats.alfa})
                    </button>
                    <button
                      onClick={() => setStatusFilter('belum_absen')}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                        statusFilter === 'belum_absen' ? 'bg-slate-600 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      Belum Presensi ({harianStats.belumAbsen})
                    </button>
                  </div>

                  {/* Action buttons: Cetak & Download CSV */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenPrintModal('harian', selectedKelas, harianDate)}
                      className="bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs rounded-xl py-1.5 px-3 shadow-xs transition-all cursor-pointer flex items-center gap-1 border border-slate-700"
                      title="Cetak format daftar presensi siswa"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-300" />
                      <span>Cetak</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadHarian}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl py-1.5 px-3 shadow-xs transition-all cursor-pointer flex items-center gap-1 border border-emerald-500"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-100" />
                      <span>Download .CSV</span>
                    </button>
                  </div>
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
                      {displayedHarianRows.map((row, idx) => {
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
                  {harianReportData.length > harianPageLimit && (
                    <div className="p-3 text-center bg-slate-50 border-t border-slate-100">
                      <button
                        onClick={() => setHarianPageLimit(prev => prev + 50)}
                        className="bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer border border-slate-200 shadow-2xs"
                      >
                        Tampilkan 50 Data Lagi (Menampilkan {displayedHarianRows.length} dari {harianReportData.length} siswa)
                      </button>
                    </div>
                  )}
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
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                <div className="bg-slate-50 border border-slate-150 py-2 px-3 rounded-xl text-xs space-y-0.5 text-left shrink-0">
                  <span className="text-[9px] text-slate-400 font-bold block uppercase">Kisaran Tanggal</span>
                  <p className="font-bold text-slate-750 text-xs">
                    {weekDates[0].dateStr.split('-').reverse().join('/')} ➔ {weekDates[4].dateStr.split('-').reverse().join('/')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenDownloadModal('mingguan')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl py-2.5 px-3.5 shadow transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-emerald-500"
                  title="Unduh rekap mingguan per kelas (ZIP / CSV)"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-100" />
                  <span>Unduh Rekap Per Kelas</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenPrintModal('mingguan', selectedKelas, mingguanDate)}
                  className="bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs rounded-xl py-2.5 px-3.5 shadow transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-slate-700"
                  title="Cetak format jurnal mingguan A4 Landscape"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-300" />
                  <span>Cetak Jurnal</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadMingguan}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl py-2.5 px-3.5 shadow transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-teal-500"
                >
                  <Download className="w-3.5 h-3.5 text-teal-100" />
                  <span>Download .CSV</span>
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

              {/* Informative statistics of the month and download triggers */}
              <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
                <div className="bg-blue-50/50 border border-blue-100 rounded-2xl py-1.5 px-3 text-center sm:text-left">
                  <span className="text-[9px] text-blue-800 font-black tracking-tight block uppercase">Rata-Rata Kehadiran</span>
                  <p className="text-sm font-black text-slate-800">{bulananStats.avgPersen}%</p>
                </div>
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl py-1.5 px-3 text-center sm:text-left flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="text-[9px] text-emerald-800 font-black tracking-tight block uppercase">Aktif (≥90%)</span>
                    <p className="text-sm font-black text-slate-800 font-sans">{bulananStats.totalApresiasi} Siswa</p>
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={() => handleOpenDownloadModal('bulanan')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl py-2.5 px-3.5 shadow transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-emerald-500"
                  title="Unduh rekap bulanan per kelas (ZIP / CSV)"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-100" />
                  <span>Unduh Rekap Per Kelas</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenPrintModal('bulanan', selectedKelas, bulananMonth)}
                  className="bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs rounded-xl py-2.5 px-3.5 shadow transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-slate-700"
                  title="Cetak format rekapitulasi bulanan A4 Landscape"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-300" />
                  <span>Cetak Rekap</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadBulanan}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl py-2.5 px-3.5 shadow transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-teal-500"
                >
                  <Download className="w-3.5 h-3.5 text-teal-100 text-left" />
                  <span>Download .CSV</span>
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

      {/* Attendance Print Modal (Official Letterhead, Table, Signatures, PDF/Print support) */}
      <AttendancePrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        siswaList={siswaList}
        presensiList={presensiList}
        settings={settings}
        defaultType={printConfig.type}
        defaultKelas={printConfig.kelas}
        defaultDate={printConfig.date}
        defaultMonth={printConfig.month}
      />

      {/* Class Report Download Modal (Per-class CSV downloads & Bulk ZIP archive) */}
      <ClassReportDownloadModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        siswaList={siswaList}
        presensiList={presensiList}
        initialType={downloadModalType}
        initialDate={activeTab === 'mingguan' ? mingguanDate : harianDate}
        initialMonth={bulananMonth}
        onOpenPrintModal={(type, kelas, date) => handleOpenPrintModal(type, kelas, date)}
      />

    </div>
  );
}

export default memo(ReportPanel);

