import { memo } from 'react';
import { Smartphone } from 'lucide-react';
import { Siswa, Presensi, SystemSettings, WaliKelas } from '../types';
import ScanScreen from './ScanScreen';

interface PiketPanelProps {
  siswaList: Siswa[];
  settings: SystemSettings;
  currentUser: { namaLengkap: string; role: string };
  onAddPresensi: (presensi: Presensi) => void;
  recentPresensi: Presensi[];
  isActive?: boolean;
  waliKelasList?: WaliKelas[];
}

function PiketPanel({
  siswaList,
  settings,
  currentUser,
  onAddPresensi,
  recentPresensi,
  isActive = true,
  waliKelasList,
}: PiketPanelProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* BANNER FOR PIKET PETUGAS */}
      <div className="bg-gradient-to-r from-blue-800 to-indigo-700 rounded-3xl p-5 text-white shadow border border-blue-600 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="bg-white/15 border border-white/20 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full inline-block">
              Petugas Piket Gerbang
            </span>
            <h2 className="text-xl font-black mt-1 tracking-tight leading-tight font-display">Pos Presensi Gerbang Digiwangi 3</h2>
            <p className="text-xs text-blue-100 opacity-95 leading-normal mt-0.5">
              Operator Bertugas: <b>{currentUser.namaLengkap}</b>. Prioritaskan ketepatan pencocokan QR Code dan stabilisasi feed kamera di HP atau laptop.
            </p>
          </div>

          <div className="text-xs shrink-0 bg-blue-900/30 py-2 px-3 border border-blue-400/30 rounded-xl flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-blue-200 animate-bounce" />
            <span>Mode Layar HP & Laptop Aktif</span>
          </div>
        </div>
      </div>

      {/* CORE OPERATIONAL STAND */}
      <div className="bg-slate-50 rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="bg-slate-100 px-6 py-3 border-b border-slate-200 flex items-center justify-between text-slate-700">
          <span className="text-xs font-black tracking-wider uppercase">STAN PEMINDAIAN GERBANG SDN 3</span>
          <span className="text-[10px] font-mono font-bold tracking-widest text-[#075E54] bg-[#DCF8C6] px-2 py-0.5 rounded">
            WA GATEWAY: ONLINE
          </span>
        </div>
        
        {/* Render Scan Screen inside Piket wrap directly */}
        <div className="p-2">
          <ScanScreen
            siswaList={siswaList}
            settings={settings}
            currentUser={currentUser}
            onAddPresensi={onAddPresensi}
            recentPresensi={recentPresensi}
            isActive={isActive}
            waliKelasList={waliKelasList}
          />
        </div>
      </div>

    </div>
  );
}

export default memo(PiketPanel);
