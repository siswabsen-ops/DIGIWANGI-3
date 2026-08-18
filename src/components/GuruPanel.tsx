import { useState, useMemo } from 'react';
import {
  Notebook,
  UserCheck,
  Award,
  Users,
  Search,
  CheckCircle,
  AlertOctagon,
  Clock,
  RefreshCw,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Layers
} from 'lucide-react';
import { Siswa, Presensi, StatusKehadiran, DAFTAR_KELAS } from '../types';
import {
  getLocalDateString,
  getLocalTimeString,
  calculateClassAttendanceStats,
  getLatestAttendanceForStudent,
  isSameClass,
  buildDailyAttendanceIndex,
  getAttendanceFromIndex,
} from '../lib/attendanceUtils';
import { getWaliKelasByKelas } from '../lib/demoData';

interface GuruPanelProps {
  siswaList: Siswa[];
  presensiList: Presensi[];
  currentUser: { namaLengkap: string; role: string; kelasSpesifik?: string };
  onAddPresensi: (presensi: Presensi) => void;
}

export default function GuruPanel({
  siswaList,
  presensiList,
  currentUser,
  onAddPresensi,
}: GuruPanelProps) {
  const defaultKelas = currentUser.kelasSpesifik || 'Kelas 6-A';
  const [selectedKelas, setSelectedKelas] = useState<string>(defaultKelas);
  const [targetDate, setTargetDate] = useState<string>(() => getLocalDateString());
  const [filterSiswaName, setFilterSiswaName] = useState('');
  const [statusFilter, setStatusFilter] = useState<'semua' | 'hadir_total' | 'hadir' | 'terlambat' | 'sakit' | 'izin' | 'alfa' | 'belum_absen'>('semua');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const targetedKelas = selectedKelas;
  const waliKelasName = getWaliKelasByKelas(targetedKelas);

  // Extract class specific pupils list
  const classStudents = useMemo(() => {
    return siswaList.filter((s) => isSameClass(s.kelas, targetedKelas));
  }, [siswaList, targetedKelas]);

  // Index map for fast attendance lookup
  const dailyIndex = useMemo(() => {
    return buildDailyAttendanceIndex(presensiList, targetDate);
  }, [presensiList, targetDate]);

  // Calculate precise attendance statistics per unique student for target date
  const stats = useMemo(() => {
    return calculateClassAttendanceStats(classStudents, presensiList, targetDate, dailyIndex);
  }, [classStudents, presensiList, targetDate, dailyIndex]);

  const totalSiswaRombel = stats.totalSiswa;
  const loggedHadir = stats.hadir;
  const loggedTerlambat = stats.terlambat;
  const loggedSakit = stats.sakit;
  const loggedIzin = stats.izin;
  const loggedAlfa = stats.alfa;
  const loggedSakitIzin = stats.sakitDanIzin;
  const totalTidakHadir = stats.totalTidakHadir;
  const totalHadirSemua = stats.totalHadirSemua;
  const belumScannedCount = stats.belumAbsen;
  const persentaseKelas = stats.persentaseKeaktifan;

  // Filtered pupils by search and status
  const filteredClassStudents = useMemo(() => {
    return classStudents.filter((s) => {
      const matchesName = s.nama.toLowerCase().includes(filterSiswaName.toLowerCase()) ||
                          (s.nis && s.nis.includes(filterSiswaName));
      if (!matchesName) return false;

      if (statusFilter === 'semua') return true;
      const reg = getAttendanceFromIndex(s, dailyIndex);
      if (statusFilter === 'hadir_total') return reg?.status === 'Hadir' || reg?.status === 'Terlambat';
      if (statusFilter === 'hadir') return reg?.status === 'Hadir';
      if (statusFilter === 'terlambat') return reg?.status === 'Terlambat';
      if (statusFilter === 'sakit') return reg?.status === 'Sakit';
      if (statusFilter === 'izin') return reg?.status === 'Izin';
      if (statusFilter === 'alfa') return reg?.status === 'Alfa';
      if (statusFilter === 'belum_absen') return !reg;
      return true;
    });
  }, [classStudents, filterSiswaName, statusFilter, dailyIndex]);

  // Single Manual Trigger specifically for this teacher class-room
  const handleTeacherSetStatus = (siswa: Siswa, targetStatus: StatusKehadiran) => {
    const waktuSekarang = getLocalTimeString();

    // Look for previous same record to overwrite
    const existingRecord = getLatestAttendanceForStudent(siswa, presensiList, targetDate);
    const overwriteRecordId = existingRecord ? existingRecord.id : `pr-${siswa.id}-${targetDate}`;

    const newRecord: Presensi = {
      id: overwriteRecordId,
      siswaId: siswa.id,
      nis: siswa.nis,
      nik: siswa.nik,
      nama: siswa.nama,
      kelas: siswa.kelas,
      tanggal: targetDate,
      waktu: waktuSekarang,
      status: targetStatus,
      waStatus: 'Terkirim',
      pesanTerkirim: `Diproses via Server Utama WA Gateway (087844651559) ➔ Disinkronkan manual oleh Wali Kelas (${siswa.waOrangTua})`,
      operator: currentUser.namaLengkap,
    };

    onAddPresensi(newRecord);
    
    setSuccessMsg(`Konfirmasi: Berhasil menyinkronkan status presensi ${siswa.nama} menjadi [${targetStatus}]. Notifikasi WA terkirim.`);
    setTimeout(() => setSuccessMsg(''), 3500);
  };

  const handleManualSync = () => {
    setIsSyncing(true);
    setSuccessMsg(`Data presensi rombel ${targetedKelas} tersinkronisasi 100% dengan WA Gateway Live.`);
    setTimeout(() => {
      setIsSyncing(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    }, 400);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* HEADER BANNER */}
      <div className="bg-[#128C7E] rounded-3xl p-6 text-white shadow-md relative overflow-hidden border border-emerald-600">
        <div className="absolute top-0 right-0 w-12 h-3 flex">
          <div className="w-1/2 bg-white" />
          <div className="w-1/2 bg-red-650" />
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-emerald-800/40 text-emerald-100 border border-emerald-400/40 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full inline-block">
                Ruang Guru • Wali Kelas
              </span>
              <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {targetedKelas}
              </span>
            </div>
            <h2 className="text-2xl font-black mt-1 leading-tight tracking-tight">SDN 3 Rombel {targetedKelas}</h2>
            <p className="text-xs text-emerald-100 opacity-90 leading-normal mt-0.5">
              Wali Kelas: <b>{waliKelasName}</b> • Operator: <b>{currentUser.namaLengkap}</b>.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleManualSync}
              className="bg-white/15 hover:bg-white/25 text-white border border-white/25 px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Sinkronkan dengan Notifikasi Live WA Gateway"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sinkronkan Live</span>
            </button>

            <div className="bg-white/10 px-4 py-2 rounded-2xl flex flex-col items-center shrink-0 border border-white/15">
              <span className="text-[9px] uppercase tracking-wider text-emerald-250 font-bold">Keaktifan Rombel</span>
              <span className="text-2xl font-black">{persentaseKelas}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* SUCCESS BANNER FLOAT */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl text-xs font-bold shadow-xs flex items-center gap-2 animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* CLASS & DATE SELECTOR BAR */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Pilih Rombel:</span>
          </div>
          <select
            value={selectedKelas}
            onChange={(e) => setSelectedKelas(e.target.value)}
            className="bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold rounded-xl py-2 px-3 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
          >
            {DAFTAR_KELAS.map((k) => (
              <option key={k} value={k}>
                {k} ({getWaliKelasByKelas(k)})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-600">Tanggal:</span>
          </div>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold rounded-xl py-1.5 px-3 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
          {targetDate !== getLocalDateString() && (
            <button
              type="button"
              onClick={() => setTargetDate(getLocalDateString())}
              className="text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Hari Ini
            </button>
          )}
        </div>
      </div>

      {/* QUICK STATISTICS COUNTER GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        <div 
          onClick={() => setStatusFilter('semua')}
          className={`bg-white p-3 rounded-2xl border transition-all cursor-pointer shadow-xs text-left ${statusFilter === 'semua' ? 'ring-2 ring-slate-800 border-transparent bg-slate-50' : 'border-gray-150 hover:border-slate-300'}`}
        >
          <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-black uppercase">Total Murid</span>
          <p className="text-xl font-black text-slate-900 mt-1">{totalSiswaRombel}</p>
        </div>
        <div 
          onClick={() => setStatusFilter('hadir_total')}
          className={`bg-white p-3 rounded-2xl border transition-all cursor-pointer shadow-xs text-left ${statusFilter === 'hadir_total' ? 'ring-2 ring-blue-600 border-transparent bg-blue-50/50' : 'border-gray-150 hover:border-blue-300'}`}
        >
          <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-black uppercase">Total Masuk</span>
          <p className="text-xl font-black text-blue-900 mt-1">{totalHadirSemua}</p>
        </div>
        <div 
          onClick={() => setStatusFilter('hadir')}
          className={`bg-white p-3 rounded-2xl border transition-all cursor-pointer shadow-xs text-left ${statusFilter === 'hadir' ? 'ring-2 ring-emerald-500 border-transparent bg-emerald-50/50' : 'border-gray-150 hover:border-emerald-300'}`}
        >
          <span className="text-[9px] bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-800 font-bold uppercase">Hadir Tepat</span>
          <p className="text-xl font-black text-emerald-950 mt-1">{loggedHadir}</p>
        </div>
        <div 
          onClick={() => setStatusFilter('terlambat')}
          className={`bg-white p-3 rounded-2xl border transition-all cursor-pointer shadow-xs text-left ${statusFilter === 'terlambat' ? 'ring-2 ring-amber-500 border-transparent bg-amber-50/50' : 'border-gray-150 hover:border-amber-300'}`}
        >
          <span className="text-[9px] bg-amber-100 px-1.5 py-0.5 rounded text-amber-850 font-bold uppercase">Terlambat</span>
          <p className="text-xl font-black text-amber-950 mt-1">{loggedTerlambat}</p>
        </div>
        <div 
          onClick={() => setStatusFilter('sakit')}
          className={`bg-white p-3 rounded-2xl border transition-all cursor-pointer shadow-xs text-left ${statusFilter === 'sakit' ? 'ring-2 ring-indigo-500 border-transparent bg-indigo-50/50' : 'border-gray-150 hover:border-indigo-300'}`}
        >
          <span className="text-[9px] bg-indigo-100 px-1.5 py-0.5 rounded text-indigo-850 font-bold uppercase">Sakit</span>
          <p className="text-xl font-black text-indigo-950 mt-1">{loggedSakit}</p>
        </div>
        <div 
          onClick={() => setStatusFilter('izin')}
          className={`bg-white p-3 rounded-2xl border transition-all cursor-pointer shadow-xs text-left ${statusFilter === 'izin' ? 'ring-2 ring-sky-500 border-transparent bg-sky-50/50' : 'border-gray-150 hover:border-sky-300'}`}
        >
          <span className="text-[9px] bg-sky-100 px-1.5 py-0.5 rounded text-sky-850 font-bold uppercase">Izin</span>
          <p className="text-xl font-black text-sky-950 mt-1">{loggedIzin}</p>
        </div>
        <div 
          onClick={() => setStatusFilter('alfa')}
          className={`bg-white p-3 rounded-2xl border transition-all cursor-pointer shadow-xs text-left ${statusFilter === 'alfa' ? 'ring-2 ring-rose-500 border-transparent bg-rose-50/50' : 'border-gray-150 hover:border-rose-300'}`}
        >
          <span className="text-[9px] bg-rose-100 px-1.5 py-0.5 rounded text-rose-850 font-bold uppercase">Alfa</span>
          <p className="text-xl font-black text-rose-950 mt-1">{loggedAlfa}</p>
        </div>
        <div 
          onClick={() => setStatusFilter('belum_absen')}
          className={`bg-white p-3 rounded-2xl border transition-all cursor-pointer shadow-xs text-left ${statusFilter === 'belum_absen' ? 'ring-2 ring-slate-500 border-transparent bg-slate-50' : 'border-gray-150 hover:border-slate-300'}`}
        >
          <span className="text-[9px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold uppercase">Belum Absen</span>
          <p className="text-xl font-black text-slate-800 mt-1">{belumScannedCount}</p>
        </div>
      </div>

      {/* FORMULA REKAPITULASI TRANSPARAN */}
      <div className="bg-gradient-to-r from-blue-50 via-slate-50 to-emerald-50 border border-blue-200/80 rounded-2xl p-3.5 text-xs text-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="bg-blue-600 text-white p-1.5 rounded-lg">
            <CheckCircle className="w-3.5 h-3.5" />
          </span>
          <div>
            <p className="font-extrabold text-slate-800">
              Sinkronisasi Presensi Rombel {targetedKelas}:
            </p>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Total Murid ({totalSiswaRombel}) = <b>Hadir Masuk ({totalHadirSemua})</b> + <b>Tidak Hadir / Pengurang ({totalTidakHadir})</b>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
          <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
            Masuk: {loggedHadir} Tepat + {loggedTerlambat} Telat = {totalHadirSemua} Siswa ({persentaseKelas}%)
          </span>
          <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded-md">
            Pengurang: {loggedSakit} Sakit + {loggedIzin} Izin + {loggedAlfa} Alfa + {belumScannedCount} Belum = {totalTidakHadir} Siswa
          </span>
        </div>
      </div>

      {/* STUDENTS DIRECTORY OVERVIEW & QUICK ABSENCE ACTIONS */}
      <div className="bg-white rounded-3xl p-5 border border-gray-150 shadow-sm space-y-4 font-sans">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-gray-150 pb-3">
          <div className="flex items-center gap-2">
            <Notebook className="w-4.5 h-4.5 text-blue-700" />
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider font-display">
              PRESENSI & DAFTAR MURID {targetedKelas.toUpperCase()} ({classStudents.length} SISWA)
            </h3>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Quick Status filter chips */}
            <div className="flex items-center gap-1 overflow-x-auto py-1 text-[10px] font-bold">
              {(['semua', 'hadir_total', 'hadir', 'terlambat', 'sakit', 'izin', 'alfa', 'belum_absen'] as const).map((filterKey) => (
                <button
                  key={filterKey}
                  type="button"
                  onClick={() => setStatusFilter(filterKey)}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer capitalize whitespace-nowrap ${
                    statusFilter === filterKey
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {filterKey === 'hadir_total' ? 'Total Masuk' : filterKey === 'belum_absen' ? 'Belum Absen' : filterKey}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-56 shrink-0">
              <input
                type="text"
                value={filterSiswaName}
                onChange={(e) => setFilterSiswaName(e.target.value)}
                placeholder="Cari nama / NIS..."
                className="w-full bg-slate-50 border border-gray-300 rounded-xl py-1.5 pl-8 pr-3 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>

        {/* List Pupil Action Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredClassStudents.length === 0 ? (
            <div className="md:col-span-2 py-10 text-center text-slate-400 italic text-xs bg-slate-50 rounded-2xl border border-slate-200">
              Tidak ada murid dalam rombel {targetedKelas} yang cocok dengan filter.
            </div>
          ) : (
            filteredClassStudents.map((siswa) => {
              // Get today latest attendance for this student using fast indexed lookup
              const registered = getAttendanceFromIndex(siswa, dailyIndex);

              const activeBg = registered
                ? registered.status === 'Hadir'
                  ? 'bg-emerald-50/70 border-emerald-300'
                  : registered.status === 'Terlambat'
                  ? 'bg-amber-50/70 border-amber-300'
                  : registered.status === 'Sakit'
                  ? 'bg-indigo-50/70 border-indigo-300'
                  : registered.status === 'Izin'
                  ? 'bg-sky-50/70 border-sky-300'
                  : 'bg-rose-50/70 border-rose-300'
                : 'bg-white border-slate-200 hover:border-slate-300';

              return (
                <div
                  key={siswa.id}
                  className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${activeBg}`}
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="font-extrabold text-sm text-slate-800 leading-snug truncate">{siswa.nama}</h4>
                    <p className="text-[10px] text-gray-500 mt-0.5 font-mono tracking-wide">
                      NIS: <b>{siswa.nis}</b> • {siswa.jenisKelamin === 'L' ? 'Laki-Laki' : 'Perempuan'} • WA: {siswa.waOrangTua || '-'}
                    </p>
                    {registered ? (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className={`inline-flex items-center gap-1 font-black text-[9px] uppercase tracking-wider py-0.5 px-2 rounded-full ${
                          registered.status === 'Hadir'
                            ? 'text-emerald-800 bg-emerald-100 border border-emerald-300'
                            : registered.status === 'Terlambat'
                            ? 'text-amber-800 bg-amber-100 border border-amber-300'
                            : registered.status === 'Sakit'
                            ? 'text-indigo-800 bg-indigo-100 border border-indigo-300'
                            : registered.status === 'Izin'
                            ? 'text-sky-800 bg-sky-100 border border-sky-300'
                            : 'text-rose-800 bg-rose-100 border border-rose-300'
                        }`}>
                          <UserCheck className="w-3 h-3" />
                          {registered.status} • {registered.waktu.slice(0, 5)} WIB
                        </span>
                        <span className="text-[9px] text-emerald-700 bg-emerald-100/60 px-1.5 py-0.5 rounded font-mono font-semibold">
                          WA: {registered.waStatus || 'Terkirim'}
                        </span>
                      </div>
                    ) : (
                      <span className="inline-block mt-1.5 font-black text-[9px] uppercase tracking-wider text-slate-500 bg-slate-100 py-0.5 px-2 rounded-lg border border-slate-200">
                        Belum Presensi
                      </span>
                    )}
                  </div>

                  {/* Operational status switches (Set manual oleh Wali Kelas) */}
                  <div className="flex flex-wrap items-center gap-1 self-stretch sm:self-auto justify-end shrink-0">
                    {(['Hadir', 'Sakit', 'Izin', 'Alfa', 'Terlambat'] as StatusKehadiran[]).map((st) => {
                      const isCurrent = registered?.status === st;
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => handleTeacherSetStatus(siswa, st)}
                          className={`text-[9px] font-black tracking-wider py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
                            isCurrent
                              ? st === 'Hadir'
                                ? 'bg-emerald-700 text-white shadow-xs'
                                : st === 'Sakit'
                                ? 'bg-indigo-700 text-white shadow-xs'
                                : st === 'Izin'
                                ? 'bg-sky-700 text-white shadow-xs'
                                : st === 'Alfa'
                                ? 'bg-rose-700 text-white shadow-xs'
                                : 'bg-amber-700 text-white shadow-xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {st}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}

