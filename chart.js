/* ============================================
   CHART MODULE
   Custom SVG charts (no external dependencies)
   ============================================ */

class PomosiveChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
    this.width = rect.width;
    this.height = rect.height;
  }

  // Get CSS variable color
  getColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#800020';
  }

  // Bar chart for daily sessions
  drawBarChart(sessions, viewType = 'today') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const padding = { top: 30, right: 20, bottom: 50, left: 50 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, w, h);

    // Group sessions by time period
    let data = [];
    let labels = [];
    let maxVal = 0;

    if (viewType === 'today') {
      // Group by hour
      const hours = {};
      for (let i = 0; i < 24; i++) hours[i] = 0;
      sessions.forEach(s => {
        if (s.type !== 'work') return;
        const hour = new Date(s.startedAt).getHours();
        hours[hour] += s.duration / 60;
      });
      for (let i = 0; i < 24; i++) {
        if (hours[i] > 0 || i % 3 === 0) {
          data.push(hours[i]);
          labels.push(`${i}:00`);
        }
      }
      if (data.length === 0) {
        for (let i = 0; i < 24; i += 3) {
          data.push(0);
          labels.push(`${i}:00`);
        }
      }
    } else if (viewType === 'week') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayTotal = sessions
          .filter(s => s.date === dateStr && s.type === 'work')
          .reduce((sum, s) => sum + s.duration / 60, 0);
        data.push(dayTotal);
        labels.push(days[d.getDay()]);
      }
    } else {
      // Month - group by day
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i += 2) {
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const dayTotal = sessions
          .filter(s => s.date === dateStr && s.type === 'work')
          .reduce((sum, s) => sum + s.duration / 60, 0);
        data.push(dayTotal);
        labels.push(String(i));
      }
    }

    maxVal = Math.max(...data, 1);
    const barCount = data.length;
    const barWidth = Math.min((chartW / barCount) * 0.7, 40);
    const barGap = (chartW - barWidth * barCount) / (barCount - 1 || 1);

    // Draw axes
    ctx.strokeStyle = this.getColor('--border-color');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, h - padding.bottom);
    ctx.lineTo(w - padding.right, h - padding.bottom);
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = this.getColor('--text-tertiary');
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    const ySteps = 4;
    for (let i = 0; i <= ySteps; i++) {
      const y = padding.top + (chartH / ySteps) * i;
      const val = Math.round(maxVal * (1 - i / ySteps));
      ctx.fillText(val + 'm', padding.left - 8, y + 4);

      // Grid line
      if (i > 0) {
        ctx.strokeStyle = this.getColor('--border-color');
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw bars
    const accent = this.getColor('--accent-color');
    const success = this.getColor('--success') || '#27ae60';

    data.forEach((val, i) => {
      const x = padding.left + i * (barWidth + barGap) + (barGap / 2);
      const barH = (val / maxVal) * chartH;
      const y = h - padding.bottom - barH;

      // Bar
      const gradient = ctx.createLinearGradient(0, y, 0, h - padding.bottom);
      gradient.addColorStop(0, accent);
      gradient.addColorStop(1, accent + '40');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
      ctx.fill();

      // Label
      ctx.fillStyle = this.getColor('--text-tertiary');
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + barWidth / 2, h - padding.bottom + 18);

      // Value on top
      if (val > 0) {
        ctx.fillStyle = this.getColor('--text-secondary');
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText(Math.round(val) + 'm', x + barWidth / 2, y - 6);
      }
    });
  }

  // Stacked bar chart showing rating distribution
  drawRatingChart(sessions, viewType = 'today') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const padding = { top: 30, right: 20, bottom: 50, left: 50 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, w, h);

    const ratings = ['distracted', 'okay', 'focused', 'flow'];
    const colors = {
      distracted: '#800020',
      okay: '#f39c12',
      focused: '#3498db',
      flow: '#27ae60'
    };

    let data = [];
    let labels = [];

    if (viewType === 'today') {
      const hours = {};
      for (let i = 0; i < 24; i++) {
        hours[i] = { distracted: 0, okay: 0, focused: 0, flow: 0 };
      }
      sessions.forEach(s => {
        if (s.type !== 'work') return;
        const hour = new Date(s.startedAt).getHours();
        if (hours[hour] && s.rating) {
          hours[hour][s.rating] += s.duration / 60;
        }
      });
      for (let i = 0; i < 24; i += 3) {
        data.push(hours[i]);
        labels.push(`${i}:00`);
      }
    } else if (viewType === 'week') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayData = { distracted: 0, okay: 0, focused: 0, flow: 0 };
        sessions
          .filter(s => s.date === dateStr && s.type === 'work')
          .forEach(s => {
            if (s.rating) dayData[s.rating] += s.duration / 60;
          });
        data.push(dayData);
        labels.push(days[d.getDay()]);
      }
    } else {
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i += 3) {
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const dayData = { distracted: 0, okay: 0, focused: 0, flow: 0 };
        sessions
          .filter(s => s.date === dateStr && s.type === 'work')
          .forEach(s => {
            if (s.rating) dayData[s.rating] += s.duration / 60;
          });
        data.push(dayData);
        labels.push(String(i));
      }
    }

    let maxVal = 0;
    data.forEach(d => {
      const total = Object.values(d).reduce((a, b) => a + b, 0);
      if (total > maxVal) maxVal = total;
    });
    maxVal = Math.max(maxVal, 1);

    const barCount = data.length;
    const barWidth = Math.min((chartW / barCount) * 0.7, 40);
    const barGap = (chartW - barWidth * barCount) / (barCount - 1 || 1);

    // Draw axes
    ctx.strokeStyle = this.getColor('--border-color');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, h - padding.bottom);
    ctx.lineTo(w - padding.right, h - padding.bottom);
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = this.getColor('--text-tertiary');
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    const ySteps = 4;
    for (let i = 0; i <= ySteps; i++) {
      const y = padding.top + (chartH / ySteps) * i;
      const val = Math.round(maxVal * (1 - i / ySteps));
      ctx.fillText(val + 'm', padding.left - 8, y + 4);
      if (i > 0) {
        ctx.strokeStyle = this.getColor('--border-color');
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw stacked bars
    data.forEach((d, i) => {
      const x = padding.left + i * (barWidth + barGap) + (barGap / 2);
      let currentY = h - padding.bottom;

      ratings.forEach(rating => {
        const val = d[rating];
        if (val <= 0) return;
        const barH = (val / maxVal) * chartH;
        const y = currentY - barH;

        ctx.fillStyle = colors[rating] + 'cc';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, [0, 0, 0, 0]);
        ctx.fill();

        currentY = y;
      });

      // Rounded top
      const total = Object.values(d).reduce((a, b) => a + b, 0);
      if (total > 0) {
        const totalH = (total / maxVal) * chartH;
        ctx.fillStyle = 'transparent';
        ctx.beginPath();
        ctx.roundRect(x, h - padding.bottom - totalH, barWidth, 8, [4, 4, 0, 0]);
        ctx.fill();
      }

      // Label
      ctx.fillStyle = this.getColor('--text-tertiary');
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + barWidth / 2, h - padding.bottom + 18);
    });

    // Legend
    const legendY = padding.top - 10;
    let legendX = padding.left;
    ratings.forEach((rating, i) => {
      ctx.fillStyle = colors[rating];
      ctx.beginPath();
      ctx.arc(legendX + 6, legendY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this.getColor('--text-tertiary');
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(rating.charAt(0).toUpperCase() + rating.slice(1), legendX + 14, legendY + 4);
      legendX += 80;
    });
  }
}

// Global chart instance
let pomosiveChart = null;

function initChart() {
  pomosiveChart = new PomosiveChart('statsChart');
}

async function updateChart(viewType = 'today', chartType = 'bar') {
  if (!pomosiveChart) return;

  let sessions = [];
  if (viewType === 'today') {
    sessions = await Storage.getTodaySessions();
  } else if (viewType === 'week') {
    sessions = await Storage.getWeekSessions();
  } else {
    sessions = await Storage.getMonthSessions();
  }

  if (chartType === 'rating') {
    pomosiveChart.drawRatingChart(sessions, viewType);
  } else {
    pomosiveChart.drawBarChart(sessions, viewType);
  }
}
