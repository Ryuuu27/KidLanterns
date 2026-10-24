import React, { useEffect, useRef } from 'react';
import { KindredEngine } from '../game/engine';
import { HudSnapshot } from '../game/types';

interface GameCanvasProps {
  onEngineReady: (engine: KindredEngine) => void;
  onHudChange: (hud: HudSnapshot) => void;
}

/**
 * Isolated memoized Canvas host so React HUD state updates never re-render
 * or interrupt the 60fps Canvas simulation loop.
 */
export const GameCanvas: React.FC<GameCanvasProps> = React.memo(
  ({ onEngineReady, onHudChange }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const engine = new KindredEngine(canvas, onHudChange);

      const handleResize = () => {
        const rect = container.getBoundingClientRect();
        engine.resize(rect.width, rect.height, window.devicePixelRatio || 1);
      };

      handleResize();
      window.addEventListener('resize', handleResize);
      engine.startLoop();
      onEngineReady(engine);

      return () => {
        window.removeEventListener('resize', handleResize);
        engine.destroy();
      };
    }, [onEngineReady, onHudChange]);

    return (
      <div ref={containerRef} className="absolute inset-0 w-full h-full overflow-hidden">
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>
    );
  },
  () => true
);
