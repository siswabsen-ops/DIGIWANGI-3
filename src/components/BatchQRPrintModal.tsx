import React, { useState, useEffect } from 'react';
import { Printer, X, Filter, Search, Sparkles, Check, Download, Layers, ShieldCheck, HelpCircle, FileArchive, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';
import { Siswa, DAFTAR_KELAS, getStudentQRIdentifier } from '../types';
import { downloadClassQRZip, downloadSingleStudentQR } from '../lib/qrCodeExport';

interface BatchQRPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  siswaList: Siswa[];
  defaultKelas?: string;
}

export default function BatchQRPrintModal({
  isOpen,
  onClose,
  siswaList,
  defaultKelas = 'Semua Kelas',
}: BatchQRPrintModalProps) {
  const [selectedKelas, setSelectedKelas] = useState<string>(defaultKelas);
  const [dapodikFilter, setDapodikFilter] = useState<'semua' | 'sudah' | 'belum'>('semua');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  
  // ZIP Download progress state
  const [isDownloadingZip, setIsDownloadingZip] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [downloadSuccessMsg, setDownloadSuccessMsg] = useState<string>('');

  useEffect(() => {
    setSelectedKelas(defaultKelas);
  }, [defaultKelas, isOpen]);

  // Filter students by selected class, dapodik status, and search query
  const filteredSiswa = siswaList.filter((s) => {
    const matchesKelas =
      selectedKelas === 'Semua Kelas' || s.kelas.toLowerCase() === selectedKelas.toLowerCase();
    
    let matchesDapodik = true;
    if (dapodikFilter === 'sudah') {
      matchesDapodik = s.statusDapodik !== 'Belum Dapodik';
    } else if (dapodikFilter === 'belum') {
      matchesDapodik = s.statusDapodik === 'Belum Dapodik';
    }

    const q = searchQuery.toLowerCase();
    const matchesSearch =
      s.nama.toLowerCase().includes(q) ||
      s.nis.toLowerCase().includes(q) ||
      (s.nik && s.nik.toLowerCase().includes(q)) ||
      (s.nisn && s.nisn.toLowerCase().includes(q));
    return matchesKelas && matchesDapodik && matchesSearch;
  });

  // Generate QR Code base64 Data URLs for filtered students using NIK or NIS
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function generateQRCodes() {
      setIsGenerating(true);
      const newMap: Record<string, string> = {};

      for (const student of filteredSiswa) {
        try {
          const qrPayload = getStudentQRIdentifier(student);
          const url = await QRCode.toDataURL(qrPayload, {
            width: 280,
            margin: 1.5,
            errorCorrectionLevel: 'H',
            color: {
              dark: '#0f172a',
              light: '#ffffff',
            },
          });
          newMap[student.id || student.nis] = url;
        } catch (err) {
          console.error(`Gagal membuat QR code untuk ${student.nama}`, err);
        }
      }

      if (isMounted) {
        setQrMap(newMap);
        setIsGenerating(false);
      }
    }

    generateQRCodes();

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedKelas, dapodikFilter, searchQuery, siswaList]);

  if (!isOpen) return null;

  // Handle downloading all QR Codes in the active class/filter as a ZIP file
  const handleDownloadZip = async () => {
    if (filteredSiswa.length === 0 || isDownloadingZip) return;

    try {
      setIsDownloadingZip(true);
      setDownloadSuccessMsg('');
      await downloadClassQRZip(
        selectedKelas,
        filteredSiswa,
        (current, total, name) => {
          setDownloadProgress({ current, total, name });
        }
      );
      setDownloadSuccessMsg(`Berhasil mengunduh paket ZIP QR Code ${selectedKelas} (${filteredSiswa.length} siswa)!`);
      setTimeout(() => setDownloadSuccessMsg(''), 4000);
    } catch (err: any) {
      console.error('Gagal mengunduh ZIP QR:', err);
      alert(`Gagal mengunduh ZIP: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setIsDownloadingZip(false);
      setDownloadProgress(null);
    }
  };

  const handleDownloadSingleCard = async (siswa: Siswa) => {
    try {
      await downloadSingleStudentQR(siswa);
    } catch (err) {
      console.error('Gagal mengunduh kartu siswa:', err);
    }
  };

  // Handle printing all filtered student QR cards via clean print iframe
  const handlePrintAll = () => {
    if (filteredSiswa.length === 0) return;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!iframeDoc) return;

    const cardsHtml = filteredSiswa
      .map((siswa) => {
        const qrUrl = qrMap[siswa.id || siswa.nis] || '';
        const isBelumDapodik = siswa.statusDapodik === 'Belum Dapodik';
        const qrCodeIdentifier = getStudentQRIdentifier(siswa);

        return `
        <div class="card-item">
          <div class="header-banner">
            KARTU SISWA ELEKTRONIK<br/>
            <span>SDN 3 KARAMATWANGI</span>
          </div>
          <div class="qr-container">
            ${
              qrUrl
                ? `<img src="${qrUrl}" class="qr-img" alt="QR ${qrCodeIdentifier}" />`
                : `<div class="qr-fallback">${qrCodeIdentifier}</div>`
            }
          </div>
          <div class="student-name">${siswa.nama}</div>
          <div class="meta-info">
            ${isBelumDapodik ? `<span class="badge-nik">NIK: ${siswa.nik || qrCodeIdentifier} (Belum Dapodik)</span>` : `<span>NIS: ${siswa.nis}</span>`}
            • <b>${siswa.kelas}</b>
          </div>
          ${siswa.nik && !isBelumDapodik ? `<div class="sub-info">NIK: ${siswa.nik}</div>` : ''}
          <div class="sub-info">📞 WA Wali: ${siswa.waOrangTua || '-'}</div>
          <div class="footer-tag">DIGIWANGI 3 Presensi • Cisurupan, Garut</div>
        </div>
      `;
      })
      .join('');

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cetak Kartu QR Siswa - ${selectedKelas}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&family=JetBrains+Mono:wght@700&display=swap');
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            * {
              box-sizing: border-box;
            }
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
              margin: 0;
              padding: 0;
              background-color: white;
              color: #0f172a;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .print-page-title {
              text-align: center;
              margin-bottom: 16px;
              padding-bottom: 10px;
              border-bottom: 2.5px solid #1d4ed8;
            }
            .print-page-title h1 {
              margin: 0;
              font-size: 16px;
              font-weight: 900;
              color: #1d4ed8;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .print-page-title p {
              margin: 4px 0 0 0;
              font-size: 10px;
              color: #64748b;
            }
            .cards-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 12mm;
              justify-content: center;
            }
            .card-item {
              border: 2.5px solid #1d4ed8;
              border-radius: 16px;
              padding: 14px;
              text-align: center;
              background-color: white;
              page-break-inside: avoid;
              display: flex;
              flex-direction: column;
              align-items: center;
              box-shadow: none;
            }
            .header-banner {
              background-color: #1d4ed8;
              color: white;
              padding: 8px 6px;
              font-weight: 900;
              font-size: 11px;
              border-radius: 10px;
              width: 100%;
              text-transform: uppercase;
              letter-spacing: 0.3px;
              line-height: 1.3;
              margin-bottom: 8px;
            }
            .header-banner span {
              font-size: 12px;
              letter-spacing: 0.5px;
            }
            .qr-container {
              margin: 6px 0;
              display: flex;
              justify-content: center;
              align-items: center;
            }
            .qr-img {
              width: 140px;
              height: 140px;
              object-fit: contain;
              image-rendering: -webkit-optimize-contrast;
              image-rendering: crisp-edges;
            }
            .qr-fallback {
              width: 140px;
              height: 140px;
              display: flex;
              align-items: center;
              justify-content: center;
              border: 1px dashed #94a3b8;
              font-family: 'JetBrains Mono', monospace;
              font-size: 11px;
              color: #64748b;
            }
            .student-name {
              font-weight: 900;
              font-size: 13px;
              color: #0f172a;
              text-transform: uppercase;
              margin-top: 4px;
              line-height: 1.2;
            }
            .meta-info {
              font-size: 11px;
              color: #334155;
              margin-top: 3px;
              font-family: 'Inter', sans-serif;
            }
            .badge-nik {
              font-weight: 800;
              color: #b91c1c;
              font-family: 'JetBrains Mono', monospace;
            }
            .sub-info {
              font-size: 9.5px;
              color: #64748b;
              margin-top: 2px;
            }
            .footer-tag {
              margin-top: 8px;
              padding-top: 6px;
              border-top: 1px dashed #cbd5e1;
              font-size: 8.5px;
              color: #94a3b8;
              font-weight: 600;
              width: 100%;
            }
          </style>
        </head>
        <body>
          <div class="print-page-title">
            <h1>KARTU QR CODE ABSENSI SISWA — ${selectedKelas.toUpperCase()}</h1>
            <p>SDN 3 Karamatwangi • Kec. Cisurupan, Kab. Garut • Jumlah: ${filteredSiswa.length} Siswa</p>
          </div>
          <div class="cards-grid">
            ${cardsHtml}
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.focus();
                window.print();
                setTimeout(function() {
                  document.body.removeChild(iframe);
                }, 1000);
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    iframeDoc.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-indigo-700 via-blue-700 to-sky-700 p-4 sm:p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur border border-white/20 flex items-center justify-center font-bold">
              <Printer className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg tracking-wide uppercase font-display flex items-center gap-2">
                🖨️ CETAK KARTU & QR CODE MASSAL SISWA
              </h3>
              <p className="text-xs text-blue-100/90 font-medium">
                Mendukung QR Code dari NISN/NIS resmi maupun NIK (untuk siswa yang belum masuk Dapodik).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 shrink-0 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Class Filter dropdown */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1 shrink-0">
                <Filter className="w-3.5 h-3.5 text-indigo-600" />
                <span>Kelas:</span>
              </label>
              <select
                value={selectedKelas}
                onChange={(e) => setSelectedKelas(e.target.value)}
                className="bg-white border-2 border-indigo-200 focus:border-indigo-600 text-slate-800 text-xs font-extrabold rounded-xl px-2.5 py-1.5 shadow-sm outline-none cursor-pointer"
              >
                <option value="Semua Kelas">🏫 Semua Kelas ({siswaList.length})</option>
                {DAFTAR_KELAS.map((k) => {
                  const count = siswaList.filter((s) => s.kelas === k).length;
                  return (
                    <option key={k} value={k}>
                      {k} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Status Dapodik Filter */}
            <div className="flex items-center gap-1.5">
              <select
                value={dapodikFilter}
                onChange={(e) => setDapodikFilter(e.target.value as any)}
                className="bg-white border-2 border-slate-200 focus:border-indigo-600 text-slate-700 text-xs font-bold rounded-xl px-2.5 py-1.5 shadow-sm outline-none cursor-pointer"
              >
                <option value="semua">Semua Status Dapodik</option>
                <option value="sudah">✅ Sudah Dapodik</option>
                <option value="belum">⚠️ Belum Masuk Dapodik (NIK)</option>
              </select>
            </div>
          </div>

          {/* Search box & Print/Download button */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-44">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama/NIS/NIK..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 pl-8 pr-3 py-1.5 text-xs rounded-xl outline-none focus:border-indigo-500 font-medium"
              />
            </div>

            <button
              type="button"
              id="btn-modal-download-zip"
              onClick={handleDownloadZip}
              disabled={filteredSiswa.length === 0 || isDownloadingZip}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs px-3.5 py-2 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              title={`Unduh semua QR Code (${selectedKelas}) sebagai file arsip ZIP gambar PNG`}
            >
              {isDownloadingZip ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <FileArchive className="w-4 h-4 text-emerald-200" />
              )}
              <span>
                {isDownloadingZip
                  ? `Mengemas (${downloadProgress?.current || 0}/${filteredSiswa.length})...`
                  : `📥 Unduh ZIP (${filteredSiswa.length})`}
              </span>
            </button>

            <button
              type="button"
              id="btn-modal-print-all"
              onClick={handlePrintAll}
              disabled={filteredSiswa.length === 0 || isGenerating || isDownloadingZip}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-xs px-3.5 py-2 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <Printer className="w-4 h-4 text-amber-300" />
              <span>
                {isGenerating
                  ? 'Menyiapkan...'
                  : `Cetak (${filteredSiswa.length})`}
              </span>
            </button>
          </div>
        </div>

        {/* Progress / Status Notification */}
        {downloadSuccessMsg && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between shrink-0 animate-fadeIn">
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-200" />
              {downloadSuccessMsg}
            </span>
            <button
              type="button"
              onClick={() => setDownloadSuccessMsg('')}
              className="text-white hover:text-emerald-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Progress Overlay when Zipping */}
        {isDownloadingZip && downloadProgress && (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 shrink-0">
            <div className="flex items-center justify-between text-xs font-bold text-blue-900 mb-1">
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                Menggenerasi Kartu QR: {downloadProgress.name}
              </span>
              <span>
                {downloadProgress.current} / {downloadProgress.total} (
                {Math.round((downloadProgress.current / downloadProgress.total) * 100)}%)
              </span>
            </div>
            <div className="w-full bg-blue-200 h-2 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-150 rounded-full"
                style={{
                  width: `${(downloadProgress.current / downloadProgress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Modal Content - Live Cards Grid Preview */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-100/60">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-xs font-bold text-slate-600">
              Menampilkan <span className="text-indigo-700 font-black">{filteredSiswa.length}</span> kartu siap cetak
            </span>
            {isGenerating && (
              <span className="text-xs text-amber-600 font-bold flex items-center gap-1.5 animate-pulse">
                <Sparkles className="w-3.5 h-3.5" /> Generasi QR Code Otomatis...
              </span>
            )}
          </div>

          {filteredSiswa.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-slate-300 text-slate-500">
              <p className="font-bold text-sm">Tidak ada data siswa ditemukan untuk filter ini.</p>
              <p className="text-xs mt-1">Coba ubah pilihan filter kelas, status Dapodik, atau kata kunci pencarian Anda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredSiswa.map((siswa) => {
                const qrUrl = qrMap[siswa.id || siswa.nis];
                const isBelumDapodik = siswa.statusDapodik === 'Belum Dapodik';
                const qrCodeIdentifier = getStudentQRIdentifier(siswa);

                return (
                  <div
                    key={siswa.id || siswa.nis}
                    className={`bg-white rounded-2xl p-4 border-2 shadow-sm hover:shadow-md transition-all flex flex-col items-center text-center relative group ${
                      isBelumDapodik ? 'border-amber-500/80 bg-amber-50/20' : 'border-indigo-600/80'
                    }`}
                  >
                    <div className={`w-full text-white font-black text-[10px] py-1 px-2 rounded-lg uppercase tracking-wider mb-2 flex items-center justify-between ${
                      isBelumDapodik ? 'bg-amber-600' : 'bg-indigo-600'
                    }`}>
                      <span>KARTU SISWA • SDN 3</span>
                      {isBelumDapodik ? (
                        <span className="bg-white text-amber-800 text-[8px] px-1.5 py-0.5 rounded font-mono font-bold">
                          NIK QR
                        </span>
                      ) : (
                        <span className="bg-white/20 text-white text-[8px] px-1.5 py-0.5 rounded font-mono">
                          DAPODIK
                        </span>
                      )}
                    </div>

                    {/* QR Code preview image */}
                    <div className="my-2 bg-white p-2 rounded-xl border border-slate-200 flex items-center justify-center min-h-[140px] w-full shadow-inner">
                      {qrUrl ? (
                        <img
                          src={qrUrl}
                          alt={`QR Code ${qrCodeIdentifier}`}
                          className="w-32 h-32 object-contain rounded-md"
                        />
                      ) : (
                        <div className="text-xs text-slate-400 font-mono animate-pulse">
                          Loading QR...
                        </div>
                      )}
                    </div>

                    <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-tight line-clamp-1">
                      {siswa.nama}
                    </h4>
                    
                    <div className="mt-1 space-y-0.5">
                      {isBelumDapodik ? (
                        <div className="text-[11px] font-bold text-amber-700 font-mono">
                          NIK: <span className="underline">{siswa.nik || qrCodeIdentifier}</span>
                        </div>
                      ) : (
                        <div className="text-[11px] font-bold text-indigo-700 font-mono">
                          NIS: {siswa.nis}
                        </div>
                      )}
                      <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full inline-block">
                        {siswa.kelas}
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-500 mt-1">
                      📞 WA: {siswa.waOrangTua || '-'}
                    </p>

                    {/* Single card download button */}
                    <button
                      type="button"
                      onClick={() => handleDownloadSingleCard(siswa)}
                      className="mt-2.5 w-full bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-800 text-[10.5px] font-bold py-1.5 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                      title="Unduh file gambar QR Code PNG siswa ini"
                    >
                      <Download className="w-3 h-3 text-indigo-600" />
                      <span>Unduh PNG</span>
                    </button>

                    <div className="w-full border-t border-dashed border-slate-200 mt-2.5 pt-1 text-[9px] text-slate-400 font-semibold">
                      {isBelumDapodik ? '⚠️ Terdaftar via NIK • Belum Dapodik' : 'Digiwangi 3 Presensi • Cisurupan, Garut'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-white border-t border-slate-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-slate-500 text-center sm:text-left">
            💡 <b>Petunjuk:</b> Anda dapat mengunduh seluruh QR Code kelas dalam <b>arsip ZIP (PNG)</b> atau langsung mencetak format 2 kolom A4.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleDownloadZip}
              disabled={filteredSiswa.length === 0 || isDownloadingZip}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs px-4 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              {isDownloadingZip ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <FileArchive className="w-4 h-4 text-emerald-200" />
              )}
              <span>
                {isDownloadingZip
                  ? `Mengemas ZIP (${downloadProgress?.current || 0}/${filteredSiswa.length})...`
                  : `📥 UNDUH ZIP (${filteredSiswa.length} QR)`}
              </span>
            </button>
            <button
              type="button"
              onClick={handlePrintAll}
              disabled={filteredSiswa.length === 0 || isGenerating || isDownloadingZip}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-xs px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-amber-300" />
              <span>🖨️ CETAK {filteredSiswa.length} KARTU</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
