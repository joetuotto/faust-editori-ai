/**
 * The Secret Life of Boids - Otto Juote Edition
 *
 * A React component that renders the boid simulation
 * featuring three boids with emergent flocking behavior
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BoidSimulation } from '../../services/visualization/boidPhysics.js';
import { BoidRenderer } from '../../services/visualization/boidRenderer.js';

export default function BoidSimulationPanel({ onClose }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const simulationRef = useRef(null);
  const rendererRef = useRef(null);
  const animationIdRef = useRef(null);

  const [isRunning, setIsRunning] = useState(true);
  const [showTrails, setShowTrails] = useState(true);
  const [showConnections, setShowConnections] = useState(true);
  const [showForceZones, setShowForceZones] = useState(false);

  // Initialize simulation
  const initSimulation = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) return;

    // Set canvas size
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Create simulation and renderer
    simulationRef.current = new BoidSimulation(canvas.width, canvas.height);
    rendererRef.current = new BoidRenderer(canvas);

    // Initialize the three boids
    simulationRef.current.initializeOttoJuote();

    // Apply initial options
    rendererRef.current.setOptions({
      showTrails,
      showConnections,
      showForceZones
    });
  }, [showTrails, showConnections, showForceZones]);

  // Animation loop
  const animate = useCallback(() => {
    if (!simulationRef.current || !rendererRef.current) return;

    if (isRunning) {
      simulationRef.current.update();
    }

    rendererRef.current.render(simulationRef.current);
    animationIdRef.current = requestAnimationFrame(animate);
  }, [isRunning]);

  // Handle window resize
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container || !simulationRef.current) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    simulationRef.current.resize(canvas.width, canvas.height);
  }, []);

  // Reset simulation
  const handleReset = useCallback(() => {
    if (simulationRef.current) {
      simulationRef.current.initializeOttoJuote();
    }
  }, []);

  // Toggle play/pause
  const handleToggleRun = useCallback(() => {
    setIsRunning(prev => !prev);
  }, []);

  // Update renderer options when toggles change
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setOptions({
        showTrails,
        showConnections,
        showForceZones
      });
    }
  }, [showTrails, showConnections, showForceZones]);

  // Initialize on mount
  useEffect(() => {
    initSimulation();

    // Start animation loop
    animationIdRef.current = requestAnimationFrame(animate);

    // Add resize listener
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [initSimulation, animate, handleResize]);

  return (
    <div className="boid-simulation-panel" ref={containerRef}>
      <div className="boid-simulation-header">
        <h3>The Secret Life of Boids</h3>
        <span className="boid-subtitle">Otto Juote Edition</span>
        {onClose && (
          <button className="boid-close-btn" onClick={onClose} title="Close">
            ×
          </button>
        )}
      </div>

      <canvas ref={canvasRef} className="boid-canvas" />

      <div className="boid-controls">
        <button
          className={`boid-btn ${isRunning ? 'active' : ''}`}
          onClick={handleToggleRun}
          title={isRunning ? 'Pause' : 'Play'}
        >
          {isRunning ? '⏸' : '▶'}
        </button>

        <button
          className="boid-btn"
          onClick={handleReset}
          title="Reset"
        >
          ↺
        </button>

        <div className="boid-toggles">
          <label className="boid-toggle">
            <input
              type="checkbox"
              checked={showTrails}
              onChange={(e) => setShowTrails(e.target.checked)}
            />
            <span>Trails</span>
          </label>

          <label className="boid-toggle">
            <input
              type="checkbox"
              checked={showConnections}
              onChange={(e) => setShowConnections(e.target.checked)}
            />
            <span>Connections</span>
          </label>

          <label className="boid-toggle">
            <input
              type="checkbox"
              checked={showForceZones}
              onChange={(e) => setShowForceZones(e.target.checked)}
            />
            <span>Zones</span>
          </label>
        </div>
      </div>

      <div className="boid-rules-info">
        <div className="boid-rule">
          <span className="rule-icon separation">←→</span>
          <span className="rule-text">Separation: Avoid crowding</span>
        </div>
        <div className="boid-rule">
          <span className="rule-icon alignment">→→</span>
          <span className="rule-text">Alignment: Match direction</span>
        </div>
        <div className="boid-rule">
          <span className="rule-icon cohesion">•→•</span>
          <span className="rule-text">Cohesion: Stay together</span>
        </div>
      </div>
    </div>
  );
}
