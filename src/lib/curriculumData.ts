import {
  PenilaianAkhlak,
  CatatanAnekdot,
  ProyekP5,
  AnggotaProyek,
  CustomRaporNarrative,
  Siswa,
  getStudentKey,
  DAFTAR_DIMENSI_PROFIL,
  SkalaPenilaian
} from '../types';
import realStudents from './realStudents.json';

// Helper to get student key by index from realStudents
const getKunciByIndex = (idx: number): string => {
  const s = realStudents[idx] as any;
  if (!s) return `sample-key-${idx}`;
  return s.nisn || s.nik || s.nis || s.id;
};

export const INITIAL_PROYEK_P5: ProyekP5[] = [
  {
    id: 'p5-001',
    nama_proyek: 'Kreativitas Daur Ulang Sampah Plastik Menjadi Pot Hias Sekolah',
    tema_proyek: 'Gaya Hidup Berkelanjutan',
    tanggal_mulai: '2025-08-05',
    tanggal_selesai: '2025-09-20',
    keterangan: 'Projek kolaborasi mengolah limbah botol plastik dan kemasan menjadi pot tanaman toga dan taman kelas yang estetik.',
    tahun_ajaran: '2025/2026',
    semester: '1',
    sasaran_kelas: ['Kelas 4-A', 'Kelas 4-B', 'Kelas 5-A', 'Kelas 5-B']
  },
  {
    id: 'p5-002',
    nama_proyek: 'Eksplorasi Dodol Garut & Batik Tulis Tradisional Karamatwangi',
    tema_proyek: 'Kearifan Lokal',
    tanggal_mulai: '2025-10-01',
    tanggal_selesai: '2025-11-15',
    keterangan: 'Mengenal proses pembuatan kuliner tradisional khas Garut serta menggambar motif batik khas Jawa Barat.',
    tahun_ajaran: '2025/2026',
    semester: '1',
    sasaran_kelas: ['Kelas 3-A', 'Kelas 3-B', 'Kelas 4-A', 'Kelas 6-A']
  },
  {
    id: 'p5-003',
    nama_proyek: 'Festival Permainan Tradisional Sunda (Egrang, Congklak, & Gobak Sodor)',
    tema_proyek: 'Bhinneka Tunggal Ika',
    tanggal_mulai: '2025-08-15',
    tanggal_selesai: '2025-09-30',
    keterangan: 'Melestarikan ragam budaya permainan tradisional nusantara untuk melatih kekompakan, sportivitas, dan kerja sama.',
    tahun_ajaran: '2025/2026',
    semester: '1',
    sasaran_kelas: ['Kelas 1-A', 'Kelas 1-B', 'Kelas 2-A', 'Kelas 2-B']
  }
];

export const INITIAL_ANGGOTA_PROYEK: AnggotaProyek[] = [
  {
    id: 'ang-001',
    id_proyek: 'p5-001',
    kunci_siswa: getKunciByIndex(0),
    peran_dalam_kelompok: 'Ketua Kelompok & Desain',
    nilai_proses: 'K',
    nilai_hasil: 'K',
    catatan: 'Menunjukkan inisiatif tinggi dalam membagi tugas dan merancang bentuk pot tanaman yang sangat kreatif.'
  },
  {
    id: 'ang-002',
    id_proyek: 'p5-001',
    kunci_siswa: getKunciByIndex(1),
    peran_dalam_kelompok: 'Koordinator Pengumpulan Bahan',
    nilai_proses: 'S',
    nilai_hasil: 'S',
    catatan: 'Aktif mengumpulkan botol bekas bersama rekan-rekannya dan disiplin dalam membersihkan area kerja.'
  },
  {
    id: 'ang-003',
    id_proyek: 'p5-001',
    kunci_siswa: getKunciByIndex(2),
    peran_dalam_kelompok: 'Pewarnaan & Finishing',
    nilai_proses: 'S',
    nilai_hasil: 'K',
    catatan: 'Sangat teliti dalam mewarnai pot dengan cat ramah lingkungan, hasil karya tampak rapi dan menarik.'
  },
  {
    id: 'ang-004',
    id_proyek: 'p5-002',
    kunci_siswa: getKunciByIndex(3),
    peran_dalam_kelompok: 'Pencatat Resep & Dokumentasi',
    nilai_proses: 'S',
    nilai_hasil: 'S',
    catatan: 'Mampu mendokumentasikan tahapan pembuatan makanan tradisional dengan cermat dan rapi.'
  },
  {
    id: 'ang-005',
    id_proyek: 'p5-002',
    kunci_siswa: getKunciByIndex(4),
    peran_dalam_kelompok: 'Penyaji Hasil Produk',
    nilai_proses: 'K',
    nilai_hasil: 'K',
    catatan: 'Percaya diri dan fasih saat mempresentasikan hasil karya di depan kelas dan guru pembimbing.'
  },
  {
    id: 'ang-006',
    id_proyek: 'p5-003',
    kunci_siswa: getKunciByIndex(5),
    peran_dalam_kelompok: 'Kapten Tim Permainan',
    nilai_proses: 'S',
    nilai_hasil: 'S',
    catatan: 'Menjunjung tinggi sportivitas dan memberi semangat kepada teman-teman satu regu.'
  }
];

