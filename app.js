/* ============================================
   POMOSIVE APP
   Adaptive Pomodoro Timer
   ============================================ */

// ============================================
// AUDIO ENGINE
// ============================================

const AudioEngine = {
  ctx: null,

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  playTone(freq, duration, type = 'sine', volume = 0.3) {
    if (!Settings.soundEnabled) return;
    this.init();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + duration);
  },

  playStart() {
    this.playTone(523.25, 0.15, 'sine', 0.2);
    setTimeout(() => this.playTone(659.25, 0.15, 'sine', 0.2), 120);
  },

  playEnd() {
    this.playTone(659.25, 0.2, 'sine', 0.25);
    setTimeout(() => this.playTone(523.25, 0.3, 'sine', 0.25), 150);
    setTimeout(() => this.playTone(392.00, 0.5, 'sine', 0.2), 350);
  },

  playBreak() {
    this.playTone(440, 0.15, 'sine', 0.2);
    setTimeout(() => this.playTone(554.37, 0.15, 'sine', 0.2), 120);
    setTimeout(() => this.playTone(659.25, 0.3, 'sine', 0.2), 240);
  },

  playTick() {
    if (!Settings.soundEnabled) return;
    this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.02, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.03);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.03);
  },

  playOvertime() {
    this.playTone(300, 0.1, 'square', 0.05);
  }
};

// ============================================
// ADAPTIVE MATH
// ============================================

const MIN_BLOCK = 5;
const MAX_BLOCK = 90;
const MAX_DAILY_WORK = 240; // 4 hours
const MAX_DAILY_FLOW = 180; // 3 hours

function calcNextBlock(prevDuration, rating, totalDailyWork) {
  let next = MIN_BLOCK;

  switch (rating) {
    case 'distracted':
      next = Math.max(Math.ceil(prevDuration * 0.5), MIN_BLOCK);
      break;
    case 'okay':
      next = Math.min(Math.ceil(prevDuration * 1.5), MAX_BLOCK);
      break;
    case 'focused':
      next = Math.min(Math.ceil(prevDuration * 2), MAX_BLOCK);
      break;
    case 'flow':
      next = Math.min(Math.ceil(prevDuration * 2), MAX_BLOCK);
      break;
  }

  // Cap by remaining daily work
  const remaining = MAX_DAILY_WORK - totalDailyWork;
  if (next > remaining && remaining >= MIN_BLOCK) {
    next = remaining;
  }

  return Math.max(next, MIN_BLOCK);
}

function calcBreakDuration(workDuration, rating) {
  switch (rating) {
    case 'distracted':
      return Math.min(Math.ceil(workDuration * 0.33), 30);
    case 'okay':
      return Math.min(Math.ceil(workDuration * 0.33), 30);
    case 'focused':
      if (workDuration < 45) return 0;
      return Math.min(Math.ceil(workDuration * 0.2), 15);
    case 'flow':
      if (workDuration < 60) return 0;
      return Math.min(Math.ceil(workDuration * 0.25), 20);
    default:
      return Math.min(Math.ceil(workDuration * 0.33), 30);
  }
}

function getRatingColor(rating) {
  const colors = {
    distracted: '#ffffff',
    okay: '#f39c12',
    focused: '#3498db',
    flow: '#27ae60'
  };
  return colors[rating] || '#a0a0b0';
}

function getRatingLabel(rating) {
  const labels = {
    distracted: 'Distracted',
    okay: 'Okay-ish',
    focused: 'Focused',
    flow: 'Flow'
  };
  return labels[rating] || rating;
}

// ============================================
// TIMER STATE MACHINE
// ============================================

const TimerState = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  OVERTIME: 'overtime',
  RATING: 'rating',
  BREAK: 'break',
  BREAK_RUNNING: 'break_running',
  BREAK_PAUSED: 'break_paused'
};

