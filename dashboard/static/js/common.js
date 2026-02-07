// Shared UI defaults (no explicit colors)
if (window.Chart) {
  Chart.defaults.responsive = true;
  Chart.defaults.maintainAspectRatio = false;

  Chart.defaults.scale.grid.color = 'rgba(255,255,255,0.06)';
  Chart.defaults.scale.border.color = 'rgba(255,255,255,0.12)';
  Chart.defaults.scale.ticks.color = 'rgba(168,179,207,0.9)';

  Chart.defaults.font.family = "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
  Chart.defaults.font.size = 12;

  Chart.defaults.elements.line.tension = 0.35;
  Chart.defaults.elements.line.borderWidth = 2;
  Chart.defaults.elements.point.radius = 2;
  Chart.defaults.elements.point.hoverRadius = 4;

  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.displayColors = false;
  Chart.defaults.plugins.tooltip.callbacks = {
    label: function(ctx){
      const v = ctx.parsed.y;
      if (v === null || v === undefined) return '';
      if (Number.isFinite(v)) return `${ctx.dataset.label || 'Value'}: ${Math.round(v)} ms`;
      return `${ctx.dataset.label || 'Value'}: ${v}`;
    }
  };
}