export const INITIAL_PENILAIAN_AKHLAK: PenilaianAkhlak[] = [
  {
    id: 'akhlak-001',
    kunci_siswa: getKunciByIndex(0),
    tanggal: '2025-08-25',
    dimensi_profil: 1,
    sub_bidang_akhlak: 'Akhlak kepada Tuhan',
    nilai_skala: 'K',
    catatan_singkat: 'Selalu tertib dan khusyuk saat memimpin doa sebelum dan sesudah belajar bersama teman sekelas.',
    tahun_ajaran: '2025/2026',
    semester: '1',
    penilai: 'Guru Kelas 2-B'
  },
  {
    id: 'akhlak-002',
    kunci_siswa: getKunciByIndex(0),
    tanggal: '2025-08-26',
    dimensi_profil: 3,
    nilai_skala: 'K',
    catatan_singkat: 'Sangat tanggap membantu teman yang kesulitan merapikan peralatan mewarnai di kelas.',
    tahun_ajaran: '2025/2026',
    semester: '1',
    penilai: 'Guru Kelas 2-B'
  },
  {
    id: 'akhlak-003',
    kunci_siswa: getKunciByIndex(1),
    tanggal: '2025-08-25',
    dimensi_profil: 1,
    sub_bidang_akhlak: 'Akhlak kepada Sesama',
    nilai_skala: 'S',
    catatan_singkat: 'Bertutur kata santun kepada guru dan saling menghormati dengan seluruh teman sebaya.',
    tahun_ajaran: '2025/2026',
    semester: '1',
    penilai: 'Guru Kelas 5-A'
  },
  {
    id: 'akhlak-004',
    kunci_siswa: getKunciByIndex(1),
    tanggal: '2025-08-27',
    dimensi_profil: 4,
    nilai_skala: 'S',
    catatan_singkat: 'Menyelesaikan lembar tugas portofolio secara mandiri tanpa menunggu instruksi berulang.',
    tahun_ajaran: '2025/2026',
    semester: '1',
    penilai: 'Guru Kelas 5-A'
  },
  {
    id: 'akhlak-005',
    kunci_siswa: getKunciByIndex(2),
    tanggal: '2025-08-25',
    dimensi_profil: 5,
    nilai_skala: 'S',
    catatan_singkat: 'Kerap mengajukan pertanyaan berbobot saat sesi tanya jawab literasi sains di kelas.',
    tahun_ajaran: '2025/2026',
    semester: '1',
    penilai: 'Guru Kelas 5-A'
  },
  {
    id: 'akhlak-006',
    kunci_siswa: getKunciByIndex(3),
    tanggal: '2025-08-28',
    dimensi_profil: 6,
    nilai_skala: 'K',
    catatan_singkat: 'Membuat kreasi gambar bercerita dengan komposisi warna dan imajinasi yang sangat unik.',
    tahun_ajaran: '2025/2026',
    semester: '1',
    penilai: 'Guru Kelas 4-B'
  },
  {
    id: 'akhlak-007',
    kunci_siswa: getKunciByIndex(4),
    tanggal: '2025-08-29',
    dimensi_profil: 1,
    sub_bidang_akhlak: 'Akhlak kepada Lingkungan',
    nilai_skala: 'K',
    catatan_singkat: 'Selalu disiplin memilah sampah organik dan anorganik di bak daur ulang sekolah.',
    tahun_ajaran: '2025/2026',
    semester: '1',
    penilai: 'Guru Kelas 6-A'
  }
];

