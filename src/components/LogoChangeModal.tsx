import React, { useState, useRef } from 'react';
import { Image as ImageIcon, Upload, RefreshCcw, X, Check, AlertCircle, ShieldAlert, Sparkles } from 'lucide-react';
import { SystemSettings, User } from '../types';
import { DEFAULT_DIGIWANGI_LOGO } from '../assets/officialLogos';
import { DIGIWANGI_LOGO_BASE64 } from '../assets/logoBase64';
import { optimizeLogoImage } from '../lib/imageOptimization';
import { APP_LOGO_STORAGE_KEY, safeSetItem, safeRemoveItem } from '../lib/storage';

interface LogoChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  settings: SystemSettings;
  onSaveSettings: (newSettings: SystemSettings) => void;
}

export default function LogoChangeModal({
  isOpen,
  onClose,
  currentUser,
  settings,
  onSaveSettings
}: LogoChangeModalProps) {
  const [appLogoInput, setAppLogoInput] = useState(settings.appLogoUrl || '');
  const [previewApp, setPreviewApp] = useState(settings.appLogoUrl || DEFAULT_DIGIWANGI_LOGO || DIGIWANGI_LOGO_BASE64);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const isAdmin = currentUser?.role === 'admin';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) {
      setMessage({ text: 'Akses ditolak: Hanya Admin yang dapat mengganti logo.', type: 'error' });
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage({ text: 'Harap pilih berkas gambar yang valid (PNG, JPG, SVG, WebP).', type: 'error' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ text: 'Ukuran berkas gambar maksimal 5 MB.', type: 'error' });
      return;
    }

    try {
      setIsProcessing(true);
      const optimizedBase64 = await optimizeLogoImage(file, 512, 512);
      setAppLogoInput(optimizedBase64);
      setPreviewApp(optimizedBase64);
      safeSetItem(APP_LOGO_STORAGE_KEY, optimizedBase64);
      setMessage({ text: 'Gambar Logo DIGIWANGI 3 berhasil dioptimasi & dimuat. Klik "Simpan Logo DIGIWANGI 3" untuk menerapkan secara permanen.', type: 'success' });
    } catch (err: any) {
      setMessage({ text: `Gagal memproses gambar: ${err.message || 'Kesalahan'}`, type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetToDefault = () => {
    if (!isAdmin) return;
    setAppLogoInput('');
    setPreviewApp(DEFAULT_DIGIWANGI_LOGO || DIGIWANGI_LOGO_BASE64);
    safeRemoveItem(APP_LOGO_STORAGE_KEY);
    setMessage({ text: 'Logo DIGIWANGI 3 direset ke logo resmi standar. Klik "Simpan Logo DIGIWANGI 3" untuk menyimpan.', type: 'success' });
  };

  const handleSave = () => {
    if (!isAdmin) {
      setMessage({ text: 'Hanya Admin yang memiliki hak akses untuk menyimpan perubahan logo!', type: 'error' });
      return;
    }

    const finalLogo = appLogoInput.trim() || undefined;
    if (finalLogo) {
      safeSetItem(APP_LOGO_STORAGE_KEY, finalLogo);
    } else {
      safeRemoveItem(APP_LOGO_STORAGE_KEY);
    }

    const updatedSettings: SystemSettings = {
      ...settings,
      appLogoUrl: finalLogo,
    };

    onSaveSettings(updatedSettings);
    setMessage({ text: 'Logo DIGIWANGI 3 berhasil disimpan permanen & langsung diterapkan di seluruh sistem!', type: 'success' });
    setTimeout(() => {
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        id="modal-ganti-logo-container"
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col font-sans"
      >
        {/* Header Modal */}
        <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                <span>Pengaturan Logo DIGIWANGI 3</span>
                {isAdmin ? (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-mono font-bold">
                    ADMIN
                  </span>
                ) : (
                  <span className="text-[10px] bg-red-500/20 text-red-300 border border-red-400/30 px-2 py-0.5 rounded-full font-mono font-bold">
                    READ ONLY
                  </span>
                )}
              </h3>
              <p className="text-xs text-blue-200/80">
                Ubah logo resmi aplikasi presensi DIGIWANGI 3 SDN 3 Karamatwangi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Permission warning if not Admin */}
          {!isAdmin && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-900">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-bold">Akses Terbatas: Khusus Administrator</p>
                <p className="text-amber-800 mt-0.5">
                  Penggantian logo DIGIWANGI 3 hanya dapat dilakukan oleh akun dengan hak akses <b>Admin</b>. Anda sedang login sebagai <b>{currentUser?.role?.toUpperCase() || 'PENGUNJUNG'}</b>.
                </p>
              </div>
            </div>
          )}

          {/* Feedback message */}
          {message && (
            <div className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2.5 ${
              message.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {message.type === 'success' ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
              <span>{message.text}</span>
            </div>
          )}

          {/* Active Logo Configurator */}
          <div className="p-5 bg-slate-50 border border-slate-200 rounded-3xl space-y-4">
            <div className="flex flex-col sm:flex-row items-center gap-5">
              {/* Preview Canvas */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="w-24 h-24 bg-white rounded-2xl border-2 border-blue-200 shadow-md p-2 flex items-center justify-center relative group">
                  <img 
                    src={previewApp || DIGIWANGI_LOGO_BASE64}
                    alt="Preview Logo DIGIWANGI 3"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      target.src = DIGIWANGI_LOGO_BASE64;
                    }}
                  />
                </div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Pratinjau Live
                </span>
              </div>

              {/* Upload and URL Controls */}
              <div className="flex-1 space-y-3 w-full">
                <div>
                  <h4 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Logo Resmi DIGIWANGI 3</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ditampilkan pada header utama, halaman absensi QR, dan halaman login.
                  </p>
                </div>

                {/* Upload & Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    disabled={!isAdmin}
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!isAdmin}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-sm transition cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload Logo Baru</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetToDefault}
                    disabled={!isAdmin}
                    className="flex items-center gap-1.5 bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-300 text-slate-700 font-bold text-xs py-2 px-3 rounded-xl transition cursor-pointer"
                    title="Kembalikan ke logo resmi bawaan"
                  >
                    <RefreshCcw className="w-3.5 h-3.5 text-slate-500" />
                    <span>Reset Default</span>
                  </button>
                </div>

                {/* Direct Image URL input */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Atau Masukkan URL Gambar (Direct Link):
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={appLogoInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAppLogoInput(val);
                      setPreviewApp(val || DEFAULT_DIGIWANGI_LOGO || DIGIWANGI_LOGO_BASE64);
                    }}
                    placeholder="https://example.com/logo.png atau data:image/..."
                    className="w-full bg-white border border-slate-300 disabled:bg-slate-100 rounded-xl py-1.5 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Header Placement Preview Card */}
          <div className="p-4 bg-slate-900 text-white rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-2">
              <span className="font-bold text-blue-300">SIMULASI TAMPILAN HEADER</span>
              <span>SDN 3 Karamatwangi</span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-blue-950/80 rounded-xl border border-blue-800/60">
              {/* Left Digiwangi 3 */}
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 bg-white rounded-xl p-1 flex items-center justify-center border border-blue-300 shadow-sm">
                  <img 
                    src={previewApp || DIGIWANGI_LOGO_BASE64} 
                    alt="Digiwangi" 
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <span className="text-xs font-black text-white tracking-tight">DIGIWANGI 3</span>
                  <span className="text-[9px] text-blue-200 block leading-none">Presensi Terpadu</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] bg-blue-900/60 text-blue-200 border border-blue-500/30 px-2 py-0.5 rounded-full font-mono">
                  Cloud Live
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 transition cursor-pointer"
          >
            Tutup
          </button>

          {isAdmin ? (
            <button
              type="button"
              id="btn-simpan-perubahan-logo"
              onClick={handleSave}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-2.5 px-5 rounded-xl shadow-md transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Simpan Logo DIGIWANGI 3</span>
            </button>
          ) : (
            <div className="text-[11px] text-slate-500 font-medium italic">
              Login sebagai Admin untuk menyimpan perubahan logo
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
