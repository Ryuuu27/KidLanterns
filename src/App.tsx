import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import {
  BondHeartSvg,
  LanternHudSvg,
  PauseIconSvg,
  SoundIconSvg,
  TitleLockupSvg,
} from './components/TitleLockup';
import { KindredEngine } from './game/engine';
import { SANCTUARIES } from './game/levels';
import { CoupleNames, GameState, HudSnapshot, PlayMode } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  gameState: GameState.TitleMenu,
  playMode: PlayMode.Coop2P,
  hearts: 5,
  maxHearts: 5,
  harmonyPips: 0,
  sanctuaryIndex: 1,
  totalSanctuaries: SANCTUARIES.length,
  sanctuaryTitle: SANCTUARIES[0].title,
  objectiveHint: SANCTUARIES[0].objectiveHint,
  lanternsLit: 0,
  totalLanterns: SANCTUARIES[0].lanterns.length,
  enemiesRemaining: 0,
  bossHpRatio: null,
  bossName: null,
  score: 0,
  syncStreak: 0,
  isMuted: false,
  roundStats: null,
};

export default function App() {
  const engineRef = useRef<KindredEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [names, setNames] = useState<CoupleNames>({ sol: 'Sol', luna: 'Luna' });
  const [editingNames, setEditingNames] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  const handleEngineReady = useCallback((engine: KindredEngine) => {
    engineRef.current = engine;
  }, []);

  const handleHudChange = useCallback((snapshot: HudSnapshot) => {
    setHud(snapshot);
  }, []);

  // Sync custom names to simulation engine
  useEffect(() => {
    engineRef.current?.setCoupleNames(names);
  }, [names]);

  // Title Screen Enter / Space quick-start when not inside name editor or rules modal
  useEffect(() => {
    if (hud.gameState !== GameState.TitleMenu || editingNames || showHowToPlay) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        engineRef.current?.startNewGame();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hud.gameState, editingNames, showHowToPlay]);

  const handleModeChange = (mode: PlayMode) => {
    engineRef.current?.setPlayMode(mode);
  };

  const handleStartGame = () => {
    setEditingNames(false);
    setShowHowToPlay(false);
    engineRef.current?.startNewGame();
  };

  const bondStateLabel =
    hud.hearts >= 4 ? 'Radiant' : hud.hearts >= 2 ? 'Steady' : 'Strained';

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#08101B] text-[#F1F5F9]">
      {/* Isolated 60fps Canvas Simulation */}
      <GameCanvas onEngineReady={handleEngineReady} onHudChange={handleHudChange} />

      {/* =====================================================================
          TITLE SCREEN SHELL (Live-world camera pan + >=40% negative space)
          ===================================================================== */}
      {hud.gameState === GameState.TitleMenu && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between px-6 py-7 sm:px-10 sm:py-9">
          {/* Top-bar minimal utility: Sound toggle + How to Play (unobtrusive perimeter) */}
          <div className="flex items-center justify-between">
            <div className="pointer-events-auto flex items-center gap-4 text-xs text-[#CBD5E1]">
              <button
                type="button"
                onClick={() => setEditingNames((prev) => !prev)}
                className="min-h-[40px] px-3 py-2 rounded-lg bg-[#0E1929]/90 border border-[#F8FAFC]/12 text-[#F1F5F9] hover:border-[#FDE68A]/45 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#FDE68A]"
              >
                Spirits: {names.sol} &amp; {names.luna}
              </button>
              <button
                type="button"
                onClick={() => setShowHowToPlay((prev) => !prev)}
                className="min-h-[40px] px-3 py-2 rounded-lg bg-[#0E1929]/90 border border-[#F8FAFC]/12 text-[#CBD5E1] hover:text-[#F1F5F9] hover:border-[#F8FAFC]/30 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#FDE68A]"
              >
                How to Play
              </button>
            </div>

            <button
              type="button"
              onClick={() => engineRef.current?.toggleMute()}
              aria-label={hud.isMuted ? 'Unmute audio' : 'Mute audio'}
              className="pointer-events-auto min-w-[40px] min-h-[40px] px-3 py-2 rounded-lg bg-[#0E1929]/90 border border-[#F8FAFC]/12 text-[#E2E8F0] hover:border-[#FDE68A]/45 transition-colors flex items-center gap-2 text-xs whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#FDE68A]"
            >
              <SoundIconSvg muted={hud.isMuted} />
              <span>{hud.isMuted ? 'Muted' : 'Sound On'}</span>
            </button>
          </div>

          {/* Bespoke SVG Title Lockup positioned in upper-center leaving center garden open */}
          <div className="flex flex-col items-center text-center mt-1 sm:mt-2">
            <TitleLockupSvg />
          </div>

          {/* Open Live-World Negative Space Showcase (~40% viewport height unobstructed) */}
          <div className="flex-1 min-h-[24vh]" />

          {/* Bottom Action Cluster + Single Flat Control-Hint Line */}
          <div className="flex flex-col items-center gap-4 pb-1">
            {/* Optional Inline Couple Names Customizer */}
            {editingNames && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setEditingNames(false);
                }}
                className="pointer-events-auto w-full max-w-md bg-[#0E1929]/95 border border-[#FDE68A]/25 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-3 shadow-xl"
              >
                <label className="flex-1 w-full text-xs text-[#FDE68A]">
                  <span className="block mb-1 font-medium">Sun Spirit (WASD)</span>
                  <input
                    type="text"
                    maxLength={14}
                    value={names.sol}
                    onChange={(e) => setNames((n) => ({ ...n, sol: e.target.value }))}
                    placeholder="Sol"
                    className="w-full px-3 py-2 rounded-lg bg-[#08101B] border border-[#F8FAFC]/15 text-sm text-[#F8FAFC] focus:outline-none focus:border-[#FDE68A]"
                  />
                </label>
                <label className="flex-1 w-full text-xs text-[#FECDD3]">
                  <span className="block mb-1 font-medium">Moon Spirit (Arrows)</span>
                  <input
                    type="text"
                    maxLength={14}
                    value={names.luna}
                    onChange={(e) => setNames((n) => ({ ...n, luna: e.target.value }))}
                    placeholder="Luna"
                    className="w-full px-3 py-2 rounded-lg bg-[#08101B] border border-[#F8FAFC]/15 text-sm text-[#F8FAFC] focus:outline-none focus:border-[#FECDD3]"
                  />
                </label>
                <button
                  type="submit"
                  className="min-h-[40px] sm:self-end px-4 py-2 rounded-lg bg-[#F59E0B] text-[#08101B] text-xs font-semibold hover:bg-[#FBBF24] transition-colors whitespace-nowrap shrink-0"
                >
                  Save
                </button>
              </form>
            )}

            {/* Mode Segmented Selector + Primary Start CTA */}
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3">
              <div
                role="group"
                aria-label="Player mode"
                className="flex items-center p-1 rounded-xl bg-[#0E1929]/95 border border-[#F8FAFC]/12"
              >
                <button
                  type="button"
                  onClick={() => handleModeChange(PlayMode.Coop2P)}
                  className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    hud.playMode === PlayMode.Coop2P
                      ? 'bg-[#1D2F47] text-[#FDE68A]'
                      : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                  }`}
                >
                  2 Players (Shared Keyboard / Pads)
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange(PlayMode.SoloCompanion)}
                  className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    hud.playMode === PlayMode.SoloCompanion
                      ? 'bg-[#1D2F47] text-[#FECDD3]'
                      : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                  }`}
                >
                  Solo + Companion
                </button>
              </div>

              <button
                type="button"
                onClick={handleStartGame}
                className="min-h-[44px] px-7 py-2.5 rounded-xl bg-[#F59E0B] text-[#08101B] text-sm font-bold tracking-wide hover:bg-[#FBBF24] active:scale-[0.98] transition-all shadow-lg whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FDE68A]"
              >
                Start Game
              </button>
            </div>

            {/* Single Flat Control-Hint Line (Unboxed text, typographic separators) */}
            <p className="text-xs sm:text-[13px] text-[#CBD5E1] tracking-wide text-center whitespace-nowrap overflow-x-auto max-w-full px-2">
              {hud.playMode === PlayMode.Coop2P ? (
                <>
                  <span>{names.sol}: WASD Move, Space Pulse, L-Shift Tug</span>
                  <span className="mx-2.5 text-[#64748B]" aria-hidden="true">·</span>
                  <span>{names.luna}: Arrows Move, Enter Pulse, R-Shift Tug</span>
                  <span className="mx-2.5 text-[#64748B]" aria-hidden="true">·</span>
                  <span>Esc Pause</span>
                </>
              ) : (
                <>
                  <span>WASD / Arrows Move</span>
                  <span className="mx-2.5 text-[#64748B]" aria-hidden="true">·</span>
                  <span>Space Sync Pulse</span>
                  <span className="mx-2.5 text-[#64748B]" aria-hidden="true">·</span>
                  <span>Shift Tug</span>
                  <span className="mx-2.5 text-[#64748B]" aria-hidden="true">·</span>
                  <span>Esc Pause</span>
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {/* How to Play Modal on Title Screen */}
      {hud.gameState === GameState.TitleMenu && showHowToPlay && (
        <div className="absolute inset-0 bg-[#050A12]/80 flex items-center justify-center p-6 z-20">
          <div className="w-full max-w-lg bg-[#0F1B2D] border border-[#FDE68A]/25 rounded-2xl p-7 shadow-2xl">
            <h2 className="font-display text-balance text-2xl font-semibold text-[#F8FAFC] mb-2">
              Guide to the Silk Bond
            </h2>
            <p className="text-sm text-[#CBD5E1] leading-relaxed mb-5">
              You and your partner guide two kindred spirits linked by an elastic ribbon of starlight across five nocturnal sanctuaries.
            </p>

            <div className="space-y-3.5 text-sm text-[#E2E8F0] mb-6">
              <div>
                <span className="font-semibold text-[#FDE68A]">1. Clothesline &amp; Ignite: </span>
                <span>
                  Move apart to pull your silk tether taut. Sweep the glowing line through Spirit Lanterns to light them and slice drifting shadows in half.
                </span>
              </div>
              <div>
                <span className="font-semibold text-[#FECDD3]">2. Sync Resonance Novas: </span>
                <span>
                  Press Pulse (<span className="font-mono text-xs">Space</span> and <span className="font-mono text-xs">Enter</span>) together—or right as your partner&apos;s spark reaches you—to unleash a healing shockwave at the midpoint.
                </span>
              </div>
              <div>
                <span className="font-semibold text-[#6EE7B7]">3. Twin Seals &amp; Partner Saves: </span>
                <span>
                  Stand on Sun and Moon stone seals simultaneously to unseal Heart Lanterns. Use Tug (<span className="font-mono text-xs">Shift</span>) to yank your partner clear of red enemy telegraphs.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowHowToPlay(false)}
                className="min-h-[40px] px-4 py-2 rounded-lg border border-[#F8FAFC]/15 text-xs font-semibold text-[#E2E8F0] hover:bg-[#16253B] transition-colors whitespace-nowrap shrink-0"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleStartGame}
                className="min-h-[40px] px-5 py-2 rounded-lg bg-[#F59E0B] text-[#08101B] text-xs font-bold hover:bg-[#FBBF24] transition-colors whitespace-nowrap shrink-0"
              >
                Start Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PERIMETER GAMEPLAY HUD (>=88% Playfield Unobstructed, Zero Blur)
          ===================================================================== */}
      {hud.gameState !== GameState.TitleMenu && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:px-7 sm:py-5">
          {/* Top Perimeter Row */}
          <div className="flex items-start justify-between gap-4">
            {/* Top-Left: Shared Couple Bond Hearts + Harmony Pips */}
            <div className="bg-[#0B1422]/90 border border-[#F8FAFC]/10 rounded-xl px-3.5 py-2.5 flex items-center gap-3">
              <div className="flex items-center gap-1" aria-label={`Bond hearts: ${hud.hearts} of ${hud.maxHearts}`}>
                {Array.from({ length: hud.maxHearts }).map((_, idx) => (
                  <BondHeartSvg
                    key={idx}
                    filled={idx < hud.hearts}
                    strained={hud.hearts <= 1}
                  />
                ))}
              </div>
              <div className="text-xs text-[#CBD5E1] font-mono tabular-nums whitespace-nowrap">
                <span className="text-[#F8FAFC] font-semibold">
                  {hud.hearts}/{hud.maxHearts}
                </span>
                <span className="mx-1.5 text-[#64748B]" aria-hidden="true">·</span>
                <span>{bondStateLabel}</span>
                <span className="mx-1.5 text-[#64748B]" aria-hidden="true">·</span>
                <span className="text-[#6EE7B7]">Sync {hud.harmonyPips}/3</span>
              </div>
            </div>

            {/* Top-Center: Sanctuary Progress & Lantern Readout */}
            <div className="hidden md:flex flex-col items-center gap-1.5">
              <div className="bg-[#0B1422]/90 border border-[#F8FAFC]/10 rounded-xl px-4 py-2 flex items-center gap-2.5 text-xs text-[#CBD5E1] tabular-nums whitespace-nowrap">
                <span className="font-medium text-[#FDE68A]">
                  Sanctuary {hud.sanctuaryIndex}/{hud.totalSanctuaries}
                </span>
                <span className="text-[#64748B]" aria-hidden="true">·</span>
                <span className="text-[#F8FAFC] font-semibold">{hud.sanctuaryTitle}</span>
                <span className="text-[#64748B]" aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[#F8FAFC]">
                  <LanternHudSvg allLit={hud.lanternsLit >= hud.totalLanterns} />
                  <span>
                    Lanterns {hud.lanternsLit}/{hud.totalLanterns}
                  </span>
                </span>
                {hud.enemiesRemaining > 0 && (
                  <>
                    <span className="text-[#64748B]" aria-hidden="true">·</span>
                    <span className="font-mono text-[#FDA4AF]">
                      Shadows {hud.enemiesRemaining}
                    </span>
                  </>
                )}
              </div>

              {/* Boss Health Bar in Sanctuary 5 */}
              {hud.bossHpRatio !== null && hud.bossName && (
                <div className="w-72 bg-[#0B1422]/92 border border-[#FB7185]/30 rounded-lg px-3 py-1.5">
                  <div className="flex items-center justify-between text-[11px] text-[#FECDD3] mb-1 font-mono tabular-nums">
                    <span>{hud.bossName}</span>
                    <span>{Math.ceil(hud.bossHpRatio * 100)}%</span>
                  </div>
                  <svg viewBox="0 0 100 6" className="w-full h-1.5 rounded-full overflow-hidden" aria-hidden="true">
                    <rect x="0" y="0" width="100" height="6" rx="3" fill="#1E293B" />
                    <rect
                      x="0"
                      y="0"
                      width={Math.max(0, Math.min(100, hud.bossHpRatio * 100))}
                      height="6"
                      rx="3"
                      fill="#FB7185"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Top-Right: Score + Mute & Pause Controls */}
            <div className="flex items-center gap-2">
              <div className="bg-[#0B1422]/90 border border-[#F8FAFC]/10 rounded-xl px-3.5 py-2 text-xs font-mono tabular-nums text-[#CBD5E1] whitespace-nowrap">
                <span>Score </span>
                <span className="text-[#F8FAFC] font-semibold">
                  {hud.score.toLocaleString()}
                </span>
                {hud.syncStreak > 1 && (
                  <>
                    <span className="mx-1.5 text-[#64748B]" aria-hidden="true">·</span>
                    <span className="text-[#FDE68A] font-semibold">x{hud.syncStreak}</span>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => engineRef.current?.toggleMute()}
                aria-label={hud.isMuted ? 'Unmute audio (M)' : 'Mute audio (M)'}
                title="Mute / Unmute (M)"
                className="pointer-events-auto w-10 h-10 rounded-xl bg-[#0B1422]/90 border border-[#F8FAFC]/12 text-[#E2E8F0] hover:border-[#FDE68A]/45 flex items-center justify-center transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-[#FDE68A]"
              >
                <SoundIconSvg muted={hud.isMuted} />
              </button>

              <button
                type="button"
                onClick={() => engineRef.current?.togglePause()}
                aria-label="Pause game (Esc)"
                title="Pause (Esc)"
                className="pointer-events-auto w-10 h-10 rounded-xl bg-[#0B1422]/90 border border-[#F8FAFC]/12 text-[#E2E8F0] hover:border-[#FDE68A]/45 flex items-center justify-center transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-[#FDE68A]"
              >
                <PauseIconSvg />
              </button>
            </div>
          </div>

          {/* Bottom Perimeter Whisper Objective */}
          {hud.gameState === GameState.Playing && (
            <div className="flex justify-center">
              <p className="text-xs text-[#CBD5E1]/90 bg-[#0B1422]/80 border border-[#F8FAFC]/8 rounded-lg px-3.5 py-1.5 text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                {hud.objectiveHint}
              </p>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          PAUSE MODAL
          ===================================================================== */}
      {hud.gameState === GameState.Paused && (
        <div className="absolute inset-0 bg-[#050A12]/80 flex items-center justify-center p-6 z-30">
          <div className="w-full max-w-md bg-[#0F1B2D] border border-[#F8FAFC]/15 rounded-2xl p-8 text-center shadow-2xl">
            <p className="text-xs text-[#FDE68A] mb-1">
              Sanctuary {hud.sanctuaryIndex} of {hud.totalSanctuaries}
            </p>
            <h2 className="font-display text-balance text-2xl font-semibold text-[#F8FAFC] mb-2">
              Game Paused
            </h2>
            <p className="text-sm text-[#94A3B8] mb-6">{hud.sanctuaryTitle}</p>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => engineRef.current?.togglePause()}
                className="min-h-[44px] w-full px-5 py-2.5 rounded-xl bg-[#F59E0B] text-[#08101B] text-sm font-bold hover:bg-[#FBBF24] transition-colors whitespace-nowrap"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.restartCurrentSanctuary()}
                className="min-h-[44px] w-full px-5 py-2.5 rounded-xl bg-[#16253B] text-[#F1F5F9] text-sm font-semibold hover:bg-[#1E324F] transition-colors whitespace-nowrap"
              >
                Restart Sanctuary
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.returnToTitle()}
                className="min-h-[44px] w-full px-5 py-2.5 rounded-xl border border-[#F8FAFC]/12 text-[#CBD5E1] text-sm font-medium hover:text-[#F8FAFC] hover:border-[#F8FAFC]/25 transition-colors whitespace-nowrap"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SANCTUARY CLEARED / COUPLE SYNCHRONY SUMMARY MODAL
          ===================================================================== */}
      {hud.gameState === GameState.RoundSummary && hud.roundStats && (
        <div className="absolute inset-0 bg-[#050A12]/82 flex items-center justify-center p-6 z-30">
          <div className="w-full max-w-lg bg-[#0F1B2D] border border-[#6EE7B7]/30 rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-6">
              <p className="text-xs text-[#6EE7B7] mb-1">
                Sanctuary {hud.roundStats.sanctuaryIndex} Awakened
              </p>
              <h2 className="font-display text-balance text-3xl font-semibold text-[#F8FAFC]">
                {hud.roundStats.sanctuaryTitle}
              </h2>
            </div>

            {/* Real Synchrony Telemetry Grid (Single-level elevation, hairline dividers) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-[#F8FAFC]/10 mb-6 text-center font-mono tabular-nums">
              <div>
                <div className="text-lg font-semibold text-[#FDE68A]">
                  {hud.roundStats.tetherSlices}
                </div>
                <div className="text-[11px] font-sans text-[#94A3B8]">Tether Slices</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-[#FECDD3]">
                  {hud.roundStats.resonanceNovas}
                </div>
                <div className="text-[11px] font-sans text-[#94A3B8]">Synced Novas</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-[#6EE7B7]">
                  {hud.roundStats.partnerSaves}
                </div>
                <div className="text-[11px] font-sans text-[#94A3B8]">Partner Saves</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-[#F8FAFC]">
                  {hud.roundStats.clearTimeSeconds}s
                </div>
                <div className="text-[11px] font-sans text-[#94A3B8]">Clear Time</div>
              </div>
            </div>

            {/* Warm Couple Conversation Spark */}
            <div className="mb-7 text-center px-2">
              <p className="text-xs text-[#FDE68A] mb-1.5">
                Lantern Spark for {names.sol} &amp; {names.luna}
              </p>
              <p className="font-display text-balance text-base text-[#F1F5F9] leading-relaxed">
                &ldquo;{hud.roundStats.coupleSparkPrompt}&rdquo;
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => engineRef.current?.returnToTitle()}
                className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#F8FAFC]/12 text-xs font-medium text-[#CBD5E1] hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
              >
                Main Menu
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.advanceNextSanctuary()}
                className="min-h-[44px] flex-1 px-6 py-2.5 rounded-xl bg-[#F59E0B] text-[#08101B] text-sm font-bold hover:bg-[#FBBF24] transition-colors whitespace-nowrap"
              >
                Next Sanctuary
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          VICTORY MODAL (All 5 Sanctuaries Illuminated!)
          ===================================================================== */}
      {hud.gameState === GameState.Victory && (
        <div className="absolute inset-0 bg-[#050A12]/84 flex items-center justify-center p-6 z-30">
          <div className="w-full max-w-lg bg-[#0F1B2D] border border-[#FDE68A]/35 rounded-2xl p-8 text-center shadow-2xl">
            <p className="text-xs text-[#FDE68A] mb-1">
              All Five Twilight Sanctuaries Illuminated
            </p>
            <h2 className="font-display text-balance text-3xl font-semibold text-[#F8FAFC] mb-2">
              {names.sol} &amp; {names.luna}, Unbroken Light
            </h2>
            <p className="text-sm text-[#CBD5E1] leading-relaxed mb-6">
              Together you banished The Eclipse Weaver and restored warm starlight across every shrine in the garden.
            </p>

            <div className="grid grid-cols-3 gap-4 py-4 border-y border-[#F8FAFC]/10 mb-6 font-mono tabular-nums">
              <div>
                <div className="text-xl font-semibold text-[#FDE68A]">
                  {hud.score.toLocaleString()}
                </div>
                <div className="text-xs font-sans text-[#94A3B8]">Total Score</div>
              </div>
              <div>
                <div className="text-xl font-semibold text-[#FECDD3]">
                  {hud.hearts}/{hud.maxHearts}
                </div>
                <div className="text-xs font-sans text-[#94A3B8]">Bond Hearts</div>
              </div>
              <div>
                <div className="text-xl font-semibold text-[#6EE7B7]">
                  {hud.roundStats ? `${hud.roundStats.embraceSeconds}s` : '100%'}
                </div>
                <div className="text-xs font-sans text-[#94A3B8]">Close Embrace</div>
              </div>
            </div>

            {hud.roundStats && (
              <p className="font-display text-balance text-sm text-[#FDE68A] mb-6 leading-relaxed">
                &ldquo;{hud.roundStats.coupleSparkPrompt}&rdquo;
              </p>
            )}

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => engineRef.current?.returnToTitle()}
                className="min-h-[44px] px-5 py-2.5 rounded-xl border border-[#F8FAFC]/15 text-sm font-medium text-[#CBD5E1] hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
              >
                Main Menu
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.startNewGame()}
                className="min-h-[44px] px-7 py-2.5 rounded-xl bg-[#F59E0B] text-[#08101B] text-sm font-bold hover:bg-[#FBBF24] transition-colors whitespace-nowrap shrink-0"
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          GAME OVER MODAL
          ===================================================================== */}
      {hud.gameState === GameState.GameOver && (
        <div className="absolute inset-0 bg-[#050A12]/84 flex items-center justify-center p-6 z-30">
          <div className="w-full max-w-md bg-[#0F1B2D] border border-[#FB7185]/30 rounded-2xl p-8 text-center shadow-2xl">
            <p className="text-xs text-[#FDA4AF] mb-1">
              Sanctuary {hud.sanctuaryIndex} · {hud.sanctuaryTitle}
            </p>
            <h2 className="font-display text-balance text-3xl font-semibold text-[#F8FAFC] mb-2">
              Lanterns Dimmed
            </h2>
            <p className="text-sm text-[#CBD5E1] leading-relaxed mb-6">
              Tip: Sync your Pulse keys (<span className="font-mono text-xs">Space</span> + <span className="font-mono text-xs">Enter</span>) to trigger Resonance Novas and restore Bond Hearts.
            </p>

            <div className="py-3 border-y border-[#F8FAFC]/10 mb-6 font-mono tabular-nums text-sm text-[#CBD5E1]">
              <span>Score </span>
              <span className="text-[#F8FAFC] font-semibold">
                {hud.score.toLocaleString()}
              </span>
              <span className="mx-2 text-[#64748B]" aria-hidden="true">·</span>
              <span>
                Lanterns {hud.lanternsLit}/{hud.totalLanterns}
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => engineRef.current?.restartCurrentSanctuary()}
                className="min-h-[44px] w-full px-6 py-2.5 rounded-xl bg-[#F59E0B] text-[#08101B] text-sm font-bold hover:bg-[#FBBF24] transition-colors whitespace-nowrap"
              >
                Retry Sanctuary
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.startNewGame()}
                className="min-h-[44px] w-full px-6 py-2.5 rounded-xl bg-[#16253B] text-[#F1F5F9] text-sm font-semibold hover:bg-[#1E324F] transition-colors whitespace-nowrap"
              >
                Play Again from Sanctuary 1
              </button>
              <button
                type="button"
                onClick={() => engineRef.current?.returnToTitle()}
                className="min-h-[44px] w-full px-6 py-2.5 rounded-xl border border-[#F8FAFC]/12 text-sm font-medium text-[#CBD5E1] hover:text-[#F8FAFC] transition-colors whitespace-nowrap"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