export const INITIAL_CATATAN_ANEKDOT: CatatanAnekdot[] = [
  {
    id: 'anecdote-001',
    kunci_siswa: getKunciByIndex(0),
    tanggal: '2025-08-20',
    kategori: 'Akhlak',
    uraian_peristiwa: 'Saat jam istirahat, Aafiina secara sukarela membantu merapikan buku-buku di pojok baca perpustakaan mini kelas yang berantakan.',
    tindak_lanjut: 'Diberikan apresiasi bintang akhlak di depan kelas dan didorong untuk terus menjadi teladan budaya tertib.',
    tahun_ajaran: '2025/2026',
    semester: '1',
    pencatat: 'Wali Kelas 2-B'
  },
  {
    id: 'anecdote-002',
    kunci_siswa: getKunciByIndex(1),
    tanggal: '2025-08-22',
    kategori: 'Prestasi',
    uraian_peristiwa: 'Meraih Juara 2 Lomba Tahfidz Al-Quran Juz 30 Tingkat Gugus Sekolah Dasar Kec. Cisurupan.',
    tindak_lanjut: 'Pemberian piagam penghargaan pada upacara hari Senin dan pembinaan lanjutan untuk lomba tingkat kabupaten.',
    tahun_ajaran: '2025/2026',
    semester: '1',
    pencatat: 'Guru PAI / Wali Kelas 5-A'
  },
  {
    id: 'anecdote-003',
    kunci_siswa: getKunciByIndex(2),
    tanggal: '2025-08-24',
    kategori: 'Sikap',
    uraian_peristiwa: 'Menunjukkan inisiatif meminjamkan alat tulis kepada teman sebangkunya yang pensilnya patah saat pengerjaan asesmen sumatif.',
    tindak_lanjut: 'Guru memuji kepedulian sosialnya saat refleksi pembelajaran harian.',
    tahun_ajaran: '2025/2026',
    semester: '1',
    pencatat: 'Wali Kelas 5-A'
  },
  {
    id: 'anecdote-004',
    kunci_siswa: getKunciByIndex(3),
    tanggal: '2025-08-26',
    kategori: 'Pelanggaran',
    uraian_peristiwa: 'Terlambat masuk kelas selama 15 menit karena bermain di lapangan belakang setelah bel berbunyi.',
    tindak_lanjut: 'Bimbingan persuasif mengenai manajemen waktu, siswa menyadari kelalaiannya dan berjanji disiplin masuk tepat waktu.',
    tahun_ajaran: '2025/2026',
    semester: '1',
    pencatat: 'Guru Piket'
  }
];

export const INITIAL_CUSTOM_NARRATIVES: CustomRaporNarrative[] = [];

/**
 * Intelligent generator for Kurikulum Merdeka Rapor Narrative
 * Consolidates: Attendance + 6 Dimensions of Profil Pelajar Pancasila + Anecdotes + P5 Projects
 */
