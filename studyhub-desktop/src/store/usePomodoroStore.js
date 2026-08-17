import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── BroadcastChannel: real-time sync across Electron windows ───────────────
let _channel = null;
let _isSyncing = false; // guard to prevent echo loops

function getChannel() {
  if (!_channel && typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    _channel = new BroadcastChannel('studyhub-pomodoro-v1');
  }
  return _channel;
}

function broadcast(partialState) {
  if (_isSyncing) return;
  getChannel()?.postMessage({ type: 'SYNC', state: partialState });
}

// Internal tick loop (not persisted)
let _tickInterval = null;
function _startInternalTick(get) {
  if (_tickInterval) return;
  _tickInterval = setInterval(() => {
    try {
      const res = get().syncTick();
      // do nothing with res; syncTick handles transitions
    } catch (e) {
      console.error('Pomodoro internal tick error', e);
    }
  }, 1000);
}
function _stopInternalTick() {
  if (_tickInterval) {
    clearInterval(_tickInterval);
    _tickInterval = null;
  }
}

// ─── Store ───────────────────────────────────────────────────────────────────
export const usePomodoroStore = create(
  persist(
    (set, get) => ({
      mode: 'focus', // 'focus' | 'shortBreak' | 'longBreak'
      focusTime: 25,
      shortBreakTime: 5,
      longBreakTime: 15,
      // Number of focus sessions before a long break occurs
      cyclesBeforeLongBreak: 4,
      pomodorosCompleted: 0,

      timeLeft: 25 * 60,
      endTime: null,
      isActive: false,

      selectedTasks: [],

      activeSound: 'none',
      soundVolume: 0.5,
      youtubeUrl: '',
      youtubePlaying: true,
      youtubeStartTime: 0,
      audioCurrentTime: 0,
      audioDuration: 0,

      // Internal: timestamp of last phase transition (prevents double-fire
      // when both windows have a timer running simultaneously)
      _lastTransitionAt: 0,
      lastCompletion: null,

      // ── helpers ──────────────────────────────────────────────────────────
      setActiveSound: (sound) => {
        set({ activeSound: sound });
        broadcast({ activeSound: sound });
      },

      setSoundVolume: (volume) => {
        set({ soundVolume: volume });
        broadcast({ soundVolume: volume });
      },

      setYoutubeUrl: (url) => {
        set({ youtubeUrl: url, youtubePlaying: true });
        broadcast({ youtubeUrl: url, youtubePlaying: true });
      },

      setYoutubePlaying: (playing) => {
        set({ youtubePlaying: playing });
        broadcast({ youtubePlaying: playing });
      },

      setYoutubeStartTime: (seconds) => {
        set({ youtubeStartTime: seconds, audioCurrentTime: seconds });
        broadcast({ youtubeStartTime: seconds, audioCurrentTime: seconds });
      },

      setAudioTime: (currentTime, duration) => {
        set({ audioCurrentTime: currentTime, ...(duration ? { audioDuration: duration } : {}) });
      },

      setMode: (mode) => {
        const state = get();
        let minutes = state.focusTime;
        if (mode === 'shortBreak') minutes = state.shortBreakTime;
        if (mode === 'longBreak')  minutes = state.longBreakTime;
        const next = { mode, timeLeft: minutes * 60, isActive: false, endTime: null };
        set(next);
        broadcast(next);
      },

      updateSettings: (settings) => {
        set({ ...settings });
        const state = get();
        if (!state.isActive) state.setMode(state.mode);
      },

      startTimer: () => {
        const state = get();
        if (state.isActive) return;
        const endTime = Date.now() + state.timeLeft * 1000;
        const next = { isActive: true, endTime };
        set(next);
        broadcast(next);
        // Start an internal tick loop so transitions occur even if AppShell
        // effect didn't register or was paused. This loop is not persisted.
        _startInternalTick(get);
      },

      pauseTimer: () => {
        const state = get();
        if (!state.isActive) return;
        const timeLeft = Math.max(0, Math.round((state.endTime - Date.now()) / 1000));
        const next = { isActive: false, endTime: null, timeLeft };
        set(next);
        broadcast(next);
        // stop internal tick loop when paused
        _stopInternalTick();
      },

      resetTimer: () => {
        get().setMode(get().mode);
        // ensure internal tick is stopped after a reset
        _stopInternalTick();
      },

      // Skip the current phase and transition immediately as if the timer reached 0.
      // This is used by UI "Pular" buttons so the same transition logic occurs.
      skipPhase: () => {
        const state = get();
        const transitionAt = Date.now();
        const completedPhase = state.mode;
        const completion = {
          id: `pomodoro-${transitionAt}`,
          phase: completedPhase,
          at: transitionAt,
        };

        if (completedPhase === 'focus') {
          const completed = state.pomodorosCompleted + 1;
          const cycles = Number(state.cyclesBeforeLongBreak) || 4;
          const nextMode = completed % cycles === 0 ? 'longBreak' : 'shortBreak';
          
          try {
            const focusMinutes = Number(state.focusTime) || 25;
            const durationSeconds = focusMinutes * 60;
            const { useStudyStore } = require('./useStore');
            if (useStudyStore?.getState?.()?.addFocusSession) {
              useStudyStore.getState().addFocusSession({
                id: `focus-${transitionAt}`,
                status: 'completed',
                plannedSeconds: durationSeconds,
                actualSeconds: durationSeconds,
                durationMinutes: focusMinutes,
                startedAt: transitionAt - (durationSeconds * 1000),
                completedAt: transitionAt,
                taskId: state.selectedTasks[0] || null,
                mode: 'focus',
              });
            }
          } catch (err) {
            console.error('Failed to add focus session:', err);
          }

          set({ pomodorosCompleted: completed, _lastTransitionAt: transitionAt, lastCompletion: completion });
          broadcast({ pomodorosCompleted: completed, _lastTransitionAt: transitionAt, lastCompletion: completion });
          state.setMode(nextMode);
          get().startTimer();
        } else {
          set({ _lastTransitionAt: transitionAt, lastCompletion: completion });
          broadcast({ _lastTransitionAt: transitionAt, lastCompletion: completion });
          state.setMode('focus');
          get().startTimer();
        }
        return true;
      },

      syncTick: () => {
        const state = get();
        if (!state.isActive || !state.endTime) return false;

        const remaining = Math.max(0, Math.round((state.endTime - Date.now()) / 1000));

        if (remaining === 0) {
          // Guard: prevent double-transition when multiple windows tick at once
          if (Date.now() - (state._lastTransitionAt || 0) < 3000) return false;

          // Delegate to skipPhase which performs the transition consistently
          return get().skipPhase();
        }

        // Keep every Electron window aligned. This is intentionally limited to
        // the timer fields so the main screen and the floating widget cannot
        // drift when either one starts or pauses the session.
        set({ timeLeft: remaining });
        broadcast({ timeLeft: remaining, endTime: state.endTime, isActive: true });
        return false;
      },


      toggleTaskSelection: (taskId) => {
        set((s) => ({
          selectedTasks: s.selectedTasks.includes(taskId)
            ? s.selectedTasks.filter((id) => id !== taskId)
            : [...s.selectedTasks, taskId],
        }));
      },

      clearSelectedTasks: () => set({ selectedTasks: [] }),
    }),
    {
      name: 'pomodoro-storage',
      // When the store hydrates, register the BroadcastChannel listener
      onRehydrateStorage: () => () => {
        if (typeof window === 'undefined') return;

        const ch = getChannel();
        if (!ch) return;

        ch.onmessage = (e) => {
          if (e.data?.type !== 'SYNC') return;
          _isSyncing = true;
          usePomodoroStore.setState(e.data.state);
          _isSyncing = false;
        };

        // If the hydrated state indicates an active timer, resume the internal
        // tick loop so the app continues to transition phases even if the
        // AppShell effect isn't mounted yet.
        try {
          const curr = usePomodoroStore.getState();
          if (curr?.isActive && curr?.endTime) {
            _startInternalTick(() => usePomodoroStore.getState());
          }
        } catch (e) {
          // ignore
        }
      },
    }
  )
);
