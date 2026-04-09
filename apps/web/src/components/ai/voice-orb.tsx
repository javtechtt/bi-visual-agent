'use client';

/**
 * VoiceOrb — a visual state indicator for the AI assistant.
 *
 * States:
 *  idle      — subtle breathing pulse, calm ambient glow
 *  listening — active ring animation, brighter glow
 *  thinking  — rotating arc animation, pulsing core
 *  speaking  — rhythmic wave rings, full glow
 *
 * No real voice integration — purely visual. Designed to feel
 * premium, calm, and futuristic.
 */

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface VoiceOrbProps {
  state?: OrbState;
  size?: number;
  label?: string;
  intensity?: number; // 0–1, controls glow brightness
}

export function VoiceOrb({ state = 'idle', size = 80, label, intensity = 0.6 }: VoiceOrbProps) {
  const r = size / 2;
  const coreR = r * 0.35;
  const glowOpacity = 0.1 + intensity * 0.2;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          className="overflow-visible"
        >
          <defs>
            {/* Core gradient */}
            <radialGradient id="orb-core" cx="50%" cy="40%" r="50%">
              <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.9" />
              <stop offset="60%" stopColor="#6366f1" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
            </radialGradient>

            {/* Outer glow */}
            <radialGradient id="orb-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={glowOpacity} />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
            </radialGradient>

            {/* Filters */}
            <filter id="orb-blur">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>

          {/* Ambient glow — always present */}
          <circle cx={r} cy={r} r={r * 0.9} fill="url(#orb-glow)">
            <animate
              attributeName="r"
              values={`${r * 0.85};${r * 0.95};${r * 0.85}`}
              dur={state === 'idle' ? '4s' : '2s'}
              repeatCount="indefinite"
            />
          </circle>

          {/* Listening — expanding ring */}
          {state === 'listening' && (
            <circle cx={r} cy={r} r={coreR * 1.8} fill="none" stroke="#22d3ee" strokeWidth="1" opacity="0">
              <animate attributeName="r" from={coreR * 1.2} to={r * 0.9} dur="1.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.5;0" dur="1.5s" repeatCount="indefinite" />
            </circle>
          )}

          {/* Thinking — rotating arc */}
          {state === 'thinking' && (
            <circle
              cx={r}
              cy={r}
              r={coreR * 1.6}
              fill="none"
              stroke="url(#orb-core)"
              strokeWidth="1.5"
              strokeDasharray={`${coreR * 2} ${coreR * 3}`}
              strokeLinecap="round"
              opacity="0.7"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from={`0 ${r} ${r}`}
                to={`360 ${r} ${r}`}
                dur="1.5s"
                repeatCount="indefinite"
              />
            </circle>
          )}

          {/* Speaking — wave rings */}
          {state === 'speaking' && (
            <>
              {[0, 0.4, 0.8].map((delay) => (
                <circle key={delay} cx={r} cy={r} r={coreR} fill="none" stroke="#22d3ee" strokeWidth="0.8" opacity="0">
                  <animate attributeName="r" from={coreR * 1.1} to={r * 0.85} dur="1.8s" begin={`${delay}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.4;0" dur="1.8s" begin={`${delay}s`} repeatCount="indefinite" />
                </circle>
              ))}
            </>
          )}

          {/* Core orb — always visible */}
          <circle cx={r} cy={r} r={coreR} fill="url(#orb-core)" filter="url(#orb-blur)">
            <animate
              attributeName="r"
              values={
                state === 'thinking'
                  ? `${coreR * 0.9};${coreR * 1.1};${coreR * 0.9}`
                  : `${coreR * 0.95};${coreR * 1.05};${coreR * 0.95}`
              }
              dur={state === 'thinking' ? '1s' : '3s'}
              repeatCount="indefinite"
            />
          </circle>

          {/* Center highlight */}
          <circle cx={r} cy={r * 0.85} r={coreR * 0.3} fill="#ffffff" opacity="0.15" />
        </svg>
      </div>

      {label && (
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      )}
    </div>
  );
}
