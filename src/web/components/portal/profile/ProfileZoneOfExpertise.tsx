/**
 * ProfileZoneOfExpertise Component
 * 
 * Displays a radar/spider chart showing topic expertise distribution
 * based on the last 30 days of content.
 */

import { TopicScore, PROFILE_TOPICS, TOPIC_DISPLAY, ProfileTopic } from './index';

// =============================================================================
// TYPES
// =============================================================================

export interface ProfileZoneOfExpertiseProps {
  topics: TopicScore[];
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Convert polar coordinates to SVG cartesian coordinates.
 * Radar chart is centered at (150, 150) with radius up to 120.
 */
function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
): { x: number; y: number } {
  // Start from top (-90 degrees) and go clockwise
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

/**
 * Build SVG path for a polygon given an array of values (0-100).
 */
function buildPolygonPath(
  values: number[],
  maxRadius: number,
  centerX: number,
  centerY: number
): string {
  const points = values.map((value, i) => {
    const angle = (360 / values.length) * i;
    const radius = (value / 100) * maxRadius;
    const { x, y } = polarToCartesian(centerX, centerY, radius, angle);
    return `${x},${y}`;
  });
  return `M ${points.join(' L ')} Z`;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProfileZoneOfExpertise({ topics }: ProfileZoneOfExpertiseProps) {
  const centerX = 150;
  const centerY = 150;
  const maxRadius = 110;
  const gridRings = [25, 50, 75, 100];
  
  // Create a map for quick lookup
  const topicScoreMap = new Map<ProfileTopic, number>();
  for (const t of topics) {
    topicScoreMap.set(t.topic, t.score);
  }
  
  // Get scores in fixed PROFILE_TOPICS order, default to 0
  const orderedScores = PROFILE_TOPICS.map(topic => topicScoreMap.get(topic) ?? 0);
  const hasData = orderedScores.some(s => s > 0);
  
  // Calculate axis positions
  const axisCount = PROFILE_TOPICS.length;
  const axes = PROFILE_TOPICS.map((topic, i) => {
    const angle = (360 / axisCount) * i;
    const labelRadius = maxRadius + 20;
    const axisEnd = polarToCartesian(centerX, centerY, maxRadius, angle);
    const labelPos = polarToCartesian(centerX, centerY, labelRadius, angle);
    const score = topicScoreMap.get(topic) ?? 0;
    const dotPos = polarToCartesian(centerX, centerY, (score / 100) * maxRadius, angle);
    
    return {
      topic,
      display: TOPIC_DISPLAY[topic],
      axisEnd,
      labelPos,
      dotPos,
      score,
      angle,
    };
  });
  
  return (
    <div className="neon-card neon-hover p-6">
      <h2 className="text-sm uppercase tracking-wider font-semibold text-gradient-blue mb-2">
        Zone of Expertise
      </h2>
      <p className="text-xs text-akari-muted mb-6">Based on last 30 days of content</p>
      
      {!hasData ? (
        <div className="h-[300px] flex flex-col items-center justify-center text-akari-muted text-sm gap-2">
          <p className="font-medium">Not enough data yet</p>
          <p className="text-xs text-akari-muted/70">Start posting more so Akari can read your zone</p>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox="0 0 300 300" className="w-full max-w-[300px] mx-auto">
            <defs>
              {/* Gradient for the user polygon */}
              <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.2} />
              </linearGradient>
              {/* Glow filter */}
              <filter id="radarGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            
            {/* Grid rings */}
            {gridRings.map((ring) => (
              <circle
                key={ring}
                cx={centerX}
                cy={centerY}
                r={(ring / 100) * maxRadius}
                fill="none"
                stroke="#334155"
                strokeWidth="0.5"
                strokeDasharray="2,2"
                opacity={0.6}
              />
            ))}
            
            {/* Axis lines */}
            {axes.map(({ topic, axisEnd }) => (
              <line
                key={topic}
                x1={centerX}
                y1={centerY}
                x2={axisEnd.x}
                y2={axisEnd.y}
                stroke="#334155"
                strokeWidth="0.5"
              />
            ))}
            
            {/* User score polygon */}
            <path
              d={buildPolygonPath(orderedScores, maxRadius, centerX, centerY)}
              fill="url(#radarGradient)"
              stroke="#10b981"
              strokeWidth="2"
              filter="url(#radarGlow)"
            />
            
            {/* Score dots */}
            {axes.map(({ topic, dotPos, score }) => (
              score > 0 && (
                <circle
                  key={`dot-${topic}`}
                  cx={dotPos.x}
                  cy={dotPos.y}
                  r="4"
                  fill="#10b981"
                  stroke="#0f172a"
                  strokeWidth="1"
                />
              )
            ))}
            
            {/* Axis labels */}
            {axes.map(({ topic, display, labelPos, angle }) => {
              // Adjust text anchor based on position
              let textAnchor: 'start' | 'middle' | 'end' = 'middle';
              if (angle > 30 && angle < 150) textAnchor = 'start';
              if (angle > 210 && angle < 330) textAnchor = 'end';
              
              return (
                <g key={`label-${topic}`}>
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    textAnchor={textAnchor}
                    dominantBaseline="middle"
                    className="fill-slate-400 text-[9px]"
                  >
                    {display.emoji}
                  </text>
                  <text
                    x={labelPos.x}
                    y={labelPos.y + 12}
                    textAnchor={textAnchor}
                    dominantBaseline="middle"
                    className="fill-slate-500 text-[8px]"
                  >
                    {display.label}
                  </text>
                </g>
              );
            })}
          </svg>
          
          {/* Legend - top topics */}
          <div className="flex flex-wrap justify-center gap-2 mt-3">
            {topics
              .filter(t => t.score > 0)
              .slice(0, 4)
              .map(t => (
                <span
                  key={t.topic}
                  className="px-2 py-1 rounded-full text-[10px] flex items-center gap-1"
                  style={{
                    backgroundColor: `${TOPIC_DISPLAY[t.topic].color}15`,
                    color: TOPIC_DISPLAY[t.topic].color,
                    borderColor: `${TOPIC_DISPLAY[t.topic].color}30`,
                    borderWidth: 1,
                  }}
                >
                  {TOPIC_DISPLAY[t.topic].emoji} {TOPIC_DISPLAY[t.topic].label}
                  <span className="opacity-60">{t.score}</span>
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

