import { useState, useMemo } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit,
  Save,
  X,
  Sparkles,
  Calendar,
  Layers,
  Award,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Download,
  Users,
  ChevronRight,
  Info
} from 'lucide-react';
import {
  Siswa,
  PenilaianAkhlak,
  DAFTAR_KELAS,
  DAFTAR_DIMENSI_PROFIL,
  SUB_BIDANG_AKHLAK_DIMENSI_1,
  SKALA_PENILAIAN_MAP,
  SkalaPenilaian,
  getStudentKey,
  isRecordMatchStudent
} from '../types';
import { getLocalDateString, isSameClass } from '../lib/attendanceUtils';
import { getWaliKelasByKelas } from '../lib/demoData';

interface AkhlakPanelProps {
  siswaList: Siswa[];
  akhlakList: PenilaianAkhlak[];
  onAddAkhlak: (item: Omit<PenilaianAkhlak, 'id'>) => void;
  onUpdateAkhlak: (id: string, item: Partial<PenilaianAkhlak>) => void;
  onDeleteAkhlak: (id: string) => void;
}

export default function AkhlakPanel({
  siswaList,
  akhlakList,
  onAddAkhlak,
  onUpdateAkhlak,
  onDeleteAkhlak
}: AkhlakPanelProps) {
  const [selectedKelas, setSelectedKelas] = useState<string>('Semua Kelas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDimensi, setSelectedDimensi] = useState<number | 'all'>('all');
  const [selectedSkala, setSelectedSkala] = useState<string>('all');
  const [selectedSemester, setSelectedSemester] = useState<string>('1');
  const [selectedTahun, setSelectedTahun] = useState<string>('2025/2026');

  // Modal form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form inputs
  const [formSiswaKey, setFormSiswaKey] = useState<string>('');
  const [formTanggal, setFormTanggal] = useState<string>(getLocalDateString());
  const [formDimensi, setFormDimensi] = useState<number>(1);
  const [formSubBidang, setFormSubBidang] = useState<string>('Akhlak kepada Tuhan');
  const [formSkala, setFormSkala] = useState<SkalaPenilaian>('S');
  const [formCatatan, setFormCatatan] = useState<string>('');
  const [formTahun, setFormTahun] = useState<string>('2025/2026');
  const [formSemester, setFormSemester] = useState<'1' | '2' | 'Ganjil' | 'Genap'>('1');
  const [formPenilai, setFormPenilai] = useState<string>('');

  // Class students for dropdown
  const availableStudents = useMemo(() => {
    if (selectedKelas === 'Semua Kelas') return siswaList;
    return siswaList.filter(s => isSameClass(s.kelas, selectedKelas));
  }, [siswaList, selectedKelas]);

  // Selected student in form
  const selectedFormStudent = useMemo(() => {
    if (!formSiswaKey) return null;
    return siswaList.find(s => isRecordMatchStudent(formSiswaKey, s));
  }, [siswaList, formSiswaKey]);

  // Filtered assessment list
  const filteredList = useMemo(() => {
    return akhlakList.filter(item => {
      // Find matching student
      const student = siswaList.find(s => isRecordMatchStudent(item.kunci_siswa, s));
      
      // Class filter
      if (selectedKelas !== 'Semua Kelas') {
        if (!student || !isSameClass(student.kelas, selectedKelas)) return false;
      }

      // Dimensi filter
      if (selectedDimensi !== 'all' && item.dimensi_profil !== selectedDimensi) {
        return false;
      }

      // Skala filter
      if (selectedSkala !== 'all' && item.nilai_skala !== selectedSkala) {
        return false;
      }

      // Search query (student name, NISN, NIK, or notes)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const studentName = student ? student.nama.toLowerCase() : '';
        const matchKey = item.kunci_siswa.toLowerCase().includes(q);
        const matchName = studentName.includes(q);
        const matchNotes = item.catatan_singkat.toLowerCase().includes(q);
        if (!matchKey && !matchName && !matchNotes) return false;
      }

      return true;
    });
  }, [akhlakList, siswaList, selectedKelas, selectedDimensi, selectedSkala, searchQuery]);

  // Open modal for add
  const handleOpenAdd = (defaultStudent?: Siswa) => {
    setEditingId(null);
    if (defaultStudent) {
      setFormSiswaKey(getStudentKey(defaultStudent));
      setFormPenilai(`Wali ${defaultStudent.kelas}`);
    } else {
      setFormSiswaKey(availableStudents.length > 0 ? getStudentKey(availableStudents[0]) : '');
      setFormPenilai(selectedKelas !== 'Semua Kelas' ? `Wali ${selectedKelas}` : 'Guru Kelas');
    }
    setFormTanggal(getLocalDateString());
    setFormDimensi(1);
    setFormSubBidang('Akhlak kepada Tuhan');
    setFormSkala('S');
    setFormCatatan('');
    setFormTahun(selectedTahun);
    setFormSemester(selectedSemester as any);
    setIsModalOpen(true);
  };

  // Open modal for edit
  const handleOpenEdit = (item: PenilaianAkhlak) => {
    setEditingId(item.id);
    setFormSiswaKey(item.kunci_siswa);
    setFormTanggal(item.tanggal);
    setFormDimensi(item.dimensi_profil);
    setFormSubBidang(item.sub_bidang_akhlak || 'Akhlak kepada Tuhan');
    setFormSkala(item.nilai_skala);
    setFormCatatan(item.catatan_singkat);
    setFormTahun(item.tahun_ajaran);
    setFormSemester(item.semester);
    setFormPenilai(item.penilai || '');
    setIsModalOpen(true);
  };

  // Submit form
  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSiswaKey) {
      alert('Pilih siswa yang akan dinilai!');
      return;
    }
    if (!formCatatan.trim()) {
      alert('Tuliskan catatan singkat pengamatan akhlak!');
      return;
    }

    if (editingId) {
      onUpdateAkhlak(editingId, {
        kunci_siswa: formSiswaKey,
        tanggal: formTanggal,
        dimensi_profil: formDimensi,
        sub_bidang_akhlak: formDimensi === 1 ? formSubBidang : undefined,
        nilai_skala: formSkala,
        catatan_singkat: formCatatan.trim(),
        tahun_ajaran: formTahun,
        semester: formSemester,
        penilai: formPenilai.trim()
      });
    } else {
      onAddAkhlak({
        kunci_siswa: formSiswaKey,
        tanggal: formTanggal,
        dimensi_profil: formDimensi,
        sub_bidang_akhlak: formDimensi === 1 ? formSubBidang : undefined,
        nilai_skala: formSkala,
        catatan_singkat: formCatatan.trim(),
        tahun_ajaran: formTahun,
        semester: formSemester,
        penilai: formPenilai.trim() || 'Guru Pengamat'
      });
    }
    setIsModalOpen(false);
  };

  // Download CSV
  const handleExportCSV = () => {
    const headers = [
      'No',
      'Kunci Siswa (NISN/NIK)',
      'Nama Siswa',
      'Kelas',
      'Tanggal',
      'Dimensi Profil',
      'Sub-Bidang Akhlak',
      'Skala Nilai',
      'Keterangan Skala',
      'Catatan Pengamatan',
      'Tahun Ajaran',
      'Semester',
      'Penilai'
    ];

    const rows = filteredList.map((item, idx) => {
      const student = siswaList.find(s => isRecordMatchStudent(item.kunci_siswa, s));
      const dim = DAFTAR_DIMENSI_PROFIL.find(d => d.id === item.dimensi_profil);
      const skalaInfo = SKALA_PENILAIAN_MAP[item.nilai_skala];

      return [
        idx + 1,
        `'${item.kunci_siswa}`,
        student ? student.nama : 'Tidak Ditemukan',
        student ? student.kelas : '-',
        item.tanggal,
        dim ? dim.nama : `Dimensi ${item.dimensi_profil}`,
        item.sub_bidang_akhlak || '-',
        item.nilai_skala,
        skalaInfo ? skalaInfo.label : '-',
        item.catatan_singkat,
        item.tahun_ajaran,
        item.semester,
        item.penilai || '-'
      ];
    });

    const csvContent = "\uFEFF" + [headers.map(h => `"${h}"`).join(','), ...rows.map(r => r.map(v => `"${(v + '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `REKAP_PENILAIAN_AKHLAK_${selectedKelas.replace(/\s+/g, '_')}_${getLocalDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 text-left">
      
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 rounded-3xl p-5 sm:p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-white/20 backdrop-blur-xs rounded-2xl shadow-inner text-white">
            <BookOpen className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider bg-amber-900/40 border border-amber-300/30 px-2 py-0.5 rounded-full">
                Kurikulum Merdeka
              </span>
              <span className="text-xs font-semibold text-amber-100">
                SDN 3 Karamatwangi
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight mt-0.5">
              Penilaian Akhlak & Profil Pelajar Pancasila
            </h2>
            <p className="text-xs text-amber-100/90 mt-1 max-w-2xl">
              Pencatatan perkembangan 6 Dimensi Karakter Pancasila dan Sub-Bidang Akhlak Mulia secara berkala sebagai instrumen autentik pembentukan budi pekerti siswa.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto shrink-0 justify-end">
          <button
            type="button"
            onClick={handleExportCSV}
            className="bg-white/10 hover:bg-white/20 text-white font-bold text-xs py-2.5 px-4 rounded-xl border border-white/20 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>Ekspor .CSV</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenAdd()}
            className="bg-white hover:bg-amber-50 text-amber-950 font-black text-xs py-2.5 px-4 rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-amber-600" />
            <span>Tambah Penilaian Akhlak</span>
          </button>
        </div>
      </div>

      {/* 6 DIMENSI QUICK SUMMARY CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {DAFTAR_DIMENSI_PROFIL.map(dim => {
          const count = akhlakList.filter(a => a.dimensi_profil === dim.id).length;
          const isSelected = selectedDimensi === dim.id;

          return (
            <button
              key={dim.id}
              onClick={() => setSelectedDimensi(isSelected ? 'all' : dim.id)}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-amber-600 text-white border-amber-700 shadow-md ring-2 ring-amber-400'
                  : 'bg-white text-slate-800 border-slate-200 hover:border-amber-300 hover:shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xl">{dim.icon}</span>
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                  isSelected ? 'bg-amber-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  D-{dim.id}
                </span>
              </div>
              <div>
                <h4 className={`text-[11px] font-extrabold line-clamp-2 leading-tight ${isSelected ? 'text-white' : 'text-slate-850'}`}>
                  {dim.nama}
                </h4>
                <p className={`text-[10px] font-bold mt-1 ${isSelected ? 'text-amber-100' : 'text-slate-500'}`}>
                  {count} Catatan
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* FILTER CONTROLS TOOLBAR */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Class Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500">Kelas:</span>
            <select
              value={selectedKelas}
              onChange={(e) => setSelectedKelas(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs font-bold py-1.5 px-3 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
            >
              <option value="Semua Kelas">Semua Kelas ({siswaList.length})</option>
              {DAFTAR_KELAS.map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>

          {/* Dimensi Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500">Dimensi:</span>
            <select
              value={selectedDimensi}
              onChange={(e) => setSelectedDimensi(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="bg-slate-50 border border-slate-200 text-xs font-bold py-1.5 px-3 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer max-w-[200px] truncate"
            >
              <option value="all">Semua Dimensi (6)</option>
              {DAFTAR_DIMENSI_PROFIL.map(d => (
                <option key={d.id} value={d.id}>D-{d.id}: {d.ringkasan}</option>
              ))}
            </select>
          </div>

          {/* Skala Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500">Skala:</span>
            <select
              value={selectedSkala}
              onChange={(e) => setSelectedSkala(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs font-bold py-1.5 px-3 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
            >
              <option value="all">Semua Skala</option>
              <option value="B">B - Belum</option>
              <option value="M">M - Mulai</option>
              <option value="S">S - Sesuai</option>
              <option value="K">K - Berkembang</option>
            </select>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari siswa, NISN, NIK, atau catatan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>

        <div className="text-xs text-slate-500 font-semibold shrink-0">
          Total: <b className="text-slate-800">{filteredList.length}</b> Penilaian
        </div>
      </div>

      {/* ASSESSMENT TABLE */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3 w-10 text-center">No</th>
                <th className="py-3 px-3 w-32">Kunci Siswa</th>
                <th className="py-3 px-4">Nama Siswa & Kelas</th>
                <th className="py-3 px-3 w-28">Tanggal</th>
                <th className="py-3 px-4">Dimensi & Sub-Bidang</th>
                <th className="py-3 px-3 w-28 text-center">Skala Nilai</th>
                <th className="py-3 px-4 min-w-[200px]">Catatan Pengamatan</th>
                <th className="py-3 px-3 w-24">Penilai</th>
                <th className="py-3 px-3 w-20 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-medium">
                    <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    Belum ada data penilaian akhlak yang sesuai kriteria filter.
                  </td>
                </tr>
              ) : (
                filteredList.map((item, idx) => {
                  const student = siswaList.find(s => isRecordMatchStudent(item.kunci_siswa, s));
                  const dim = DAFTAR_DIMENSI_PROFIL.find(d => d.id === item.dimensi_profil);
                  const skalaInfo = SKALA_PENILAIAN_MAP[item.nilai_skala];

                  return (
                    <tr key={item.id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="py-3 px-3 text-center font-bold text-slate-500">{idx + 1}</td>
                      <td className="py-3 px-3">
                        <span className="font-mono text-[11px] font-black bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200">
                          {item.kunci_siswa}
                        </span>
                        <p className="text-[9px] text-slate-400 mt-0.5">
                          {student?.nisn ? 'Kunci: NISN' : student?.nik ? 'Kunci: NIK' : 'Kunci: NIS/ID'}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-850">
                          {student ? student.nama : <span className="text-rose-500">Siswa Tidak Ditemukan</span>}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-500 font-semibold mt-0.5">
                          <span className="bg-blue-50 text-blue-800 px-1.5 py-0.2 rounded font-black">
                            {student?.kelas || '-'}
                          </span>
                          <span>• {student?.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-600 whitespace-nowrap">
                        {item.tanggal}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{dim?.icon}</span>
                          <span className="font-bold text-slate-800 text-[11px]">
                            {dim?.nama}
                          </span>
                        </div>
                        {item.sub_bidang_akhlak && (
                          <span className="inline-block bg-amber-100 text-amber-900 text-[10px] font-black px-1.5 py-0.2 rounded mt-1">
                            {item.sub_bidang_akhlak}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black shadow-2xs ${skalaInfo?.badgeColor}`}>
                          <span>{item.nilai_skala}</span>
                          <span className="opacity-90">• {skalaInfo?.label}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-700 text-[11px] leading-relaxed">
                        {item.catatan_singkat}
                      </td>
                      <td className="py-3 px-3 text-[11px] text-slate-500 font-medium">
                        {item.penilai || '-'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-100 rounded-lg transition cursor-pointer"
                            title="Edit Penilaian"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Hapus catatan penilaian akhlak ini?')) {
                                onDeleteAkhlak(item.id);
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Hapus Penilaian"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL INPUT / EDIT PENILAIAN AKHLAK */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-600 to-orange-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 rounded-xl">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">
                    {editingId ? 'Edit Penilaian Akhlak & Karakter' : 'Input Penilaian Akhlak Siswa'}
                  </h3>
                  <p className="text-xs text-amber-100">
                    Sesuai Indikator 6 Dimensi Profil Pelajar Pancasila Kurikulum Merdeka
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitForm} className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs">
              
              {/* Siswa Selector */}
              <div>
                <label className="block text-slate-700 font-black mb-1">
                  Pilih Siswa yang Dinilai <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formSiswaKey}
                  onChange={(e) => setFormSiswaKey(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 font-bold p-2.5 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  required
                >
                  <option value="">-- Pilih Siswa --</option>
                  {availableStudents.map(s => {
                    const key = getStudentKey(s);
                    return (
                      <option key={s.id} value={key}>
                        {s.nama} ({s.kelas}) — Kunci: {key}
                      </option>
                    );
                  })}
                </select>

                {selectedFormStudent && (
                  <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-[11px] text-amber-900 font-semibold">
                    <span>Terpilih: <b>{selectedFormStudent.nama}</b> ({selectedFormStudent.kelas})</span>
                    <span className="font-mono bg-white px-2 py-0.5 rounded border border-amber-300">
                      Kunci: {formSiswaKey}
                    </span>
                  </div>
                )}
              </div>

              {/* Tanggal, Tahun Ajaran, Semester */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Tanggal Penilaian</label>
                  <input
                    type="date"
                    value={formTanggal}
                    onChange={(e) => setFormTanggal(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 font-bold p-2 rounded-xl text-slate-800"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Tahun Ajaran</label>
                  <input
                    type="text"
                    value={formTahun}
                    onChange={(e) => setFormTahun(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 font-bold p-2 rounded-xl text-slate-800"
                    placeholder="2025/2026"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Semester</label>
                  <select
                    value={formSemester}
                    onChange={(e) => setFormSemester(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 font-bold p-2 rounded-xl text-slate-800 cursor-pointer"
                  >
                    <option value="1">1 (Ganjil)</option>
                    <option value="2">2 (Genap)</option>
                  </select>
                </div>
              </div>

              {/* Dimensi Profil Pancasila */}
              <div>
                <label className="block text-slate-700 font-black mb-1">
                  6 Dimensi Profil Pelajar Pancasila <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formDimensi}
                  onChange={(e) => setFormDimensi(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 font-bold p-2.5 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                >
                  {DAFTAR_DIMENSI_PROFIL.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.icon} Dimensi {d.id}: {d.nama}
                    </option>
                  ))}
                </select>
              </div>

              {/* Khusus Dimensi 1: Sub-Bidang Akhlak */}
              {formDimensi === 1 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
                  <label className="block text-amber-950 font-black">
                    Sub-Bidang Akhlak (Khusus Dimensi 1)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {SUB_BIDANG_AKHLAK_DIMENSI_1.map(sub => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setFormSubBidang(sub)}
                        className={`p-2 rounded-xl text-left text-[11px] font-bold border transition cursor-pointer ${
                          formSubBidang === sub
                            ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                            : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Skala Penilaian B/M/S/K */}
              <div>
                <label className="block text-slate-700 font-black mb-1.5">
                  Skala Capaian Karakter <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['B', 'M', 'S', 'K'] as SkalaPenilaian[]).map(code => {
                    const info = SKALA_PENILAIAN_MAP[code];
                    const isSelected = formSkala === code;

                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setFormSkala(code)}
                        className={`p-2.5 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1 ${
                          isSelected
                            ? `${info.badgeColor} border-transparent shadow-md ring-2 ring-amber-400`
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800'
                        }`}
                      >
                        <span className="text-sm font-black">{code}</span>
                        <span className="text-[10px] font-bold">{info.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-500 font-medium mt-1.5 italic">
                  💡 {SKALA_PENILAIAN_MAP[formSkala].description}
                </p>
              </div>

              {/* Catatan Singkat Pengamatan */}
              <div>
                <label className="block text-slate-700 font-black mb-1">
                  Catatan Singkat Pengamatan Akhlak <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={formCatatan}
                  onChange={(e) => setFormCatatan(e.target.value)}
                  placeholder="Contoh: Selalu tertib dan khusyuk saat memimpin doa, serta saling menghormati dengan seluruh teman..."
                  className="w-full bg-slate-50 border border-slate-200 font-medium p-2.5 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  required
                />
              </div>

              {/* Guru / Penilai */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Guru Penilai / Pengamat</label>
                <input
                  type="text"
                  value={formPenilai}
                  onChange={(e) => setFormPenilai(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 font-bold p-2 rounded-xl text-slate-800"
                  placeholder="Nama Wali Kelas / Guru PAI"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-150 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-700 text-white font-black py-2 px-5 rounded-xl shadow transition cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingId ? 'Simpan Perubahan' : 'Simpan Penilaian'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
