import { useState, useEffect } from 'react';

type DialogMode =
  | 'qr'
  | 'scanning'
  | 'paired'
  | 'timeout'
  | 'pairing'
  | 'pairing_wait'
  | 'pairing_error';

interface ChannelQrDialogProps {
  visible: boolean;
  mode: DialogMode;
  qrDataUrl?: string;
  isConnected?: boolean;
  onClose: () => void;
  onRetryQr?: () => void;
  onTryPairing?: () => void;
  onPairingSubmit?: (phone: string) => void;
  onScanTimeout?: () => void;
}

export default function ChannelQrDialog({
  visible,
  mode,
  qrDataUrl,
  isConnected,
  onClose,
  onRetryQr,
  onTryPairing,
  onPairingSubmit,
  onScanTimeout,
}: ChannelQrDialogProps) {
  const [phoneInput, setPhoneInput] = useState('');
  const [showFallback, setShowFallback] = useState(false);

  // Auto-close when channel becomes connected
  useEffect(() => {
    if (visible && isConnected && mode !== 'paired') {
      const timer = setTimeout(onClose, 500);
      return () => clearTimeout(timer);
    }
  }, [visible, isConnected, mode, onClose]);

  // QR display timers: show the "QR not working?" fallback after 30s, and fire
  // the scan timeout after 2 min. Both reset when a new QR is returned or the
  // mode changes; cleaned up on unmount so no timers leak across navigation.
  useEffect(() => {
    if (!visible || mode !== 'qr' || !qrDataUrl) {
      setShowFallback(false);
      return;
    }
    setShowFallback(false);
    const fallbackTimer = setTimeout(() => setShowFallback(true), 30_000);
    const scanTimeoutTimer = setTimeout(() => onScanTimeout?.(), 120_000);
    return () => {
      clearTimeout(fallbackTimer);
      clearTimeout(scanTimeoutTimer);
    };
  }, [visible, mode, qrDataUrl, onScanTimeout]);

  if (!visible) return null;

  const renderContent = () => {
    switch (mode) {
      case 'qr':
        return (
          <div className="flex flex-col items-center gap-4">
            <h3 className="text-lg font-semibold text-zinc-900">Connect WhatsApp</h3>
            <p className="text-sm text-zinc-600 text-center max-w-xs">
              Open WhatsApp → Settings → Linked Devices → Link a Device, then scan this QR code
            </p>
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="WhatsApp QR code"
                width={280}
                height={280}
                className="rounded-lg border border-zinc-200"
              />
            )}
            {showFallback && (
              <button
                type="button"
                onClick={() => onTryPairing?.()}
                className="text-sm text-zinc-500 hover:text-zinc-700 underline transition-colors"
              >
                QR not working? Try phone number instead
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg bg-zinc-200 text-zinc-700 px-4 py-2 text-sm hover:bg-zinc-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        );

      case 'scanning':
        return (
          <div className="flex flex-col items-center gap-4">
            <h3 className="text-lg font-semibold text-zinc-900">Waiting for scan…</h3>
            <p className="text-sm text-zinc-600 text-center">
              Open WhatsApp on your phone and scan the QR code. The page will update automatically.
            </p>
            <div className="w-8 h-8 border-4 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
            <button
              onClick={onClose}
              className="rounded-lg bg-zinc-200 text-zinc-700 px-4 py-2 text-sm hover:bg-zinc-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        );

      case 'paired':
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <span className="text-3xl">✅</span>
            </div>
            <h3 className="text-lg font-semibold text-zinc-900">Connected!</h3>
            <p className="text-sm text-zinc-600 text-center">
              WhatsApp is now connected. The dialog will close automatically.
            </p>
          </div>
        );

      case 'timeout':
        return (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-zinc-600 text-center">
              QR code expired. You can try again or use your phone number instead.
            </p>
            <div className="flex gap-3">
              {onRetryQr && (
                <button
                  onClick={onRetryQr}
                  className="rounded-lg bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-800 transition-colors"
                >
                  Try QR again
                </button>
              )}
              {onTryPairing && (
                <button
                  onClick={onTryPairing}
                  className="rounded-lg bg-zinc-200 text-zinc-700 px-4 py-2 text-sm hover:bg-zinc-300 transition-colors"
                >
                  Use phone number
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        );

      case 'pairing':
        return (
          <div className="flex flex-col items-center gap-4">
            <h3 className="text-lg font-semibold text-zinc-900">Connect with phone number</h3>
            <p className="text-sm text-zinc-600 text-center">
              Enter your phone number with country code. WhatsApp will send a pairing request to your phone.
            </p>
            <label htmlFor="whatsapp-phone-input" className="text-sm text-zinc-600">
              Phone number (with country code)
            </label>
            <input
              id="whatsapp-phone-input"
              type="tel"
              placeholder="+1234567890"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              className="w-full max-w-xs rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
            {onPairingSubmit && (
              <button
                onClick={() => onPairingSubmit(phoneInput)}
                disabled={!phoneInput.trim()}
                className="rounded-lg bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40 transition-colors"
              >
                Send pairing request
              </button>
            )}
            <button
              onClick={onClose}
              className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        );

      case 'pairing_wait':
        return (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-zinc-600 text-center">
              Pairing request sent. Approve the link on your phone.
            </p>
            <div className="w-8 h-8 border-4 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
            <button
              onClick={onClose}
              className="rounded-lg bg-zinc-200 text-zinc-700 px-4 py-2 text-sm hover:bg-zinc-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        );

      case 'pairing_error':
        return (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-zinc-600 text-center">
              Pairing failed. Try again or use QR.
            </p>
            <div className="flex gap-3">
              {onRetryQr && (
                <button
                  onClick={onRetryQr}
                  className="rounded-lg bg-zinc-200 text-zinc-700 px-4 py-2 text-sm hover:bg-zinc-300 transition-colors"
                >
                  Try QR instead
                </button>
              )}
              {onTryPairing && (
                <button
                  onClick={onTryPairing}
                  className="rounded-lg bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-800 transition-colors"
                >
                  Try again
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
        {renderContent()}
      </div>
    </div>
  );
}
