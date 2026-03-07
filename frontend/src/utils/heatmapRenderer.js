/**
 * Heatmap Renderer Utility
 * Canvas drawing functions for heatmap visualization
 */

// Color interpolation with smoothstep
export const smoothstep = (edge0, edge1, x) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// Get heatmap color based on intensity
export const getHeatColor = (intensity) => {
  if (intensity < 0.25) {
    const t = smoothstep(0, 0.25, intensity);
    return `rgba(${Math.round(59 + t * (34 - 59))}, ${Math.round(130 + t * (197 - 130))}, ${Math.round(246 + t * (94 - 246))}, ${0.3 + t * 0.3})`;
  } else if (intensity < 0.5) {
    const t = smoothstep(0.25, 0.5, intensity);
    return `rgba(${Math.round(34 + t * (234 - 34))}, ${Math.round(197 + t * (179 - 197))}, ${Math.round(94 + t * (8 - 94))}, ${0.6 + t * 0.15})`;
  } else if (intensity < 0.75) {
    const t = smoothstep(0.5, 0.75, intensity);
    return `rgba(${Math.round(234 + t * (249 - 234))}, ${Math.round(179 + t * (115 - 179))}, ${Math.round(8 + t * (22 - 8))}, ${0.75 + t * 0.1})`;
  } else {
    const t = smoothstep(0.75, 1, intensity);
    return `rgba(${Math.round(249 - t * 10)}, ${Math.round(115 - t * 60)}, ${Math.round(22 + t * 20)}, ${0.85 + t * 0.1})`;
  }
};

// Check if point is inside zone polygon (ray casting)
export const isPointInZone = (x, y, zones) => {
  if (!zones || zones.length === 0) return true;
  
  for (const zone of zones) {
    if (!zone.show_heatmap) continue;
    const points = zone.points;
    if (!points || points.length < 3) continue;
    
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x, yi = points[i].y;
      const xj = points[j].x, yj = points[j].y;
      
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
};

// Draw zone borders on canvas
export const drawZoneBorders = (ctx, zones, scale, offsetX, offsetY) => {
  if (!zones || zones.length === 0) return;
  
  zones.forEach(zone => {
    if (!zone.points || zone.points.length < 3) return;
    
    const color = zone.color || '#3b82f6';
    
    ctx.strokeStyle = `${color}80`;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    
    ctx.beginPath();
    zone.points.forEach((pt, i) => {
      const x = offsetX + pt.x * scale;
      const y = offsetY + pt.y * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw zone label
    const centerX = zone.points.reduce((sum, p) => sum + p.x, 0) / zone.points.length;
    const centerY = zone.points.reduce((sum, p) => sum + p.y, 0) / zone.points.length;
    const labelX = offsetX + centerX * scale;
    const labelY = offsetY + centerY * scale;
    
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const textMetrics = ctx.measureText(zone.name);
    ctx.fillStyle = `${color}99`;
    ctx.fillRect(labelX - textMetrics.width/2 - 3, labelY - 7, textMetrics.width + 6, 14);
    
    ctx.fillStyle = '#ffffff';
    ctx.fillText(zone.name, labelX, labelY);
  });
};

// Draw camera labels on canvas
export const drawCameraLabels = (ctx, cameras, scale, offsetX, offsetY) => {
  if (!cameras || cameras.length === 0) return;
  
  cameras.forEach(camera => {
    if (!camera.position_x || !camera.position_y) return;
    
    const x = offsetX + camera.position_x * scale;
    const y = offsetY + camera.position_y * scale;
    
    // Camera dot
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Label background
    const label = camera.name || 'Kamera';
    const count = camera.current_count || 0;
    const text = `${label} (${count})`;
    
    ctx.font = 'bold 10px sans-serif';
    const textMetrics = ctx.measureText(text);
    const padding = 4;
    const labelWidth = textMetrics.width + padding * 2;
    const labelHeight = 16;
    
    // Position label above camera
    const labelX = x - labelWidth / 2;
    const labelY = y - 20;
    
    // Background pill
    ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
    ctx.beginPath();
    ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 8);
    ctx.fill();
    
    // Text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, labelY + labelHeight / 2);
  });
};

// Draw hotspot markers
export const drawHotspots = (ctx, hotspots, scale, offsetX, offsetY) => {
  if (!hotspots || hotspots.length === 0) return;
  
  hotspots.forEach((hotspot, i) => {
    const x = offsetX + hotspot.x * scale;
    const y = offsetY + hotspot.y * scale;
    
    // Hotspot circle
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.stroke();
    
    // Hotspot number
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`#${i + 1}`, x, y);
  });
};

// Draw flow arrows
export const drawFlowArrows = (ctx, cameras, scale, offsetX, offsetY) => {
  if (!cameras || cameras.length === 0) return;
  
  cameras.forEach(camera => {
    if (!camera.position_x || !camera.position_y) return;
    
    const x = offsetX + camera.position_x * scale;
    const y = offsetY + camera.position_y * scale;
    const direction = (camera.direction || 0) * Math.PI / 180;
    const arrowLength = 25;
    
    const endX = x + Math.cos(direction) * arrowLength;
    const endY = y + Math.sin(direction) * arrowLength;
    
    // Arrow line
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    
    // Arrow head
    const headLength = 8;
    const angle = Math.atan2(endY - y, endX - x);
    
    ctx.fillStyle = 'rgba(34, 211, 238, 0.8)';
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - headLength * Math.cos(angle - Math.PI / 6),
      endY - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      endX - headLength * Math.cos(angle + Math.PI / 6),
      endY - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  });
};

// Generate Gaussian heat grid
export const generateHeatGrid = (cameras, width, height, gridSize, zones, useZoneMask) => {
  const cols = Math.ceil(width / gridSize);
  const rows = Math.ceil(height / gridSize);
  const grid = Array(rows).fill(null).map(() => Array(cols).fill(0));
  
  if (!cameras || cameras.length === 0) return { grid, maxHeat: 0 };
  
  let maxHeat = 0;
  
  cameras.forEach(camera => {
    if (!camera.position_x || !camera.position_y) return;
    
    const camX = camera.position_x;
    const camY = camera.position_y;
    const intensity = camera.current_count || 1;
    const radius = camera.influence_radius || 5;
    
    // Calculate affected grid cells
    const startCol = Math.max(0, Math.floor((camX - radius * 2) / gridSize));
    const endCol = Math.min(cols - 1, Math.ceil((camX + radius * 2) / gridSize));
    const startRow = Math.max(0, Math.floor((camY - radius * 2) / gridSize));
    const endRow = Math.min(rows - 1, Math.ceil((camY + radius * 2) / gridSize));
    
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const worldX = (col + 0.5) * gridSize;
        const worldY = (row + 0.5) * gridSize;
        
        // Zone masking check
        if (useZoneMask && !isPointInZone(worldX, worldY, zones)) {
          continue;
        }
        
        const dx = worldX - camX;
        const dy = worldY - camY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Gaussian falloff
        const sigma = radius / 2;
        const gaussian = Math.exp(-(distance * distance) / (2 * sigma * sigma));
        
        grid[row][col] += intensity * gaussian;
        maxHeat = Math.max(maxHeat, grid[row][col]);
      }
    }
  });
  
  return { grid, maxHeat };
};

