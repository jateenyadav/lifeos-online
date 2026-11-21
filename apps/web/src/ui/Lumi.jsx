import { useId } from 'react';
import { useMotion } from './prefs.js';

/**
 * Lumi, the LifeOS mascot: a small mint orb with a face, drawn in SVG.
 * Moods: happy, proud, worried, sleepy, thinking. Blinks and floats unless motion is off.
 */
const labels = {
  happy: 'Lumi is happy',
  proud: 'Lumi is proud',
  worried: 'Lumi looks worried',
  sleepy: 'Lumi is sleepy',
  thinking: 'Lumi is thinking',
};

function Eyes({ mood }) {
  if (mood === 'sleepy')
    return (
      <g
        className="lumi-eyes"
        stroke="#04221A"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M37 54 q5 3 10 0" />
        <path d="M63 54 q5 3 10 0" />
      </g>
    );
  if (mood === 'proud')
    return (
      <g
        className="lumi-eyes"
        stroke="#04221A"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M37 55 q5 -6 10 0" />
        <path d="M63 55 q5 -6 10 0" />
      </g>
    );
  const look = mood === 'thinking' ? 3 : 0;
  return (
    <g className="lumi-eyes lumi-blink" fill="#04221A">
      <ellipse cx={42 + look} cy={53 - look} rx="4.2" ry="5.4" />
      <ellipse cx={68 + look} cy={53 - look} rx="4.2" ry="5.4" />
      <circle cx={43.4 + look} cy={51 - look} r="1.4" fill="#fff" />
      <circle cx={69.4 + look} cy={51 - look} r="1.4" fill="#fff" />
    </g>
  );
}

function Mouth({ mood }) {
  const common = {
    stroke: '#04221A',
    strokeWidth: 3,
    strokeLinecap: 'round',
    fill: 'none',
  };
  if (mood === 'worried')
    return (
      <>
        <path d="M36 44 l9 -3 M74 44 l-9 -3" {...common} strokeWidth="2.4" />
        <path d="M47 71 q4 -4 8 0 q4 4 8 0" {...common} />
      </>
    );
  if (mood === 'thinking')
    return <circle cx="58" cy="70" r="3.4" fill="#04221A" />;
  if (mood === 'sleepy')
    return <ellipse cx="55" cy="70" rx="3.5" ry="2.6" fill="#04221A" />;
  return (
    <path
      d={mood === 'proud' ? 'M44 65 q11 12 22 0' : 'M46 66 q9 8 18 0'}
      {...common}
    />
  );
}

export default function Lumi({ mood = 'happy', size = 112, className = '' }) {
  const moving = useMotion();
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className={`lumi ${moving ? 'is-moving' : 'is-still'} ${className}`}
      data-mood={mood}
      width={size}
      height={size}
      viewBox="0 0 110 110"
      role="img"
      aria-label={labels[mood] ?? labels.happy}
    >
      <defs>
        <radialGradient id={`${id}-body`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#B7F7DD" />
          <stop offset="55%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#0FA678" />
        </radialGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#34D399" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#34D399" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse
        className="lumi-shadow"
        cx="55"
        cy="101"
        rx="22"
        ry="4"
        fill="#04221A"
        opacity="0.18"
      />
      <g className="lumi-float">
        <circle cx="55" cy="55" r="50" fill={`url(#${id}-glow)`} />
        <circle cx="55" cy="55" r="36" fill={`url(#${id}-body)`} />
        <ellipse
          cx="42"
          cy="34"
          rx="10"
          ry="6"
          fill="#fff"
          opacity="0.55"
          transform="rotate(-25 42 34)"
        />
        <path
          d="M55 19 q3 -9 10 -10"
          stroke="#0FA678"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="66" cy="9" r="3.5" fill="#B7F7DD" />
        {(mood === 'happy' || mood === 'proud') && (
          <g fill="#FB7185" opacity="0.45">
            <ellipse cx="34" cy="63" rx="5" ry="3" />
            <ellipse cx="76" cy="63" rx="5" ry="3" />
          </g>
        )}
        <Eyes mood={mood} />
        <Mouth mood={mood} />
        {mood === 'sleepy' && (
          <text
            x="84"
            y="30"
            fontSize="13"
            fontWeight="700"
            fill="currentColor"
            className="lumi-z"
          >
            z
          </text>
        )}
        {mood === 'thinking' && (
          <g fill="currentColor" className="lumi-dots">
            <circle cx="86" cy="30" r="2.4" />
            <circle cx="93" cy="22" r="3" />
            <circle cx="101" cy="13" r="3.6" />
          </g>
        )}
      </g>
    </svg>
  );
}

/** Picks Lumi's mood from the day. */
export function pickMood({
  hour,
  overBudget,
  overdue,
  routinesDone,
  routinesTotal,
  loading,
}) {
  if (loading) return 'thinking';
  if (overBudget || overdue) return 'worried';
  if (hour >= 23 || hour < 5) return 'sleepy';
  if (routinesTotal > 0 && routinesDone === routinesTotal) return 'proud';
  return 'happy';
}
