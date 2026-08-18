import { useState } from 'react';
import {
  Notebook,
  UserCheck,
  Award,
  Users,
  Search,
  CheckCircle,
  AlertOctagon,
  Clock
} from 'lucide-react';
import { Siswa, Presensi, StatusKehadiran } from '../types';
import {
  getLocalDateString,
  getLocalTimeString,
  calculateClassAttendanceStats,
  getLatestAttendanceForStudent,
} from '../lib/attendanceUtils';

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
  const targetedKelas = currentUser.kelasSpesifik || 'Kelas 6-A';

  const [filterSiswaName, setFilterSiswaName] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Extract class specific pupils list
  const classStudents = siswaList.filter((s) => s.kelas === targetedKelas);
  const filteredClassStudents = classStudents.filter((s) =>
    s.nama.toLowerCase().includes(filterSiswaName.toLowerCase())
  );

  const todayStr = getLocalDateString();

  // Calculate precise attendance statistics per unique student
  const stats = calculateClassAttendanceStats(classStudents, presensiList, todayStr);
  const totalSiswaRombel = stats.totalSiswa;
  const loggedHadir = stats.hadir;
  const loggedTerlambat = stats.terlambat;
  const loggedSakitIzin = stats.sakitDanIzin;
  const belumScannedCount = stats.belumAbsen;
  const persentaseKelas = stats.persentaseKeaktifan;

  // Single Manual Trigger specifically for this teacher class-room
  const handleTeacherSetStatus = (siswa: Siswa, targetStatus: StatusKehadiran) => {
    const waktuSekarang = getLocalTimeString();

    // Look for previous same record to overwrite
    const existingRecord = getLatestAttendanceForStudent(siswa, presensiList, todayStr);
    const overwriteRecordId = existingRecord ? existingRecord.id : `pr-${siswa.id}-${todayStr}`;

    const newRecord: Presensi = {
      id: overwriteRecordId,
      siswaId: siswa.id,
      nis: siswa.nis,
      nik: siswa.nik,
      nama: siswa.nama,
      kelas: siswa.kelas,
      tanggal: todayStr,
      waktu: waktuSekarang,
      status: targetStatus,
      waStatus: 'Terkirim',
      pesanTerkirim: `Diproses via Server Utama WA Gateway (087844651559) ➔ Disinkronkan manual oleh Wali Kelas (${siswa.waOrangTua})`,
      operator: currentUser.namaLengkap,
    };

    onAddPresensi(newRecord);
    
    setSuccessMsg(`Konfirmasi: Berhasil mengganti status kehadiran ${siswa.nama} menjadi [${targetStatus}].`);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* HEADER BANNER */}
      <div className="bg-[#128C7E] rounded-3xl p-6 text-white shadow-md relative overflow-hidden border border-emerald-600">
        <div className="absolute top-0 right-0 w-12 h-3 flex">
          <div className="w-1/2 bg-white" />
          <div className="w-1/2 bg-red-650" />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="bg-emerald-800/40 text-emerald-100 border border-emerald-400/40 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full inline-block">
              Ruang Guru • Wali Kelas
            </span>
            <h2 className="text-2xl font-black mt-1 leading-tight tracking-tight">SDN 3 Rombel {targetedKelas}</h2>
            <p className="text-xs text-emerald-100 opacity-90 leading-normal mt-0.5">
              Guru Penanggung Jawab: <b>{currentUser.namaLengkap}</b>. Kelola presensi harian, setel status sakit/ijin, dan pantau persentase keaktifan siswa.
            </p>
          </div>

          <div className="bg-white/10 px-4 py-2.5 rounded-2xl flex flex-col items-center shrink-0 border border-white/15">
            <span className="text-[9px] uppercase tracking-wider text-emerald-250">Keaktifan Hari Ini</span>
            <span className="text-2xl font-extrabold">{persentaseKelas}%</span>
          </div>
        </div>
      </div>

      {/* SUCCESS BANNER FLOAT */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-250 text-emerald-850 rounded-2xl text-xs font-bold shadow-xs animate-in slide-in-from-top-2">
          {successMsg}
        </div>
      )}

      {/* QUICK STATISTICS COUNTER GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        <div className="bg-white p-3.5 rounded-2xl border border-gray-150 shadow-xs text-left">
          <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold uppercase">Total Murid</span>
          <p className="text-2xl font-black text-slate-800 mt-1">{totalSiswaRombel}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-gray-150 shadow-xs text-left">
          <span className="text-[9px] bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-800 font-bold uppercase">Hadir</span>
          <p className="text-2xl font-black text-slate-800 mt-1">{loggedHadir}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-gray-150 shadow-xs text-left">
          <span className="text-[9px] bg-amber-100 px-1.5 py-0.5 rounded text-amber-850 font-bold uppercase">Terlambat</span>
          <p className="text-2xl font-black text-slate-800 mt-1">{loggedTerlambat}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-gray-150 shadow-xs text-left">
          <span className="text-[9px] bg-sky-100 px-1.5 py-0.5 rounded text-sky-850 font-bold uppercase">Sakit & Izin</span>
          <p className="text-2xl font-black text-slate-800 mt-1">{loggedSakitIzin}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border border-gray-150 shadow-xs text-left">
          <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-extrabold uppercase">Belum Absen</span>
          <p className="text-2xl font-black text-slate-800 mt-1">{belumScannedCount}</p>
        </div>
      </div>

      {/* STUDENTS DIRECTORY OVERVIEW & QUICK ABSENCE ACTIONS */}
      <div className="bg-white rounded-3xl p-5 border border-gray-150 shadow-sm space-y-4 font-sans">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-gray-150 pb-3">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 font-display">
            <Notebook className="w-4.5 h-4.5 text-blue-700" />
            PRESENSI & DAFTAR MURID {targetedKelas.toUpperCase()}
          </h3>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={filterSiswaName}
              onChange={(e) => setFilterSiswaName(e.target.value)}
              placeholder="Cari murid kelas..."
              className="w-full bg-slate-50 border border-gray-300 rounded-xl py-1.5 pl-8 pr-3 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            />
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
          </div>
        </div>

        {/* List Pupil Action Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredClassStudents.length === 0 ? (
            <div className="md:col-span-2 py-8 text-center text-gray-400 italic text-xs">
              Tidak ada murid dalam daftar rombel ini yang cocok dengan pencarian.
            </div>
          ) : (
            filteredClassStudents.map((siswa) => {
              // Get today latest attendance for this student
              const registered = getLatestAttendanceForStudent(siswa, presensiList, todayStr);

              const activeBg = registered
                ? registered.status === 'Hadir'
                  ? 'bg-emerald-50 border-emerald-250'
                  : registered.status === 'Terlambat'
                  ? 'bg-amber-50 border-amber-250'
                  : 'bg-rose-50 border-rose-250'
                : 'bg-white border-gray-200';

              return (
                <div
                  key={siswa.id}
                  className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${activeBg}`}
                >
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-800 leading-none">{siswa.nama}</h4>
                    <p className="text-[10px] text-gray-400 mt-1 font-mono tracking-wide">
                      NIS {siswa.nis} • {siswa.jenisKelamin === 'L' ? 'Laki-Laki' : 'Perempuan'}
                    </p>
                    {registered ? (
                      <span className="inline-flex items-center gap-1 mt-2 font-black text-[9px] uppercase tracking-wider text-teal-800 bg-teal-100 py-0.5 px-2 rounded-full">
                        <UserCheck className="w-3 h-3 text-teal-700" />
                        Status: {registered.status} ({registered.waktu.slice(0, 5)} WIB)
                      </span>
                    ) : (
                      <span className="inline-block mt-2 font-black text-[9px] uppercase tracking-wider text-blue-700 bg-blue-50 py-1 px-2.5 rounded-xl border border-blue-100">
                        Belum Presensi Hari Ini
                      </span>
                    )}
                  </div>

                  {/* Operational status switches (Set manual oleh Wali Kelas) */}
                  <div className="flex flex-wrap items-center gap-1 self-stretch sm:self-auto justify-end">
                    {(['Hadir', 'Sakit', 'Izin', 'Alfa', 'Terlambat'] as StatusKehadiran[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleTeacherSetStatus(siswa, st)}
                        className={`text-[9px] font-black tracking-wider py-1.5 px-2 rounded-lg transition-all cursor-pointer ${
                          registered?.status === st
                            ? 'bg-slate-800 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-650'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
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
