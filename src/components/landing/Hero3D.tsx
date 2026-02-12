'use client';

import React, { Suspense, useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, Environment, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { useReducedMotion, usePerformance } from '@/hooks';

// ============================================
// 3D Hero Section
// Animated financial network visualization
// Lazy loaded, with graceful degradation
// ============================================

// Particle system for network visualization
function NetworkParticles({ count = 200, lowPerformance = false }) {
  const mesh = useRef<THREE.Points>(null);
  const actualCount = lowPerformance ? Math.floor(count / 2) : count;
  
  const [positions, velocities] = useMemo(() => {
    const positions = new Float32Array(actualCount * 3);
    const velocities = new Float32Array(actualCount * 3);
    
    for (let i = 0; i < actualCount; i++) {
      // Spherical distribution
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 3 + Math.random() * 2;
      
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
      
      // Random velocities for movement
      velocities[i * 3] = (Math.random() - 0.5) * 0.002;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.002;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.002;
    }
    
    return [positions, velocities];
  }, [actualCount]);
  
  useFrame((state) => {
    if (!mesh.current || lowPerformance) return;
    
    const positionAttr = mesh.current.geometry.attributes.position;
    const posArray = positionAttr.array as Float32Array;
    
    for (let i = 0; i < actualCount; i++) {
      const i3 = i * 3;
      
      posArray[i3] += velocities[i3];
      posArray[i3 + 1] += velocities[i3 + 1];
      posArray[i3 + 2] += velocities[i3 + 2];
      
      // Boundary check - keep particles in sphere
      const dist = Math.sqrt(
        posArray[i3] ** 2 + posArray[i3 + 1] ** 2 + posArray[i3 + 2] ** 2
      );
      
      if (dist > 5 || dist < 2) {
        velocities[i3] *= -1;
        velocities[i3 + 1] *= -1;
        velocities[i3 + 2] *= -1;
      }
    }
    
    positionAttr.needsUpdate = true;
    
    // Slow rotation
    mesh.current.rotation.y = state.clock.elapsedTime * 0.05;
  });
  
  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={actualCount}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color="#14b8a6"
        transparent
        opacity={0.8}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// Connection lines between particles
function NetworkLines({ lowPerformance = false }) {
  const linesRef = useRef<THREE.LineSegments>(null);
  const lineCount = lowPerformance ? 30 : 80;
  
  const positions = useMemo(() => {
    const positions = new Float32Array(lineCount * 6); // 2 points per line, 3 coords per point
    
    for (let i = 0; i < lineCount; i++) {
      // Random start point
      const theta1 = Math.random() * Math.PI * 2;
      const phi1 = Math.acos(2 * Math.random() - 1);
      const radius1 = 3 + Math.random() * 1.5;
      
      // Random end point (nearby)
      const theta2 = theta1 + (Math.random() - 0.5) * 0.5;
      const phi2 = phi1 + (Math.random() - 0.5) * 0.5;
      const radius2 = radius1 + (Math.random() - 0.5) * 0.5;
      
      const i6 = i * 6;
      positions[i6] = radius1 * Math.sin(phi1) * Math.cos(theta1);
      positions[i6 + 1] = radius1 * Math.sin(phi1) * Math.sin(theta1);
      positions[i6 + 2] = radius1 * Math.cos(phi1);
      
      positions[i6 + 3] = radius2 * Math.sin(phi2) * Math.cos(theta2);
      positions[i6 + 4] = radius2 * Math.sin(phi2) * Math.sin(theta2);
      positions[i6 + 5] = radius2 * Math.cos(phi2);
    }
    
    return positions;
  }, [lineCount]);
  
  useFrame((state) => {
    if (!linesRef.current) return;
    linesRef.current.rotation.y = state.clock.elapsedTime * 0.03;
    linesRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.1;
  });
  
  return (
    <lineSegments ref={linesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={lineCount * 2}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color="#14b8a6"
        transparent
        opacity={0.15}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
}

// Central glowing orb
function CentralOrb({ lowPerformance = false }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (!meshRef.current) return;
    
    // Subtle breathing animation
    const scale = 1 + Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
    meshRef.current.scale.setScalar(scale);
  });
  
  return (
    <Float
      speed={lowPerformance ? 1 : 2}
      rotationIntensity={0.2}
      floatIntensity={0.3}
    >
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1, lowPerformance ? 1 : 2]} />
        <meshStandardMaterial
          color="#14b8a6"
          emissive="#14b8a6"
          emissiveIntensity={0.5}
          wireframe
          transparent
          opacity={0.3}
        />
      </mesh>
      
      {/* Inner glow */}
      <mesh scale={0.8}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial
          color="#0d9488"
          emissive="#14b8a6"
          emissiveIntensity={0.8}
          transparent
          opacity={0.2}
        />
      </mesh>
    </Float>
  );
}

// Camera controller for subtle movement
function CameraController() {
  const { camera } = useThree();
  
  useFrame((state) => {
    // Subtle camera movement based on time
    camera.position.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.5;
    camera.position.y = Math.cos(state.clock.elapsedTime * 0.1) * 0.3;
    camera.lookAt(0, 0, 0);
  });
  
  return null;
}

// Main scene component
function Scene({ lowPerformance = false }) {
  return (
    <>
      <CameraController />
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={0.5} color="#14b8a6" />
      <pointLight position={[-10, -10, -10]} intensity={0.3} color="#0d9488" />
      
      <CentralOrb lowPerformance={lowPerformance} />
      <NetworkParticles count={200} lowPerformance={lowPerformance} />
      <NetworkLines lowPerformance={lowPerformance} />
      
      {!lowPerformance && (
        <Environment preset="night" />
      )}
    </>
  );
}

// Fallback for loading state
function SceneFallback() {
  return (
    <mesh>
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial color="#14b8a6" wireframe transparent opacity={0.2} />
    </mesh>
  );
}

// Main Hero3D component with performance monitoring
export const Hero3D: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const [dpr, setDpr] = useState(1.5);
  const [lowPerformance, setLowPerformance] = useState(false);
  const [isClient, setIsClient] = useState(false);
  
  // Ensure client-side rendering only
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  // Graceful degradation for reduced motion preference
  if (prefersReducedMotion || !isClient) {
    return <StaticHeroBackground />;
  }
  
  return (
    <div className="absolute inset-0 -z-10">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 45 }}
        dpr={dpr}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        style={{ background: 'transparent' }}
      >
        <PerformanceMonitor
          onIncline={() => setDpr(Math.min(2, dpr + 0.5))}
          onDecline={() => {
            setDpr(Math.max(0.5, dpr - 0.5));
            if (dpr <= 1) setLowPerformance(true);
          }}
        >
          <Suspense fallback={<SceneFallback />}>
            <Scene lowPerformance={lowPerformance} />
          </Suspense>
        </PerformanceMonitor>
      </Canvas>
    </div>
  );
};

// Static fallback for reduced motion / SSR
function StaticHeroBackground() {
  return (
    <div className="absolute inset-0 -z-10">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-surface-400 via-surface-500 to-surface-500" />
      
      {/* Static decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-500/10 blur-[100px]" />
        
        {/* Grid pattern */}
        <div 
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `
              linear-gradient(rgba(20, 184, 166, 0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(20, 184, 166, 0.3) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
          }}
        />
      </div>
    </div>
  );
}

export default Hero3D;

