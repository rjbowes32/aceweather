export function drawLineChart(canvas, labels, series, options = {}) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  const hasAxisTitles = Boolean(options.xAxisTitle || options.yAxisTitle);
  const padding = {
    top: hasAxisTitles ? 34 : 24,
    right: 24,
    bottom: hasAxisTitles ? 50 : 36,
    left: hasAxisTitles ? 34 : 24,
  };
  const filteredSeries = series.map((value) => (value == null ? 0 : value));
  const min = Math.min(...filteredSeries);
  const max = Math.max(...filteredSeries);
  const range = max - min || 1;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(7, 7, 7, 0.96)";
  context.fillRect(0, 0, width, height);

  for (let index = 0; index < 4; index += 1) {
    const y = padding.top + ((height - padding.top - padding.bottom) / 3) * index;
    context.strokeStyle = "rgba(255,255,255,0.08)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
  }

  const points = filteredSeries.map((value, index) => {
    const x = padding.left + (index / Math.max(filteredSeries.length - 1, 1)) * (width - padding.left - padding.right);
    const y = padding.top + ((max - value) / range) * (height - padding.top - padding.bottom);
    return { x, y };
  });

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, options.stroke || "#ffffff");
  gradient.addColorStop(1, options.strokeAlt || "#8e8e8e");

  context.strokeStyle = gradient;
  context.lineWidth = 4;
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.stroke();

  context.fillStyle = options.fill || "rgba(255, 255, 255, 0.10)";
  context.beginPath();
  context.moveTo(points[0].x, height - padding.bottom);
  points.forEach((point) => context.lineTo(point.x, point.y));
  context.lineTo(points[points.length - 1].x, height - padding.bottom);
  context.closePath();
  context.fill();

  context.fillStyle = "#f3f3f3";
  context.font = '12px "IBM Plex Mono"';
  const step = Math.max(Math.floor(labels.length / 6), 1);
  labels.forEach((label, index) => {
    if (index % step === 0 || index === labels.length - 1) {
      context.fillText(label, points[index].x - 12, height - 12);
    }
  });

  if (options.yAxisTitle) {
    context.save();
    context.fillStyle = "rgba(190, 190, 190, 0.92)";
    context.font = '11px "IBM Plex Mono"';
    context.translate(12, height / 2);
    context.rotate(-Math.PI / 2);
    context.fillText(options.yAxisTitle, 0, 0);
    context.restore();
  }

  if (options.xAxisTitle) {
    context.fillStyle = "rgba(190, 190, 190, 0.92)";
    context.font = '11px "IBM Plex Mono"';
    context.textAlign = "right";
    context.fillText(options.xAxisTitle, width - padding.right, height - 24);
    context.textAlign = "left";
  }
}

export function downloadCanvas(canvas, filename) {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = filename;
  link.click();
}