export function generateSmartRaporNarrative(
  siswa: Siswa,
  attendance: { totalHadir: number; sakit: number; izin: number; alfa: number; persentase: number },
  akhlakRecords: PenilaianAkhlak[],
  anekdotList: CatatanAnekdot[],
  p5List: { project: ProyekP5; member: AnggotaProyek }[]
): { narrative: string; parentAdvice: string } {
  const nama = siswa.nama;
  
  // 1. Kehadiran analysis
  let kehadiranDesc = '';
  if (attendance.persentase >= 95) {
    kehadiranDesc = `Ananda ${nama} menunjukkan kedisiplinan dan kehadiran luar biasa (${attendance.persentase}%) sepanjang semester ini.`;
  } else if (attendance.persentase >= 80) {
    kehadiranDesc = `Ananda ${nama} memiliki tingkat kehadiran yang sangat baik (${attendance.persentase}%) dengan motivasi belajar yang stabil.`;
  } else {
    kehadiranDesc = `Ananda ${nama} telah mengikuti kegiatan pembelajaran (${attendance.persentase}%), diharapkan kedepannya lebih konsisten hadir tepat waktu di sekolah.`;
  }

  // 2. Akhlak & Dimensi analysis
  const dimensionCounts: Record<number, { K: number; S: number; M: number; B: number }> = {};
  for (let i = 1; i <= 6; i++) {
    dimensionCounts[i] = { K: 0, S: 0, M: 0, B: 0 };
  }
  akhlakRecords.forEach(r => {
    if (dimensionCounts[r.dimensi_profil]) {
      dimensionCounts[r.dimensi_profil][r.nilai_skala]++;
    }
  });

  const strongDimensions: string[] = [];
  const growingDimensions: string[] = [];

  DAFTAR_DIMENSI_PROFIL.forEach(dim => {
    const counts = dimensionCounts[dim.id];
    const total = counts.K + counts.S + counts.M + counts.B;
    if (total > 0) {
      if (counts.K > 0 || counts.S >= counts.M) {
        strongDimensions.push(dim.nama);
      } else {
        growingDimensions.push(dim.nama);
      }
    }
  });

  let akhlakDesc = '';
  if (strongDimensions.length > 0) {
    const primary = strongDimensions[0];
    akhlakDesc = ` Dalam perkembangan karakter Profil Pelajar Pancasila, ananda sangat berkembang pada dimensi ${primary}. Selalu menunjukkan budi pekerti luhur, kepedulian sosial, serta rasa tanggung jawab dalam aktivitas harian.`;
  } else {
    akhlakDesc = ` Dalam perkembangan karakter Profil Pelajar Pancasila, ananda telah menunjukkan kebiasaan positif dalam bertutur kata santun dan menghormati sesama warga sekolah.`;
  }

  // 3. Anecdote highlights
  const prestasiAnekdot = anekdotList.filter(a => a.kategori === 'Prestasi' || a.kategori === 'Akhlak');
  let anekdotDesc = '';
  if (prestasiAnekdot.length > 0) {
    const topNote = prestasiAnekdot[0];
    anekdotDesc = ` Catatan observasi mencatat ananda memiliki kebiasaan positif: "${topNote.uraian_peristiwa}".`;
  }

  // 4. P5 Highlight
  let p5Desc = '';
  if (p5List.length > 0) {
    const topP5 = p5List[0];
    const role = topP5.member.peran_dalam_kelompok;
    p5Desc = ` Pada Projek Penguatan Profil Pelajar Pancasila (${topP5.project.nama_proyek}), ananda berkontribusi aktif sebagai ${role} dan menunjukkan hasil karya yang memuaskan.`;
  }

  const narrative = `${kehadiranDesc}${akhlakDesc}${anekdotDesc}${p5Desc} Diharapkan ananda terus mempertahankan semangat belajar dan keteladanannya di masa mendatang.`.trim();

  // 5. Parent advice
  let parentAdvice = '';
  if (attendance.persentase >= 90 && (strongDimensions.length >= 2 || p5List.length > 0)) {
    parentAdvice = `Mohon orang tua terus memberikan apresiasi dan motivasi atas pencapaian ananda ${nama}, serta mendampingi pembiasaan membaca/literasi dan ibadah harian di rumah.`;
  } else if (attendance.sakit > 3 || attendance.izin > 3) {
    parentAdvice = `Disarankan orang tua terus menjaga pola istirahat dan kesehatan ananda di rumah serta menjalin komunikasi rutin dengan wali kelas terkait pendampingan belajar.`;
  } else {
    parentAdvice = `Dukungan orang tua dalam membimbing kedisiplinan belajar di rumah dan memperkuat akhlak terpuji akan sangat mendukung optimalisasi potensi ananda ${nama}.`;
  }

  return { narrative, parentAdvice };
}
