import { useEffect, useRef, useState } from 'react';

/**
 * Real microphone level meter, drawn from an AnalyserNode.
 * It is only used for the "recording" visual — recognition itself is handled by
 * the Web Speech API. Every failure path is swallowed so a missing mic never
 * breaks the recorder UI.
 */
export function useMicLevel(active: boolean, enabled: boolean) {
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active || !enabled) {
      setLevel(0);
      cleanupRef.current?.();
      cleanupRef.current = null;
      return;
    }

    let cancelled = false;
    let raf = 0;

    const run = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser cannot access the microphone.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
        const buffer = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (cancelled) return;
          analyser.getByteFrequencyData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
          const rms = Math.sqrt(sum / buffer.length) / 255;
          // Perceptual curve so quiet speech still moves the meter.
          setLevel((prev) => prev * 0.65 + Math.min(1, rms * 2.6) * 0.35);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        setError(null);

        cleanupRef.current = () => {
          cancelAnimationFrame(raf);
          stream.getTracks().forEach((t) => t.stop());
          void ctx.close().catch(() => undefined);
        };
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        setError(
          name === 'NotAllowedError'
            ? 'Microphone permission denied'
            : name === 'NotFoundError'
              ? 'No microphone detected'
              : 'Microphone unavailable',
        );
      }
    };

    void run();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      cleanupRef.current?.();
      cleanupRef.current = null;
      setLevel(0);
    };
  }, [active, enabled]);

  return { level, error };
}