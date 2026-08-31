import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Camera, Search, UserCheck, AlertTriangle, Clock, Smartphone, MessageCircle, RefreshCw, Star, CalendarClock, Sun } from 'lucide-react';
import { Siswa, Presensi, SystemSettings, StatusKehadiran, findStudentByCode, getStudentQRIdentifier, getApplicableJadwal } from '../types';
import { getLocalDateString, getLocalTimeString, isPresensiMatchSiswa, isPresensiDateMatch } from '../lib/attendanceUtils';
import QRCodeRenderer from './QRCodeRenderer';
// @ts-ignore
import jsQR from 'jsqr';

interface ScanScreenProps {
  siswaList: Siswa[];
  settings: SystemSettings;
  currentUser: { namaLengkap: string; role: string };
  onAddPresensi: (presensi: Presensi) => void;
  recentPresensi: Presensi[];
  isActive?: boolean;
}

function ScanScreen({
  siswaList,
  settings,
  currentUser,
  onAddPresensi,
  recentPresensi,
  isActive = true,
}: ScanScreenProps) {
  const [nisInput, setNisInput] = useState('');
  const [useCamera, setUseCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [scannerStatus, setScannerStatus] = useState<'READY' | 'SCANNING' | 'SUCCESS' | 'ERROR'>('READY');
  const [scannedResult, setScannedResult] = useState<Presensi | null>(null);
  const [manualStatus, setManualStatus] = useState<StatusKehadiran | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isMirrored, setIsMirrored] = useState(false); // Default to false so rear camera/cards read correctly
  const [simSearch, setSimSearch] = useState('');
  const [simLimit, setSimLimit] = useState(25);

  const videoRef = useRef<HTMLVideoElement>(null);
  const scanTimeoutRef = useRef<any>(null);

  // Fast O(1) today attendance lookup map
  const todayAttendanceMap = useMemo(() => {
    const todayDate = getLocalDateString();
    const map = new Map<string, Presensi>();
    recentPresensi.forEach((p) => {
      if (isPresensiDateMatch(p.tanggal, todayDate)) {
        if (p.siswaId) map.set(p.siswaId, p);
        if (p.nis) {
          const cleanNis = p.nis.trim();
          map.set(cleanNis, p);
          map.set(cleanNis.replace(/^0+/, ''), p);
        }
      }
    });
    return map;
  }, [recentPresensi]);

  // Fast filtered simulation pupils list
  const filteredSimSiswa = useMemo(() => {
    if (!simSearch.trim()) return siswaList;
    const q = simSearch.toLowerCase().trim();
    return siswaList.filter(
      (s) =>
        s.nama.toLowerCase().includes(q) ||
        s.nis.includes(q) ||
        s.kelas.toLowerCase().includes(q)
    );
  }, [siswaList, simSearch]);

  // Clean-up camera on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, [cameraStream]);

  // Safely assign the stream to the video element whenever it is mounted
  useEffect(() => {
    if (useCamera && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch((err) => {
        console.warn('Video element play failure:', err);
      });
    }
  }, [useCamera, cameraStream]);

  const lastScannedMapRef = useRef<{ [code: string]: number }>({});

  // Real-time loop to auto-capture frames from key video and decode with jsQR
  useEffect(() => {
    if (!useCamera || !cameraStream || !isActive) return;

    let active = true;
    let animFrameId: number;
    let lastScanTime = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const scanFrame = () => {
      if (!active) return;

      const nowTime = Date.now();
      if (nowTime - lastScanTime > 120) {
        lastScanTime = nowTime;

        if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
          const video = videoRef.current;
          // Downsample block: using standard sizes for jsQR makes processing lightning fast
          const width = 480;
          const height = 360;
          canvas.width = width;
          canvas.height = height;

          if (ctx) {
            ctx.drawImage(video, 0, 0, width, height);
            const imageData = ctx.getImageData(0, 0, width, height);

            try {
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
              });

              if (code && code.data) {
                const decodedCode = code.data.trim();
                if (decodedCode) {
                  const lastScanned = lastScannedMapRef.current[decodedCode] || 0;
                  // Cooldown of 2 seconds for the exact same student to prevent accidental duplicate triggers, but 0ms for different students
                  if (nowTime - lastScanned > 2000) {
                    lastScannedMapRef.current[decodedCode] = nowTime;
                    handleScanIdentify(decodedCode);
                  }
                }
              }
            } catch (e) {
              console.error('jsQR scanning error:', e);
            }
          }
        }
      }

      animFrameId = requestAnimationFrame(scanFrame);
    };

    // A tiny buffer delay to let the camera source stabilize
    const startTimeout = setTimeout(() => {
      animFrameId = requestAnimationFrame(scanFrame);
    }, 150);

    return () => {
      active = false;
      clearTimeout(startTimeout);
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
      }
    };
  }, [useCamera, cameraStream, isActive]);

  // Turn on/off real browser camera
  const toggleCamera = async () => {
    if (useCamera) {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      setCameraStream(null);
      setUseCamera(false);
      setScannerStatus('READY');
    } else {
      setUseCamera(true);
      setScannerStatus('SCANNING');
      setErrorMsg('');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        setCameraStream(stream);
      } catch (err) {
        console.warn('Webcam access was restricted, fallback to simulator webcam stream', err);
        setErrorMsg('Webcam asli terbatasi (atau dijalankan di sandbox). Kami mensimulasikan feed kamera sekolah dengan laser target.');
      }
    }
  };

  // Main attendance logging function (Rapid & Non-blocking)
  const handleScanIdentify = (code: string, customStatus?: StatusKehadiran) => {
    setErrorMsg('');
    const matchedSiswa = findStudentByCode(siswaList, code);
    
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }

    if (!matchedSiswa) {
      setScannerStatus('ERROR');
      setErrorMsg(`QR Code / ID [${code}] belum terdaftar di sistem SDN 3.`);
      // Auto reset status back to SCANNING after 1.5 seconds
      scanTimeoutRef.current = setTimeout(() => {
        setScannerStatus('SCANNING');
        setErrorMsg('');
      }, 1500);
      return;
    }

    // Determine default status based on Arrival time and System Settings / Shift Schedule
    const now = new Date();
    const waktuSekarang = getLocalTimeString(now);

    // Lookup dynamic applicable schedule for student's class (e.g., Jadwal Siang Kelas 1-6 vs Pagi)
    const applicableJadwal = getApplicableJadwal(matchedSiswa.kelas, settings, waktuSekarang);
    const targetJamToleransi = applicableJadwal?.jamToleransi || settings.jamToleransi || '07:15';

    // Status logic rule: if current time is after target "jamToleransi" -> "Terlambat", else "Hadir"
    let determinedStatus: StatusKehadiran = 'Hadir';
    if (customStatus) {
      determinedStatus = customStatus;
    } else {
      const [limitH, limitM] = targetJamToleransi.split(':').map(Number);
      const curH = now.getHours();
      const curM = now.getMinutes();

      if (curH > limitH || (curH === limitH && curM > limitM)) {
        determinedStatus = 'Terlambat';
      }
    }

    const todayDate = getLocalDateString(now);

    // Check if pupil already scanned today to avoid duplicate records
    const alreadyScanned = recentPresensi.find(
      (p) => isPresensiMatchSiswa(p, matchedSiswa) && isPresensiDateMatch(p.tanggal, todayDate)
    );

    if (alreadyScanned && !customStatus) {
      // Allow overriding but inform softly
      setErrorMsg(`Info: ${matchedSiswa.nama} sudah tercatat presensi hari ini pukul ${alreadyScanned.waktu.slice(0,5)}.`);
    }

    // Deterministic unique ID per student per day so Firestore updates in-place
    const newPresensiId = alreadyScanned ? alreadyScanned.id : `pr-${matchedSiswa.id}-${todayDate}`;
    const newRecord: Presensi = {
      id: newPresensiId,
      siswaId: matchedSiswa.id,
      nis: matchedSiswa.nis,
      nik: matchedSiswa.nik,
      nama: matchedSiswa.nama,
      kelas: matchedSiswa.kelas,
      tanggal: todayDate,
      waktu: waktuSekarang,
      status: determinedStatus,
      waStatus: 'Terkirim',
      pesanTerkirim: `Diproses via Server Utama WA Gateway (087844651559) ➔ Terkirim ke WhatsApp Orang Tua (${matchedSiswa.waOrangTua}) [${applicableJadwal?.nama || 'Reguler'}]`,
      operator: currentUser.namaLengkap,
    };

    onAddPresensi(newRecord);
    setScannedResult(newRecord);
    setScannerStatus('SUCCESS');

    // Beeps or play sound for instant scan confirmation
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(950, audioCtx.currentTime); // High pleasant chirp
      gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.12);
    } catch (e) {
      // Audio autoplay policy fallback
    }

    // Auto clear toast after 2.5 seconds without interrupting ongoing scanning
    scanTimeoutRef.current = setTimeout(() => {
      setScannerStatus('SCANNING');
      setScannedResult(null);
    }, 2500);
  };

  const handleNisSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nisInput.trim()) return;
    handleScanIdentify(nisInput, manualStatus || undefined);
    setNisInput('');
    setManualStatus(null);
  };

  // Direct mock scan via clicking student cards
  const handleVirtualScan = (siswa: Siswa, forcedStatus?: StatusKehadiran) => {
    setScannerStatus('SCANNING');
    const qrIdentifier = getStudentQRIdentifier(siswa);
    setTimeout(() => {
      handleScanIdentify(qrIdentifier, forcedStatus);
    }, 400); // Quick split-second visual laser delay
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 max-w-7xl mx-auto">
      {/* LEFT COLUMN: SCANNER SCREEN (7 Cols) */}
      <div className="lg:col-span-7 space-y-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col relative overflow-hidden">
          {/* Banner */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2 font-display">
                  <Camera className="w-5 h-5 text-blue-700 animate-pulse" />
                  Pindai QR Code Kartu Siswa
                </h3>
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Antrean Kelas Cepat
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Arahkan QR Code kartu siswa ke kamera. Sistem membaca beruntun tanpa jeda pop-up.
              </p>
            </div>
            
            {/* Toleransi limit & schedule indicator */}
            <div className="text-right select-none flex flex-col items-end">
              <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400 block font-display">
                {settings.jadwalList && settings.jadwalList.length > 0 ? 'JADWAL PRESENSI AKTIF' : 'BATAS HADIR'}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                {settings.jadwalList && settings.jadwalList.filter(j => j.isAktif !== false).length > 0 ? (
                  <div className="flex flex-col items-end gap-0.5">
                    {settings.jadwalList.filter(j => j.isAktif !== false).slice(0, 2).map(j => (
                      <span key={j.id} className="text-[11px] font-black text-blue-800 bg-blue-50 border border-blue-200 py-0.5 px-2 rounded-lg flex items-center gap-1">
                        <Clock className="w-3 h-3 text-blue-600" />
                        <span className="font-sans">{j.nama}</span>: <span className="font-mono">{j.jamMasuk}–{j.jamToleransi}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs font-black text-blue-700 bg-blue-50 border border-blue-200 py-1 px-2.5 rounded-xl flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-700" />
                    {settings.jamMasuk} - {settings.jamToleransi} WIB
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Real-time Camera Feed Simulator / Real Webcam View Port */}
          <div className={`relative aspect-video bg-slate-950 rounded-2xl overflow-hidden shadow-inner border transition-all duration-300 flex flex-col justify-center items-center ${
            scannerStatus === 'SUCCESS' ? 'border-emerald-500 ring-4 ring-emerald-500/30' : 'border-slate-800'
          }`}>
            {useCamera ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className={`w-full h-full object-cover transform ${isMirrored ? 'scale-x-[-1]' : ''}`}
                  title="Tampilan kamera aktif"
                />
                
                {/* Laser scan line sweep effect */}
                {scannerStatus === 'SCANNING' && (
                  <div className="absolute inset-x-0 top-1/2 h-0.5 bg-blue-500 shadow-[0_0_10px_#3b82f6] animate-bounce z-10" />
                )}
                
                {/* Green corner targeting overlay frame */}
                <div className="absolute inset-0 p-8 pointer-events-none flex items-center justify-center">
                  <div className={`w-48 h-28 border-2 border-dashed rounded-lg opacity-85 relative transition-colors ${
                    scannerStatus === 'SUCCESS' ? 'border-emerald-400' : 'border-emerald-500/70'
                  }`}>
                    <span className="absolute -top-1.5 -left-1.5 w-4 h-4 border-t-4 border-l-4 border-emerald-500 block" />
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-4 border-r-4 border-emerald-500 block" />
                    <span className="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-4 border-l-4 border-emerald-500 block" />
                    <span className="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-4 border-r-4 border-emerald-500 block" />
                  </div>
                </div>

                {/* Subtitle Status */}
                <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] font-black text-white flex items-center gap-1.5 z-20">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                  KAMERA AKTIF ({currentUser.role === 'piket' ? 'PETUGAS PIKET' : 'OPERATOR'})
                </div>
              </>
            ) : (
              // Standby View
              <div className="text-center p-6 space-y-3 max-w-sm">
                <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center text-blue-500 mx-auto shadow-md border border-slate-800">
                  <Camera className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-200 text-sm font-display">KAMERA MASIH NONAKTIF</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                    Aktifkan kamera untuk mulai memindai QR Code fisik siswa secara otomatis.
                  </p>
                </div>
                <button
                  type="button"
                  id="btn-trigger-camera"
                  onClick={toggleCamera}
                  className="bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-bold text-xs py-2.5 px-5 shadow-lg transition-all inline-block cursor-pointer active:scale-95 font-display tracking-tight"
                >
                  Aktifkan Kamera Scanner
                </button>
              </div>
            )}

            {/* Error Message Notice Bar overlay */}
            {errorMsg && (
              <div className="absolute top-3 inset-x-3 bg-red-900/95 backdrop-blur-md border border-red-700 text-white p-2.5 rounded-xl text-[11px] text-center flex items-center justify-center gap-1.5 shadow-lg select-none z-30">
                <AlertTriangle className="w-4 h-4 text-white shrink-0" />
                {errorMsg}
              </div>
            )}
            
            {/* SUCCESS SCAN SCREEN: NON-BLOCKING BOTTOM HUD BANNER (Camera stays 100% visible & active) */}
            {scannerStatus === 'SUCCESS' && scannedResult && (
              <div className="absolute inset-x-3 bottom-3 bg-slate-950/90 backdrop-blur-md border-2 border-emerald-500 text-white p-3 rounded-2xl shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom-4 duration-150 z-30 pointer-events-auto">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 bg-emerald-600 rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg border border-emerald-400">
                    <UserCheck className="w-6 h-6 animate-bounce" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-md font-mono">
                        PRESENSI BERHASIL
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">{scannedResult.waktu} WIB</span>
                    </div>
                    <h4 className="text-sm font-black text-white truncate mt-0.5">{scannedResult.nama}</h4>
                    <div className="flex items-center gap-2 text-[10px] text-slate-300">
                      <span className="font-mono font-bold text-slate-200">
                        {scannedResult.nik && (!scannedResult.nis || scannedResult.nis.startsWith('REG-') || scannedResult.nis.startsWith('NON-')) 
                          ? `NIK: ${scannedResult.nik}` 
                          : `NIS: ${scannedResult.nis}`} ({scannedResult.kelas})
                      </span>
                      <span className="text-emerald-400 font-medium truncate">
                        • 📡 WA: {scannedResult.pesanTerkirim?.match(/\(([^)]+)\)/)?.[1] || '087844651559 (Terkirim)'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wide shadow-md ${
                    scannedResult.status === 'Hadir' 
                      ? 'bg-emerald-600 text-white border border-emerald-400' 
                      : 'bg-amber-600 text-white border border-amber-400'
                  }`}>
                    {scannedResult.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (scanTimeoutRef.current) {
                        clearTimeout(scanTimeoutRef.current);
                      }
                      setScannerStatus('SCANNING');
                      setScannedResult(null);
                      setErrorMsg('');
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-2 rounded-xl transition-colors cursor-pointer"
                    title="Siap scan berikutnya"
                  >
                    <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin-slow" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* CAMERA DECOR & SWITCH TOGGLE */}
          {useCamera && (
            <div className="mt-3 flex flex-col sm:flex-row items-center justify-between gap-2 border border-slate-100 bg-slate-50 rounded-2xl p-3">
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <span className="text-xs text-slate-500 font-bold">Kamera Terintegrasi: Live View SDN 3</span>
                <button
                  type="button"
                  onClick={() => setIsMirrored(!isMirrored)}
                  className={`text-[10px] font-bold py-1 px-2.5 rounded-lg border transition-all cursor-pointer ${
                    isMirrored
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {isMirrored ? '🔄 Mirror Aktif (Terbalik)' : '🔄 Cermin Nonaktif (Normal)'}
                </button>
              </div>
              <button
                type="button"
                id="btn-turn-off-cam"
                onClick={toggleCamera}
                className="text-xs font-bold text-blue-700 hover:text-blue-950 cursor-pointer"
              >
                Matikan Kamera
              </button>
            </div>
          )}

          {/* QUICK MANUAL BYPASS TERMINAL FORM */}
          <form onSubmit={handleNisSubmit} className="mt-5 pt-5 border-t border-gray-150">
            <h4 className="text-xs font-black tracking-wider text-slate-500 uppercase mb-3">
              ⌨️ INPUT MANUAL (Alternative / Bypass Scanner)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              {/* NIS input */}
              <div className="sm:col-span-4 relative">
                <input
                  type="text"
                  value={nisInput}
                  onChange={(e) => setNisInput(e.target.value)}
                  placeholder="Ketik NIS, NISN, atau NIK Siswa..."
                  className="w-full bg-white border border-gray-300 rounded-xl py-2 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-700 font-mono font-medium"
                />
              </div>

              {/* Status adjust combo */}
              <div className="sm:col-span-5 flex rounded-xl border border-gray-200 overflow-hidden bg-slate-50 p-1 gap-1">
                {(['Hadir', 'Sakit', 'Izin', 'Alfa', 'Terlambat'] as StatusKehadiran[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setManualStatus(st)}
                    className={`flex-1 text-[10px] font-bold py-1.5 px-1.5 rounded-lg transition-all cursor-pointer ${
                      manualStatus === st
                        ? 'bg-blue-700 text-white shadow-md'
                        : 'text-slate-600 hover:bg-slate-150'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {/* Submit trigger */}
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  id="btn-submit-manual-absen"
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white rounded-xl py-2.5 font-bold text-xs shadow transition-all cursor-pointer block text-center"
                >
                  Absen Sekarang &arr;
                </button>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              *Jika tidak mengaktifkan pilihan status, status otomatis terisi <span className="font-bold text-blue-700">Terlambat</span> setelah melewati jam {settings.jamToleransi} WIB.
            </p>
          </form>
        </div>
      </div>

      {/* RIGHT COLUMN: REPRENSENTATIVE VIRTUAL CARDS / SCAN DEMO TOOLS (5 Cols) */}
      <div className="lg:col-span-5 space-y-6">
        {/* INFO CARD & SPEED TRIGGER TEST CODES */}
        <div className="bg-white rounded-3xl p-5 border border-slate-250 shadow-sm">
          <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              Simulasi Pindai Instan (Klik Murid)
            </h3>
            <span className="text-[9px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold font-mono uppercase">Interactive Demo</span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed mb-3">
            Untuk menguji aliran sistem <b>DIGIWANGI 3</b> tanpa printer scan QR Code fisik, klik salah satu kartu siswa virtual di bawah ini untuk mensimulasikan pemindaian laser QR Code secara otomatis!
          </p>

          {/* Quick Search for Simulation List */}
          <div className="mb-3">
            <div className="relative">
              <input
                type="text"
                value={simSearch}
                onChange={(e) => setSimSearch(e.target.value)}
                placeholder="Cari murid simulasi (Nama / NIS / Kelas)..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              {simSearch && (
                <button
                  type="button"
                  onClick={() => setSimSearch('')}
                  className="text-[10px] text-slate-400 hover:text-slate-700 absolute right-2.5 top-2 cursor-pointer font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Interactive Virtual Students Card Matrix */}
          <div className="space-y-2 max-h-[304px] overflow-y-auto pr-1">
            {filteredSimSiswa.slice(0, simLimit).map((siswa) => {
              // Fast O(1) check using memoized todayAttendanceMap
              const presentToday = todayAttendanceMap.get(siswa.id) || 
                                   todayAttendanceMap.get(siswa.nis) || 
                                   todayAttendanceMap.get(siswa.nis.replace(/^0+/, ''));

              return (
                <div
                  key={siswa.id}
                  className={`p-2.5 rounded-2xl border transition-all flex items-center justify-between gap-3 group relative overflow-hidden text-left ${
                    presentToday
                      ? presentToday.status === 'Hadir'
                        ? 'bg-emerald-50 border-emerald-250 hover:bg-emerald-100'
                        : presentToday.status === 'Sakit'
                        ? 'bg-indigo-50 border-indigo-250 hover:bg-indigo-100'
                        : presentToday.status === 'Izin'
                        ? 'bg-amber-50 border-amber-250 hover:bg-amber-100'
                        : presentToday.status === 'Alfa'
                        ? 'bg-rose-50 border-rose-250 hover:bg-rose-100'
                        : 'bg-orange-50 border-orange-250 hover:bg-orange-100'
                      : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-2 max-w-[55%]">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs font-mono uppercase ${
                      siswa.jenisKelamin === 'L' ? 'bg-sky-100 text-sky-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {siswa.nama.charAt(0)}
                    </div>
                    <div className="truncate">
                      <h4 className="text-xs font-bold text-gray-800 truncate leading-none group-hover:text-blue-700 transition-colors">
                        {siswa.nama}
                      </h4>
                      <span className="text-[9px] font-mono text-gray-400 font-semibold block mt-1">
                        NIS {siswa.nis} • {siswa.kelas}
                      </span>
                    </div>
                  </div>

                  {/* Micro QR Code preview + click scanner simulation */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="opacity-70 group-hover:opacity-100 transition-all duration-300">
                      {/* CSS QR Code mockup icon */}
                      <div className="w-8 h-8 bg-white p-1 flex items-center justify-center border border-slate-250 rounded-lg shadow-inner select-none pointer-events-none">
                        <div className="w-full h-full relative">
                          {/* Anchor Top-Left */}
                          <span className="w-2.5 h-2.5 border-2 border-slate-900 rounded-[1px] absolute top-0 left-0 flex items-center justify-center">
                            <span className="w-1 h-1 bg-slate-900 rounded-[1px]" />
                          </span>
                          {/* Anchor Top-Right */}
                          <span className="w-2.5 h-2.5 border-2 border-slate-900 rounded-[1px] absolute top-0 right-0 flex items-center justify-center">
                            <span className="w-1 h-1 bg-slate-900 rounded-[1px]" />
                          </span>
                          {/* Anchor Bottom-Left */}
                          <span className="w-2.5 h-2.5 border-2 border-slate-900 rounded-[1px] absolute bottom-0 left-0 flex items-center justify-center">
                            <span className="w-1 h-1 bg-slate-900 rounded-[1px]" />
                          </span>
                          {/* Dots */}
                          <span className="w-1 h-1 bg-slate-900 absolute bottom-1 right-1 rounded-[0.5px]" />
                          <span className="w-1 h-1 bg-slate-900 absolute bottom-0 right-0 rounded-[0.5px]" />
                        </div>
                      </div>
                    </div>

                    {/* Quick Trigger Preset Action Button */}
                    <div className="flex flex-col gap-1 font-sans">
                      <button
                        type="button"
                        id={`btn-mock-scan-${siswa.nis}`}
                        onClick={() => handleVirtualScan(siswa)}
                        className={`text-[9px] font-extrabold py-1 px-2.5 rounded-lg cursor-pointer transition-all ${
                          presentToday
                            ? presentToday.status === 'Hadir'
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : presentToday.status === 'Sakit'
                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                              : presentToday.status === 'Izin'
                              ? 'bg-amber-600 hover:bg-amber-700 text-white'
                              : presentToday.status === 'Alfa'
                              ? 'bg-rose-600 hover:bg-rose-700 text-white'
                              : 'bg-orange-600 hover:bg-orange-700 text-white'
                            : 'bg-blue-700 hover:bg-blue-800 text-white shadow-sm'
                        }`}
                        title="Simulasikan Scan QR Code otomatis untuk murid ini"
                      >
                        {presentToday ? `${presentToday.status}` : 'Pindai'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredSimSiswa.length > simLimit && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setSimLimit(prev => prev + 30)}
                  className="text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 py-1.5 px-3 rounded-xl transition cursor-pointer"
                >
                  Tampilkan Murid Lainnya ({simLimit} dari {filteredSimSiswa.length})
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RECENT SCANS LIST / HISTORY COMPACT */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider font-display">
            📊 Riwayat Presensi Hari Ini
          </h3>
          
          <div className="space-y-2 max-h-[195px] overflow-y-auto pr-1">
            {recentPresensi.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-xs">
                Belum ada presensi yang masuk pada tanggal hari ini.
              </div>
            ) : (
              [...recentPresensi].reverse().map((p) => {
                const isLate = p.status === 'Terlambat';
                const statusColor =
                  p.status === 'Hadir'
                    ? 'bg-emerald-100 text-emerald-800'
                    : p.status === 'Sakit'
                    ? 'bg-indigo-150 text-indigo-850 font-extrabold'
                    : p.status === 'Izin'
                    ? 'bg-amber-100 text-amber-800'
                    : p.status === 'Alfa'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-red-100 text-red-800';

                return (
                  <div key={p.id} className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-xs animate-in slide-in-from-top-2 duration-150">
                    <div>
                      <div className="font-extrabold text-gray-800 text-[11px] leading-tight">
                        {p.nama}
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono tracking-wide mt-0.5">
                        NIS {p.nis} • {p.kelas}
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <div className="text-[10px] text-gray-500 font-mono">
                        {p.waktu.slice(0, 5)}
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0 ${statusColor}`}>
                        {p.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(ScanScreen);