// Apply Gaussian blur to grid
export const applyGaussianBlur = (grid, passes = 2) => {
  const rows = grid.length;
  const cols = grid[0].length;
  let result = grid.map(row => [...row]);
  
  for (let pass = 0; pass < passes; pass++) {
    const temp = result.map(row => [...row]);
    
    for (let row = 1; row < rows - 1; row++) {
      for (let col = 1; col < cols - 1; col++) {
        const sum = (
          temp[row-1][col-1] + temp[row-1][col] * 2 + temp[row-1][col+1] +
          temp[row][col-1] * 2 + temp[row][col] * 4 + temp[row][col+1] * 2 +
          temp[row+1][col-1] + temp[row+1][col] * 2 + temp[row+1][col+1]
        ) / 16;
        result[row][col] = sum;
      }
    }
  }
  
  return result;
};

// Find hotspots in heat grid
export const findHotspots = (grid, gridSize, threshold = 0.7) => {
  const hotspots = [];
  const rows = grid.length;
  const cols = grid[0].length;
  
  let maxVal = 0;
  grid.forEach(row => row.forEach(val => { if (val > maxVal) maxVal = val; }));
  
  if (maxVal === 0) return hotspots;
  
  for (let row = 1; row < rows - 1; row++) {
    for (let col = 1; col < cols - 1; col++) {
      const val = grid[row][col];
      const normalized = val / maxVal;
      
      if (normalized >= threshold) {
        // Check if local maximum
        const isLocalMax = (
          val >= grid[row-1][col-1] && val >= grid[row-1][col] && val >= grid[row-1][col+1] &&
          val >= grid[row][col-1] && val >= grid[row][col+1] &&
          val >= grid[row+1][col-1] && val >= grid[row+1][col] && val >= grid[row+1][col+1]
        );
        
        if (isLocalMax) {
          hotspots.push({
            x: (col + 0.5) * gridSize,
            y: (row + 0.5) * gridSize,
            intensity: normalized
          });
        }
      }
    }
  }
  
  // Sort by intensity and return top 5
  return hotspots.sort((a, b) => b.intensity - a.intensity).slice(0, 5);
};
