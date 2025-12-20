/**
 * The Secret Life of Boids - Otto Juote Edition
 *
 * Boid simulation implementing Craig Reynolds' classic rules:
 * 1. SEPARATION (Repulsion) - Avoid crowding neighbors
 * 2. ALIGNMENT - Steer towards average heading of neighbors
 * 3. COHESION (Attraction) - Steer towards average position of neighbors
 *
 * Three boids: Otto, Juote, and Taika
 */

class Vector2D {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  add(v) {
    return new Vector2D(this.x + v.x, this.y + v.y);
  }

  subtract(v) {
    return new Vector2D(this.x - v.x, this.y - v.y);
  }

  multiply(scalar) {
    return new Vector2D(this.x * scalar, this.y * scalar);
  }

  divide(scalar) {
    if (scalar === 0) return new Vector2D(0, 0);
    return new Vector2D(this.x / scalar, this.y / scalar);
  }

  magnitude() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalize() {
    const mag = this.magnitude();
    if (mag === 0) return new Vector2D(0, 0);
    return this.divide(mag);
  }

  limit(max) {
    if (this.magnitude() > max) {
      return this.normalize().multiply(max);
    }
    return new Vector2D(this.x, this.y);
  }

  distance(v) {
    return this.subtract(v).magnitude();
  }

  angle() {
    return Math.atan2(this.y, this.x);
  }

  static random(min = -1, max = 1) {
    return new Vector2D(
      min + Math.random() * (max - min),
      min + Math.random() * (max - min)
    );
  }
}

class Boid {
  constructor(name, x, y, color, personality = {}) {
    this.name = name;
    this.position = new Vector2D(x, y);
    this.velocity = Vector2D.random(-2, 2);
    this.acceleration = new Vector2D(0, 0);
    this.color = color;

    // Personality traits affect behavior weights
    this.personality = {
      separationWeight: personality.separationWeight || 1.5,
      alignmentWeight: personality.alignmentWeight || 1.0,
      cohesionWeight: personality.cohesionWeight || 1.0,
      maxSpeed: personality.maxSpeed || 4,
      maxForce: personality.maxForce || 0.1,
      perceptionRadius: personality.perceptionRadius || 100,
      separationRadius: personality.separationRadius || 50
    };

    // Trail for visual effect
    this.trail = [];
    this.maxTrailLength = 20;
  }

  // Rule 1: SEPARATION (Repulsion)
  // Steer to avoid crowding local flockmates
  separate(boids) {
    let steering = new Vector2D(0, 0);
    let count = 0;

    for (const other of boids) {
      if (other === this) continue;

      const distance = this.position.distance(other.position);

      if (distance > 0 && distance < this.personality.separationRadius) {
        // Calculate vector pointing away from neighbor
        let diff = this.position.subtract(other.position);
        diff = diff.normalize();
        diff = diff.divide(distance); // Weight by distance (closer = stronger)
        steering = steering.add(diff);
        count++;
      }
    }

    if (count > 0) {
      steering = steering.divide(count);
      steering = steering.normalize();
      steering = steering.multiply(this.personality.maxSpeed);
      steering = steering.subtract(this.velocity);
      steering = steering.limit(this.personality.maxForce);
    }

    return steering.multiply(this.personality.separationWeight);
  }

  // Rule 2: ALIGNMENT
  // Steer towards the average heading of local flockmates
  align(boids) {
    let steering = new Vector2D(0, 0);
    let count = 0;

    for (const other of boids) {
      if (other === this) continue;

      const distance = this.position.distance(other.position);

      if (distance > 0 && distance < this.personality.perceptionRadius) {
        steering = steering.add(other.velocity);
        count++;
      }
    }

    if (count > 0) {
      steering = steering.divide(count);
      steering = steering.normalize();
      steering = steering.multiply(this.personality.maxSpeed);
      steering = steering.subtract(this.velocity);
      steering = steering.limit(this.personality.maxForce);
    }

    return steering.multiply(this.personality.alignmentWeight);
  }

  // Rule 3: COHESION (Attraction)
  // Steer to move towards the average position of local flockmates
  cohere(boids) {
    let steering = new Vector2D(0, 0);
    let count = 0;

    for (const other of boids) {
      if (other === this) continue;

      const distance = this.position.distance(other.position);

      if (distance > 0 && distance < this.personality.perceptionRadius) {
        steering = steering.add(other.position);
        count++;
      }
    }

    if (count > 0) {
      steering = steering.divide(count);
      // Seek towards the center
      steering = steering.subtract(this.position);
      steering = steering.normalize();
      steering = steering.multiply(this.personality.maxSpeed);
      steering = steering.subtract(this.velocity);
      steering = steering.limit(this.personality.maxForce);
    }

    return steering.multiply(this.personality.cohesionWeight);
  }

