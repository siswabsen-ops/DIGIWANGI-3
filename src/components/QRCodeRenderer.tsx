import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QRCodeRendererProps {
  value: string; // The NIS, NIK, or identifier
  label?: string; // Optional custom label, e.g. "NIK 3205..." or "NIS 30409"
  size?: number;
  showText?: boolean;
}

export default function QRCodeRenderer({
  value,
  label,
  size = 180,
  showText = true,
}: QRCodeRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const textHeight = showText ? 24 : 0;
    
    // Set direct styling dimensions
    canvas.width = size;
    canvas.height = size + textHeight;

    // Clear and paint background with crisp white
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Create an offscreen canvas to avoid library overrides of size & custom texts
    const tempCanvas = document.createElement('canvas');
    QRCode.toCanvas(
      tempCanvas,
      value,
      {
        width: size,
        margin: 1.5,
        color: {
          dark: '#0f172a', // deep slate
          light: '#ffffff'
        },
        errorCorrectionLevel: 'H' // high error checking for secure prints
      },
      (error) => {
        if (error) {
          console.error('QR Code generation error:', error);
          return;
        }

        // Drawing offscreen QR Code onto the target visible canvas
        ctx.drawImage(tempCanvas, 0, 0, size, size);

        // Display identifier label at bottom
        if (showText) {
          ctx.fillStyle = '#1e293b'; // slate-800
          ctx.font = 'bold 11px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          let displayLabel = label;
          if (!displayLabel) {
            if (value.length === 16 && /^\d+$/.test(value)) {
              displayLabel = `NIK ${value}`;
            } else if (/^\d{5,10}$/.test(value)) {
              displayLabel = `NIS ${value}`;
            } else {
              displayLabel = `ID: ${value}`;
            }
          }
          ctx.fillText(displayLabel, size / 2, size + (textHeight / 2));
        }
      }
    );
  }, [value, label, size, showText]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `QR_CODE_${value}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div 
      id={`qrcode-container-${value}`} 
      className="flex flex-col items-center justify-center p-3 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300"
    >
      <canvas 
        ref={canvasRef} 
        className="max-w-full h-auto cursor-pointer rounded-lg hover:scale-[1.02] transition-transform duration-200" 
        onClick={handleDownload} 
        title="Klik untuk mengunduh QR Code" 
      />
      <button
        onClick={handleDownload}
        type="button"
        id={`btn-dl-qrcode-${value}`}
        className="mt-2 text-[10px] font-black text-rose-600 hover:text-rose-850 hover:underline transition-all uppercase tracking-widest cursor-pointer"
      >
        Unduh QR PNG
      </button>
    </div>
  );
}