const App = {
  state: TimerState.IDLE,
  phase: 'work', // 'work' or 'break'

  // Timer values (in seconds)
  totalDuration: 0,
  remaining: 0,
  overtime: 0,

  // Session tracking
  currentSession: null,
  currentBreak: null,
  lastRating: 'okay',
  lastBlockDuration: 25,

  // Intervals
  timerInterval: null,
  tickInterval: null,
  lastTickSecond: -1,
  _lastOtSecond: -1,

  // DOM refs
  els: {},

  init() {
    this.cacheElements();
    this.bindEvents();
    this.loadTheme();
    this.checkNewDay();
    this.updateUI();
    this.renderSessionsList();
    this.updateStats();
    initChart();
    updateChart('today', 'bar');

    // Show setup on first run
    if (!LS.get('pomosive_setup_done')) {
      this.showSetup();
    }

    // Update title
    this.updateTitle();
  },

  cacheElements() {
    this.els = {
      timerContainer: document.querySelector('.timer-container'),
      timerPhase: document.getElementById('timerPhase'),
      timerTime: document.getElementById('timerTime'),
      timerOvertime: document.getElementById('timerOvertime'),
      timerProgress: document.getElementById('timerProgress'),
      playBtn: document.getElementById('playBtn'),
      pauseBtn: document.getElementById('pauseBtn'),
      resetBtn: document.getElementById('resetBtn'),
      skipBtn: document.getElementById('skipBtn'),
      blockDuration: document.getElementById('blockDuration'),
      blockInput: document.getElementById('blockInput'),
      breakDuration: document.getElementById('breakDuration'),
      todayTotal: document.getElementById('todayTotal'),
      streakCount: document.getElementById('streakCount'),
      ratingOverlay: document.getElementById('ratingOverlay'),
      setupOverlay: document.getElementById('setupOverlay'),
      ratingSubtitle: document.getElementById('ratingSubtitle'),
      sessionNote: document.getElementById('sessionNote'),
      continueBtn: document.getElementById('continueBtn'),
      soundToggle: document.getElementById('soundToggle'),
      themeToggle: document.getElementById('themeToggle'),
      dataBtn: document.getElementById('dataBtn'),
      dataModal: document.getElementById('dataModal'),
      modalClose: document.getElementById('modalClose'),
      exportJson: document.getElementById('exportJson'),
      exportCsv: document.getElementById('exportCsv'),
      exportMd: document.getElementById('exportMd'),
      importFile: document.getElementById('importFile'),
      importBtn: document.getElementById('importBtn'),
      clearData: document.getElementById('clearData'),
      sessionsList: document.getElementById('sessionsList'),
      shortcutsHint: document.getElementById('shortcutsHint'),
      statsTabs: document.querySelectorAll('.stats-tab'),
      ratingBtns: document.querySelectorAll('.rating-btn'),
      presetBtns: document.querySelectorAll('.preset-btn'),
      customDuration: document.getElementById('customDuration'),
      soundSetting: document.getElementById('soundSetting'),
      startFirstSession: document.getElementById('startFirstSession'),
      statTotalTime: document.getElementById('statTotalTime'),
      statSessions: document.getElementById('statSessions'),
      statAvgRating: document.getElementById('statAvgRating'),
      statBestBlock: document.getElementById('statBestBlock'),
    };
  },

  bindEvents() {
    // Timer controls
    this.els.playBtn.addEventListener('click', () => this.play());
    this.els.pauseBtn.addEventListener('click', () => this.pause());
    this.els.resetBtn.addEventListener('click', () => this.reset());
    this.els.skipBtn.addEventListener('click', () => this.skip());

    // Rating
    this.els.ratingBtns.forEach(btn => {
      btn.addEventListener('click', () => this.selectRating(btn.dataset.rating));
    });
    this.els.continueBtn.addEventListener('click', () => this.continueAfterRating());

    // Setup
    this.els.presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.els.presetBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.els.customDuration.value = btn.dataset.min;
      });
    });
    this.els.startFirstSession.addEventListener('click', () => this.startFirstSession());

    // Header buttons
    this.els.soundToggle.addEventListener('click', () => this.toggleSound());
    this.els.themeToggle.addEventListener('click', () => this.toggleTheme());
    this.els.dataBtn.addEventListener('click', () => this.showDataModal());

    // Modal
    this.els.modalClose.addEventListener('click', () => this.hideDataModal());
    this.els.exportJson.addEventListener('click', () => this.exportData('json'));
    this.els.exportCsv.addEventListener('click', () => this.exportData('csv'));
    this.els.exportMd.addEventListener('click', () => this.exportData('md'));
    this.els.importBtn.addEventListener('click', () => this.els.importFile.click());
    this.els.importFile.addEventListener('change', (e) => this.importData(e));
    this.els.clearData.addEventListener('click', () => this.clearAllData());

    // Stats tabs
    this.els.statsTabs.forEach(tab => {
      tab.addEventListener('click', () => this.switchStatsView(tab.dataset.view));
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeydown(e));

    // Visibility change
    document.addEventListener('visibilitychange', () => this.handleVisibility());

    // Click outside modal
    this.els.dataModal.addEventListener('click', (e) => {
      if (e.target === this.els.dataModal) this.hideDataModal();
    });

    // Block duration input - click to edit
    const blockWrapper = document.getElementById('blockInputWrapper');
    if (blockWrapper && this.els.blockInput) {
      blockWrapper.addEventListener('click', (e) => {
        if (this.state !== TimerState.IDLE) return;
        if (e.target === this.els.blockInput) return;
        this.els.blockDuration.style.display = 'none';
        this.els.blockInput.style.display = 'block';
        this.els.blockInput.value = this.lastBlockDuration;
        this.els.blockInput.focus();
        this.els.blockInput.select();
      });

      this.els.blockInput.addEventListener('blur', () => {
        const val = parseInt(this.els.blockInput.value);
        if (val && val >= 1 && val <= 90) {
          this.lastBlockDuration = val;
          Settings.lastBlockDuration = val;
          this.els.blockDuration.textContent = `${val} min`;
        }
        this.els.blockInput.style.display = 'none';
        this.els.blockDuration.style.display = 'block';
      });

      this.els.blockInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.els.blockInput.blur();
        }
      });
    }

    // Sound init on first interaction
    document.addEventListener('click', () => AudioEngine.init(), { once: true });
  },

  // ============================================
  // TIMER LOGIC
  // ============================================

  play() {
    if (this.state === TimerState.IDLE) {
      this.startWork();
    } else if (this.state === TimerState.PAUSED) {
      this.resume();
    } else if (this.state === TimerState.BREAK_PAUSED) {
      this.resumeBreak();
    }
  },

  startWork() {
    const duration = this.lastBlockDuration;
    this.totalDuration = duration * 60;
    this.remaining = this.totalDuration;
    this.overtime = 0;
    this._lastOtSecond = -1;
    this.phase = 'work';
    this.state = TimerState.RUNNING;
    this.timerStartTime = Date.now();
    this.timerInterval = null;

    this.currentSession = {
      id: generateId(),
      startedAt: new Date().toISOString(),
      date: getDateString(),
      duration: 0,
      intendedDuration: duration * 60,
      rating: null,
      type: 'work',
      previousBlockDuration: this.lastBlockDuration,
      note: '',
      overtime: 0
    };

    Settings.updateStreak();
    AudioEngine.playStart();
    this.startTimer();
    this.updateUI();
    this.updateTitle();
    showToast('Work session started', 'info');
  },

  startBreak() {
    const breakDuration = calcBreakDuration(this.lastBlockDuration, this.lastRating);

    if (breakDuration <= 0) {
      // No break needed, go straight to next work
      this.state = TimerState.IDLE;
      this.overtime = 0;
      this.phase = 'work';
      this.updateUI();
      showToast('No break needed. Ready for next session.', 'success');
      return;
    }

    this.totalDuration = breakDuration * 60;
    this.remaining = this.totalDuration;
    this.overtime = 0;
    this.phase = 'break';
    this.state = TimerState.BREAK_RUNNING;
    this.overtime = 0;
    this._lastOtSecond = -1;
    this.timerStartTime = Date.now();
    this.timerInterval = null;

    this.currentBreak = {
      id: generateId(),
      startedAt: new Date().toISOString(),
      date: getDateString(),
      duration: 0,
      intendedDuration: breakDuration * 60,
      type: 'break',
      previousBlockDuration: this.lastBlockDuration
    };

    AudioEngine.playBreak();
    this.startTimer();
    this.updateUI();
    this.updateTitle();
    showToast(`Break started: ${breakDuration} min`, 'success');
  },

  startTimer() {
    this.lastTickSecond = -1;
    this._lastOtSecond = -1;
    this.timerStartTime = Date.now();
    this.timerInterval = setInterval(() => this.tick(), 100);
  },

  tick() {
    const now = Date.now();

    if (this.state === TimerState.RUNNING || this.state === TimerState.BREAK_RUNNING) {
      const elapsed = (now - this.timerStartTime) / 1000;
      this.remaining = Math.max(0, this.totalDuration - elapsed);

      if (this.phase === 'work' && this.currentSession) {
        this.currentSession.duration = elapsed;
      } else if (this.phase === 'break' && this.currentBreak) {
        this.currentBreak.duration = elapsed;
      }

      const currentSecond = Math.floor(this.remaining);
      if (currentSecond !== this.lastTickSecond && currentSecond <= 5 && currentSecond > 0) {
        AudioEngine.playTick();
        this.lastTickSecond = currentSecond;
      }

      if (this.remaining <= 0) {
        this.handleTimerEnd();
        return;
      }

      this.updateTimerDisplay();
      this.updateProgressRing();
      this.updateTitle();
    } else if (this.state === TimerState.OVERTIME || this.state === TimerState.BREAK_OVERTIME) {
      const elapsed = (now - this.timerStartTime) / 1000;
      this.overtime = Math.max(0, elapsed - this.totalDuration);

      if (this.phase === 'work' && this.currentSession) {
        this.currentSession.overtime = this.overtime;
        this.currentSession.duration = this.totalDuration + this.overtime;
      } else if (this.phase === 'break' && this.currentBreak) {
        this.currentBreak.overtime = this.overtime;
        this.currentBreak.duration = this.totalDuration + this.overtime;
      }

      const otSecond = Math.floor(this.overtime);
      if (otSecond !== this._lastOtSecond && otSecond > 0 && otSecond % 5 === 0) {
        AudioEngine.playOvertime();
        this._lastOtSecond = otSecond;
      }

      this.updateTimerDisplay();
      this.updateProgressRing();
      this.updateTitle();
    }
  },

  handleTimerEnd() {
    if (this.phase === 'work') {
      this.state = TimerState.OVERTIME;
      this.overtime = 0;
      this.remaining = 0;
      AudioEngine.playEnd();
      showToast('Work block complete! Keep going or rate your session.', 'warning');

      if (this.currentSession) {
        this.currentSession.duration = Math.round(this.currentSession.duration);
        Storage.saveSession({ ...this.currentSession });
      }

      this.updateUI();
      this.updateTitle();
    } else {
      this.state = TimerState.BREAK_OVERTIME;
      this.overtime = 0;
      this.remaining = 0;
      AudioEngine.playEnd();
      showToast('Break over! Ready to work.', 'info');

      if (this.currentBreak) {
        this.currentBreak.duration = Math.round(this.currentBreak.duration);
        Storage.saveSession({ ...this.currentBreak });
      }

      this.updateUI();
      this.updateTitle();
    }
  },

  showRatingOverlay() {
    const duration = Math.round(this.currentSession?.duration || 0);
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    this.els.ratingSubtitle.textContent = `You worked for ${timeStr}`;
    this.els.sessionNote.value = '';
    this.els.ratingBtns.forEach(btn => btn.classList.remove('selected'));
    this.selectedRating = null;

    this.els.ratingOverlay.classList.add('active');
    this.els.sessionNote.focus();
  },

  hideRatingOverlay() {
    this.els.ratingOverlay.classList.remove('active');
  },

  selectRating(rating) {
    this.selectedRating = rating;
    this.els.ratingBtns.forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.rating === rating);
    });
  },

  async continueAfterRating() {
    if (!this.selectedRating) {
      showToast('Please select a rating', 'warning');
      return;
    }

    const rating = this.selectedRating;
    const note = this.els.sessionNote.value.trim();

    // Update session
    if (this.currentSession) {
      this.currentSession.rating = rating;
      this.currentSession.note = note;
      this.currentSession.duration = Math.round(this.currentSession.duration);
      this.currentSession.overtime = Math.round(this.overtime);
      await Storage.saveSession({ ...this.currentSession });
    }

    this.lastRating = rating;

    // Update consecutive distracted counter
    if (rating === 'distracted') {
      Settings.consecutiveDistracted = Settings.consecutiveDistracted + 1;
    } else {
      Settings.consecutiveDistracted = 0;
    }

    // Update daily stats
    const sessionDuration = this.currentSession?.duration || 0;
    Settings.dailyWorkTime = Settings.dailyWorkTime + sessionDuration;
    if (rating === 'flow') {
      Settings.dailyFlowTime = Settings.dailyFlowTime + sessionDuration;
    }

    // Calculate next block using TOTAL session time (including overtime)
    const totalSessionMinutes = Math.ceil((this.currentSession?.duration || this.lastBlockDuration * 60) / 60);
    const nextBlock = calcNextBlock(
      totalSessionMinutes,
      rating,
      Settings.dailyWorkTime / 60
    );
    this.lastBlockDuration = nextBlock;
    Settings.lastBlockDuration = nextBlock;

    this.hideRatingOverlay();

    // Check burnout warnings
    if (Settings.consecutiveDistracted >= 3) {
      showToast('You seem distracted. Consider taking a longer break or stopping for today.', 'warning');
    }
    if (Settings.dailyFlowTime / 60 > MAX_DAILY_FLOW) {
      showToast('You have been in flow for over 3 hours today. Be careful not to burn out.', 'warning');
    }

    this.currentSession = null;
    this.overtime = 0;
    this._lastOtSecond = -1;

    // Start break
    this.startBreak();

    this.renderSessionsList();
    this.updateStats();
    updateChart(document.querySelector('.stats-tab.active')?.dataset.view || 'today', 'bar');
  },

  // ============================================
  // SETUP
  // ============================================

  showSetup() {
    this.els.setupOverlay.classList.add('active');
  },

  hideSetup() {
    this.els.setupOverlay.classList.remove('active');
  },

  startFirstSession() {
    const duration = parseInt(this.els.customDuration.value) || 25;
    if (duration < 1 || duration > 90) {
      showToast('Please enter a duration between 1 and 90 minutes', 'warning');
      return;
    }

    Settings.soundEnabled = this.els.soundSetting.checked;
    this.lastBlockDuration = duration;
    Settings.lastBlockDuration = duration;
    LS.set('pomosive_setup_done', true);

    this.hideSetup();
    this.startWork();
  },

  // ============================================
  // UI UPDATES
  // ============================================

  updateUI() {
    const isRunning = this.state === TimerState.RUNNING || this.state === TimerState.BREAK_RUNNING;
    const isPaused = this.state === TimerState.PAUSED || this.state === TimerState.BREAK_PAUSED;
    const isIdle = this.state === TimerState.IDLE;
    const isOvertime = this.state === TimerState.OVERTIME;

    // Buttons
    this.els.playBtn.disabled = isRunning || isOvertime;
    this.els.pauseBtn.disabled = !isRunning;
    this.els.resetBtn.disabled = isIdle && !isOvertime;
    this.els.skipBtn.disabled = isIdle;

    // Play button state
    if (isPaused) {
      this.els.playBtn.innerHTML = `
        <svg class="control-icon" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <span>Resume</span>
      `;
    } else {
      this.els.playBtn.innerHTML = `
        <svg class="control-icon" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <span>Start</span>
      `;
    }

    // Timer container classes
    this.els.timerContainer.classList.toggle('break', this.phase === 'break');
    this.els.timerContainer.classList.toggle('overtime', isOvertime);

    // Phase label
    if (isOvertime) {
      this.els.timerPhase.textContent = 'Overtime';
    } else if (this.phase === 'break') {
      this.els.timerPhase.textContent = 'Break';
    } else if (isRunning || isPaused) {
      this.els.timerPhase.textContent = 'Focus';
    } else {
      this.els.timerPhase.textContent = 'Ready';
    }

    // Timer display
    this.updateTimerDisplay();
    this.updateProgressRing();

    // Info
    const nextBreak = calcBreakDuration(this.lastBlockDuration, this.lastRating);
    this.els.blockDuration.textContent = `${this.lastBlockDuration} min`;
    this.els.breakDuration.textContent = nextBreak > 0 ? `${nextBreak} min` : 'None';
    this.els.todayTotal.textContent = `${Math.round(Settings.dailyWorkTime / 60)} min`;
    this.els.streakCount.textContent = `${Settings.streak} day${Settings.streak !== 1 ? 's' : ''}`;

    // Sound toggle
    this.els.soundToggle.classList.toggle('active', Settings.soundEnabled);
  },

  updateTimerDisplay() {
    let totalSeconds;
    if (this.state === TimerState.OVERTIME || this.state === TimerState.BREAK_OVERTIME) {
      totalSeconds = Math.max(1, Math.ceil(this.overtime));
      this.els.timerTime.textContent = this.formatTime(totalSeconds);
      this.els.timerOvertime.textContent = `+${this.formatTime(totalSeconds)} overtime`;
      this.els.timerOvertime.classList.add('visible');
    } else if (this.state === TimerState.PAUSED && this.overtime > 0) {
      totalSeconds = Math.max(1, Math.ceil(this.overtime));
      this.els.timerTime.textContent = this.formatTime(totalSeconds);
      this.els.timerOvertime.textContent = `+${this.formatTime(totalSeconds)} (paused)`;
      this.els.timerOvertime.classList.add('visible');
    } else {
      totalSeconds = Math.max(0, Math.ceil(this.remaining));
      this.els.timerTime.textContent = this.formatTime(totalSeconds);
      this.els.timerOvertime.classList.remove('visible');
    }
  },

  updateProgressRing() {
    const circumference = 339.292;
    let progress;

    if (this.state === TimerState.OVERTIME || this.state === TimerState.BREAK_OVERTIME) {
      progress = 0;
    } else if (this.totalDuration > 0) {
      progress = (this.remaining / this.totalDuration) * circumference;
    } else {
      progress = circumference;
    }

    this.els.timerProgress.style.strokeDashoffset = Math.max(0, progress);
  },

  formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  },

  updateTitle() {
    if (this.state === TimerState.RUNNING || this.state === TimerState.PAUSED) {
      const time = this.formatTime(Math.max(0, Math.ceil(this.remaining)));
      const icon = this.phase === 'break' ? '☕' : '⏱';
      document.title = `${icon} ${time} — Pomosive`;
    } else if (this.state === TimerState.OVERTIME) {
      const time = this.formatTime(Math.floor(this.overtime));
      document.title = `+${time} overtime — Pomosive`;
    } else if (this.state === TimerState.BREAK_OVERTIME) {
      const time = this.formatTime(Math.floor(this.overtime));
      document.title = `+${time} break overtime — Pomosive`;
    } else if (this.state === TimerState.BREAK_RUNNING || this.state === TimerState.BREAK_PAUSED) {
      const time = this.formatTime(Math.max(0, Math.ceil(this.remaining)));
      document.title = `☕ ${time} break — Pomosive`;
    } else {
      document.title = 'Pomosive';
    }
  },

  // ============================================
  // STATS & SESSIONS
  // ============================================

  async renderSessionsList() {
    const sessions = await Storage.getTodaySessions();
    const workSessions = sessions.filter(s => s.type === 'work').reverse();

    if (workSessions.length === 0) {
      this.els.sessionsList.innerHTML = `
        <h3 class="sessions-title">Recent Sessions</h3>
        <div class="sessions-empty">No sessions yet today</div>
      `;
      return;
    }

    const ratingSvgs = {
      distracted: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
      okay: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="15" x2="16" y2="15"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/></svg>`,
      focused: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
      flow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`
    };

    let html = '<h3 class="sessions-title">Recent Sessions</h3>';

    for (const s of workSessions) {
      const startTime = new Date(s.startedAt);
      const timeStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const durationMin = Math.round(s.duration / 60);
      const overtimeMin = s.overtime ? Math.round(s.overtime / 60) : 0;
      const durationStr = overtimeMin > 0 ? `${durationMin}m (+${overtimeMin}m)` : `${durationMin}m`;
      const rating = s.rating || 'okay';

      html += `
        <div class="session-item">
          <div class="session-rating session-rating--${rating}">
            ${ratingSvgs[rating] || ratingSvgs.okay}
          </div>
          <div class="session-details">
            <div class="session-time">${timeStr}</div>
            ${s.note ? `<div class="session-note">${escapeHtml(s.note)}</div>` : ''}
          </div>
          <div class="session-meta">
            <div class="session-duration">${durationStr}</div>
            <div class="session-type">${getRatingLabel(rating)}</div>
          </div>
        </div>
      `;
    }

    this.els.sessionsList.innerHTML = html;
  },

  async updateStats() {
    const today = await Storage.getTodaySessions();
    const workToday = today.filter(s => s.type === 'work');

    const totalSeconds = workToday.reduce((sum, s) => sum + s.duration, 0);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    this.els.statTotalTime.textContent = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    this.els.statSessions.textContent = workToday.length;

    const rated = workToday.filter(s => s.rating);
    if (rated.length > 0) {
      const ratingScores = { distracted: 1, okay: 2, focused: 3, flow: 4 };
      const avg = rated.reduce((sum, s) => sum + (ratingScores[s.rating] || 2), 0) / rated.length;
      const labels = ['', 'Distracted', 'Okay-ish', 'Focused', 'Flow'];
      this.els.statAvgRating.textContent = labels[Math.round(avg)] || 'Okay-ish';
    } else {
      this.els.statAvgRating.textContent = '--';
    }

    const best = workToday.reduce((max, s) => Math.max(max, s.duration), 0);
    this.els.statBestBlock.textContent = best > 0 ? `${Math.round(best / 60)}m` : '--';
  },

  switchStatsView(view) {
    this.els.statsTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === view);
    });
    updateChart(view, 'bar');
  },

  // ============================================
  // THEME & SETTINGS
  // ============================================

  loadTheme() {
    const isDark = Settings.darkMode;
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('light', !isDark);
  },

  toggleTheme() {
    const isDark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('light', !isDark);
    Settings.darkMode = isDark;

    // Redraw chart with new colors
    const activeView = document.querySelector('.stats-tab.active')?.dataset.view || 'today';
    setTimeout(() => updateChart(activeView, 'bar'), 50);
  },

  toggleSound() {
    Settings.soundEnabled = !Settings.soundEnabled;
    this.els.soundToggle.classList.toggle('active', Settings.soundEnabled);
    AudioEngine.init();
    showToast(Settings.soundEnabled ? 'Sound enabled' : 'Sound muted', 'info');
  },

  // ============================================
  // DATA MANAGEMENT
  // ============================================

  showDataModal() {
    this.els.dataModal.classList.add('active');
  },

  hideDataModal() {
    this.els.dataModal.classList.remove('active');
  },

  async exportData(format) {
    const data = await Storage.exportAll();
    const dateStr = new Date().toISOString().split('T')[0];

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      this.downloadFile(blob, `pomosive-backup-${dateStr}.json`);
      showToast('JSON exported', 'success');
    } else if (format === 'csv') {
      const csv = this.toCSV(data.sessions);
      const blob = new Blob([csv], { type: 'text/csv' });
      this.downloadFile(blob, `pomosive-sessions-${dateStr}.csv`);
      showToast('CSV exported', 'success');
    } else if (format === 'md') {
      const md = this.toMarkdown(data.sessions);
      const blob = new Blob([md], { type: 'text/markdown' });
      this.downloadFile(blob, `pomosive-log-${dateStr}.md`);
      showToast('Markdown exported', 'success');
    }
  },

  toCSV(sessions) {
    const headers = ['Date', 'Time', 'Type', 'Duration (min)', 'Rating', 'Note'];
    const rows = sessions.map(s => {
      const date = new Date(s.startedAt);
      return [
        s.date,
        date.toLocaleTimeString(),
        s.type,
        Math.round(s.duration / 60),
        s.rating || '',
        `"${(s.note || '').replace(/"/g, '""')}"`
      ].join(',');
    });
    return [headers.join(','), ...rows].join('\n');
  },

  toMarkdown(sessions) {
    const byDate = {};
    sessions.forEach(s => {
      if (!byDate[s.date]) byDate[s.date] = [];
      byDate[s.date].push(s);
    });

    let md = '# Pomosive Session Log\n\n';
    const sortedDates = Object.keys(byDate).sort().reverse();

    for (const date of sortedDates) {
      const daySessions = byDate[date];
      const workTime = daySessions
        .filter(s => s.type === 'work')
        .reduce((sum, s) => sum + s.duration, 0);
      const hours = Math.floor(workTime / 3600);
      const mins = Math.floor((workTime % 3600) / 60);

      md += `## ${date} — ${hours}h ${mins}m\n\n`;
      md += '| Time | Type | Duration | Rating | Note |\n';
      md += '|------|------|----------|--------|------|\n';

      for (const s of daySessions.sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt))) {
        const time = new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dur = `${Math.round(s.duration / 60)}m`;
        const rating = s.rating ? getRatingLabel(s.rating) : '-';
        md += `| ${time} | ${s.type} | ${dur} | ${rating} | ${s.note || ''} |\n`;
      }
      md += '\n';
    }

    return md;
  },

  downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  async importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const count = await Storage.importAll(data);
      this.renderSessionsList();
      this.updateStats();
      updateChart('today', 'bar');
      showToast(`Imported ${count} sessions`, 'success');
    } catch (err) {
      showToast('Failed to import: ' + err.message, 'warning');
    }

    e.target.value = '';
  },

  async clearAllData() {
    if (!confirm('Are you sure? This will delete all your session history. This cannot be undone.')) {
      return;
    }

    await Storage.clearAll();
    Settings.resetDaily();
    Settings.streak = 0;
    Settings.lastActiveDate = null;

    this.renderSessionsList();
    this.updateStats();
    this.updateUI();
    updateChart('today', 'bar');
    this.hideDataModal();
    showToast('All data cleared', 'info');
  },

  // ============================================
  // KEYBOARD SHORTCUTS
  // ============================================

  handleKeydown(e) {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      if (e.key === 'Escape') {
        e.target.blur();
      }
      return;
    }

    switch (e.key) {
      case ' ':
        e.preventDefault();
        this.play();
        break;
      case 'p':
      case 'Pause':
        e.preventDefault();
        this.pause();
        break;
      case 'r':
      case 'R':
        e.preventDefault();
        this.reset();
        break;
      case 'e':
      case 'E':
        e.preventDefault();
        this.skip();
        break;
      case '1':
        if (this.state === TimerState.RATING) this.selectRating('distracted');
        break;
      case '2':
        if (this.state === TimerState.RATING) this.selectRating('okay');
        break;
      case '3':
        if (this.state === TimerState.RATING) this.selectRating('focused');
        break;
      case '4':
        if (this.state === TimerState.RATING) this.selectRating('flow');
        break;
      case 'd':
      case 'D':
        this.toggleTheme();
        break;
      case '?':
      case '/':
        e.preventDefault();
        this.els.shortcutsHint.classList.toggle('visible');
        break;
      case 'Escape':
        this.els.shortcutsHint.classList.remove('visible');
        this.hideRatingOverlay();
        this.hideDataModal();
        break;
    }
  },

  // ============================================
  // VISIBILITY
  // ============================================

  handleVisibility() {
    if (document.hidden) return;
    // Timer uses timestamp-based drift correction, no manual sync needed
  },

  // ============================================
  // DAILY RESET
  // ============================================

  checkNewDay() {
    const lastDate = Settings.lastActiveDate;
    const today = getDateString();

    if (lastDate && lastDate !== today) {
      // New day - reset daily counters
      Settings.resetDaily();
      showToast('New day! Daily counters reset.', 'info');
    }
  }
};

// ============================================
// TOAST NOTIFICATIONS
// ============================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';

  const icons = {
    info: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="#3498db" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="#27ae60" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    warning: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="#f39c12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
  };

  toast.innerHTML = `${icons[type] || icons.info}<span class="toast-message">${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================
// UTILITIES
// ============================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