  // Apply all three rules
  flock(boids) {
    const separation = this.separate(boids);
    const alignment = this.align(boids);
    const cohesion = this.cohere(boids);

    this.acceleration = this.acceleration.add(separation);
    this.acceleration = this.acceleration.add(alignment);
    this.acceleration = this.acceleration.add(cohesion);
  }

  // Wrap around edges (toroidal space)
  edges(width, height) {
    if (this.position.x > width) this.position.x = 0;
    if (this.position.x < 0) this.position.x = width;
    if (this.position.y > height) this.position.y = 0;
    if (this.position.y < 0) this.position.y = height;
  }

  update() {
    // Update trail
    this.trail.push(new Vector2D(this.position.x, this.position.y));
    if (this.trail.length > this.maxTrailLength) {
      this.trail.shift();
    }

    // Update velocity and position
    this.velocity = this.velocity.add(this.acceleration);
    this.velocity = this.velocity.limit(this.personality.maxSpeed);
    this.position = this.position.add(this.velocity);
    this.acceleration = new Vector2D(0, 0);
  }
}

class BoidSimulation {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.boids = [];
    this.isRunning = false;
    this.animationId = null;

    // Debug info for displaying rules
    this.debugInfo = {
      separation: { active: true, label: 'Separation (Repulsion)' },
      alignment: { active: true, label: 'Alignment' },
      cohesion: { active: true, label: 'Cohesion (Attraction)' }
    };
  }

  initializeOttoJuote() {
    // Clear existing boids
    this.boids = [];

    // The Secret Life of Boids - Three characters
    // Each has unique personality traits

    // Otto - The curious leader, balanced but slightly more cohesive
    const otto = new Boid(
      'Otto',
      this.width * 0.3,
      this.height * 0.5,
      '#D4AF37', // Gold
      {
        separationWeight: 1.2,
        alignmentWeight: 1.0,
        cohesionWeight: 1.5,
        maxSpeed: 3.5,
        maxForce: 0.12,
        perceptionRadius: 120,
        separationRadius: 40
      }
    );

    // Juote - The independent one, stronger separation instinct
    const juote = new Boid(
      'Juote',
      this.width * 0.5,
      this.height * 0.3,
      '#8B4513', // Saddle brown (earthy)
      {
        separationWeight: 2.0,
        alignmentWeight: 0.8,
        cohesionWeight: 1.0,
        maxSpeed: 4.5,
        maxForce: 0.15,
        perceptionRadius: 80,
        separationRadius: 60
      }
    );

    // Taika - The social butterfly, loves cohesion
    const taika = new Boid(
      'Taika',
      this.width * 0.7,
      this.height * 0.6,
      '#4A0E4E', // Deep purple (magical)
      {
        separationWeight: 1.0,
        alignmentWeight: 1.5,
        cohesionWeight: 2.0,
        maxSpeed: 3.0,
        maxForce: 0.1,
        perceptionRadius: 150,
        separationRadius: 35
      }
    );

    this.boids.push(otto, juote, taika);
    return this.boids;
  }

  update() {
    for (const boid of this.boids) {
      boid.flock(this.boids);
      boid.update();
      boid.edges(this.width, this.height);
    }
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  getBoids() {
    return this.boids;
  }

  // Get centroid of the flock
  getFlockCenter() {
    if (this.boids.length === 0) return new Vector2D(0, 0);

    let center = new Vector2D(0, 0);
    for (const boid of this.boids) {
      center = center.add(boid.position);
    }
    return center.divide(this.boids.length);
  }

  // Get average distance between boids
  getAverageDistance() {
    if (this.boids.length < 2) return 0;

    let totalDistance = 0;
    let count = 0;

    for (let i = 0; i < this.boids.length; i++) {
      for (let j = i + 1; j < this.boids.length; j++) {
        totalDistance += this.boids[i].position.distance(this.boids[j].position);
        count++;
      }
    }

    return totalDistance / count;
  }
}

// Export for use in React component
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Vector2D, Boid, BoidSimulation };
}

// Also export for ES6 modules
export { Vector2D, Boid, BoidSimulation };
