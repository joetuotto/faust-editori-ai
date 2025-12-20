/**
 * Boid Renderer - Canvas rendering for The Secret Life of Boids
 *
 * Renders boids as elegant triangular shapes with trails
 * Shows force vectors and interaction zones when debug mode is enabled
 */

class BoidRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.showTrails = true;
    this.showNames = true;
    this.showForceZones = false;
    this.showConnections = true;
    this.backgroundColor = '#1a1a2e'; // Dark mystical background
  }

  clear() {
    this.ctx.fillStyle = this.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // Draw a single boid as an elegant triangle
  drawBoid(boid) {
    const ctx = this.ctx;
    const pos = boid.position;
    const angle = boid.velocity.angle();

    // Boid size
    const size = 15;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    // Draw glow effect
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2);
    gradient.addColorStop(0, boid.color + '40');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, size * 2, 0, Math.PI * 2);
    ctx.fill();

    // Draw the boid body (triangle pointing in direction of movement)
    ctx.fillStyle = boid.color;
    ctx.strokeStyle = '#ffffff40';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(size, 0); // Nose
    ctx.lineTo(-size * 0.7, -size * 0.5); // Left wing
    ctx.lineTo(-size * 0.4, 0); // Tail indent
    ctx.lineTo(-size * 0.7, size * 0.5); // Right wing
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner highlight
    ctx.fillStyle = boid.color + '80';
    ctx.beginPath();
    ctx.moveTo(size * 0.5, 0);
    ctx.lineTo(-size * 0.2, -size * 0.2);
    ctx.lineTo(-size * 0.1, 0);
    ctx.lineTo(-size * 0.2, size * 0.2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // Draw trail behind boid
  drawTrail(boid) {
    if (!this.showTrails || boid.trail.length < 2) return;

    const ctx = this.ctx;

    ctx.beginPath();
    ctx.moveTo(boid.trail[0].x, boid.trail[0].y);

    for (let i = 1; i < boid.trail.length; i++) {
      ctx.lineTo(boid.trail[i].x, boid.trail[i].y);
    }

    // Gradient trail
    const gradient = ctx.createLinearGradient(
      boid.trail[0].x, boid.trail[0].y,
      boid.trail[boid.trail.length - 1].x, boid.trail[boid.trail.length - 1].y
    );
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(1, boid.color + '60');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Draw name label
  drawName(boid) {
    if (!this.showNames) return;

    const ctx = this.ctx;
    ctx.font = '12px "IBM Plex Mono", monospace';
    ctx.fillStyle = boid.color;
    ctx.textAlign = 'center';
    ctx.fillText(boid.name, boid.position.x, boid.position.y - 25);
  }

  // Draw perception/separation zones for debugging
  drawForceZones(boid) {
    if (!this.showForceZones) return;

    const ctx = this.ctx;
    const pos = boid.position;

    // Perception radius (for alignment & cohesion)
    ctx.strokeStyle = boid.color + '30';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, boid.personality.perceptionRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Separation radius (for repulsion)
    ctx.strokeStyle = '#ff000030';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, boid.personality.separationRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([]);
  }

  // Draw connections between boids (showing cohesion)
  drawConnections(boids) {
    if (!this.showConnections || boids.length < 2) return;

    const ctx = this.ctx;

    for (let i = 0; i < boids.length; i++) {
      for (let j = i + 1; j < boids.length; j++) {
        const distance = boids[i].position.distance(boids[j].position);
        const maxDist = Math.max(
          boids[i].personality.perceptionRadius,
          boids[j].personality.perceptionRadius
        );

        if (distance < maxDist) {
          const opacity = Math.max(0, 1 - distance / maxDist) * 0.3;
          ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(boids[i].position.x, boids[i].position.y);
          ctx.lineTo(boids[j].position.x, boids[j].position.y);
          ctx.stroke();
        }
      }
    }
  }

  // Draw the rules legend
  drawLegend(simulation) {
    const ctx = this.ctx;
    const padding = 20;
    const lineHeight = 22;

    ctx.font = '14px "IBM Plex Mono", monospace';

    // Title
    ctx.fillStyle = '#D4AF37';
    ctx.textAlign = 'left';
    ctx.fillText('The Secret Life of Boids', padding, padding + 15);

    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#ffffff80';

    // Subtitle
    ctx.fillText('Otto Juote Edition', padding, padding + 35);

    // Rules
    const rules = [
      { symbol: '←→', text: 'Separation (Repulsion)', color: '#ff6b6b' },
      { symbol: '→→', text: 'Alignment', color: '#4ecdc4' },
      { symbol: '•→•', text: 'Cohesion (Attraction)', color: '#45b7d1' }
    ];

    ctx.font = '10px "IBM Plex Mono", monospace';
    rules.forEach((rule, i) => {
      const y = padding + 60 + i * lineHeight;
      ctx.fillStyle = rule.color;
      ctx.fillText(rule.symbol, padding, y);
      ctx.fillStyle = '#ffffff60';
      ctx.fillText(rule.text, padding + 35, y);
    });
  }

  // Draw statistics
  drawStats(simulation) {
    const ctx = this.ctx;
    const padding = 20;

    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#ffffff40';
    ctx.textAlign = 'right';

    const avgDist = simulation.getAverageDistance().toFixed(1);
    const center = simulation.getFlockCenter();

    ctx.fillText(`Avg Distance: ${avgDist}px`, this.canvas.width - padding, padding + 15);
    ctx.fillText(`Center: (${center.x.toFixed(0)}, ${center.y.toFixed(0)})`, this.canvas.width - padding, padding + 30);
  }

  // Draw character cards at bottom
  drawCharacterCards(boids) {
    const ctx = this.ctx;
    const cardWidth = 120;
    const cardHeight = 60;
    const padding = 20;
    const startX = (this.canvas.width - (boids.length * cardWidth + (boids.length - 1) * 10)) / 2;

    boids.forEach((boid, i) => {
      const x = startX + i * (cardWidth + 10);
      const y = this.canvas.height - cardHeight - padding;

      // Card background
      ctx.fillStyle = '#00000060';
      ctx.beginPath();
      ctx.roundRect(x, y, cardWidth, cardHeight, 8);
      ctx.fill();

      // Card border
      ctx.strokeStyle = boid.color + '60';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Name
      ctx.font = 'bold 12px "IBM Plex Mono", monospace';
      ctx.fillStyle = boid.color;
      ctx.textAlign = 'center';
      ctx.fillText(boid.name, x + cardWidth / 2, y + 20);

      // Stats
      ctx.font = '9px "IBM Plex Mono", monospace';
      ctx.fillStyle = '#ffffff60';
      const speed = boid.velocity.magnitude().toFixed(1);
      ctx.fillText(`Speed: ${speed}`, x + cardWidth / 2, y + 38);
      ctx.fillText(`Sep: ${boid.personality.separationWeight.toFixed(1)} | Coh: ${boid.personality.cohesionWeight.toFixed(1)}`, x + cardWidth / 2, y + 52);
    });
  }

  // Main render function
  render(simulation) {
    this.clear();

    const boids = simulation.getBoids();

    // Draw connections first (behind everything)
    this.drawConnections(boids);

    // Draw each boid
    for (const boid of boids) {
      this.drawForceZones(boid);
      this.drawTrail(boid);
      this.drawBoid(boid);
      this.drawName(boid);
    }

    // Draw UI elements
    this.drawLegend(simulation);
    this.drawStats(simulation);
    this.drawCharacterCards(boids);
  }

  // Set options
  setOptions(options) {
    if (options.showTrails !== undefined) this.showTrails = options.showTrails;
    if (options.showNames !== undefined) this.showNames = options.showNames;
    if (options.showForceZones !== undefined) this.showForceZones = options.showForceZones;
    if (options.showConnections !== undefined) this.showConnections = options.showConnections;
    if (options.backgroundColor !== undefined) this.backgroundColor = options.backgroundColor;
  }
}

// Export for use in React component
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BoidRenderer };
}

export { BoidRenderer };
