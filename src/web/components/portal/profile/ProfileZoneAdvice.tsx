/**
 * ProfileZoneAdvice Component
 * 
 * Displays personalized advice for improving the user's Zone of Expertise
 * based on their topic scores and inner circle data.
 */

import type { TopicScore, InnerCircleEntry } from './index';
import { computeZoneAdvice, ZoneAdviceItem } from './zone-advice';

// =============================================================================
// TYPES
// =============================================================================

export interface ProfileZoneAdviceProps {
  topics: TopicScore[];
  innerCircle: InnerCircleEntry[];
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get chip styling based on advice type
 */
function getTypeChipStyles(type: ZoneAdviceItem['type']): {
  bg: string;
  text: string;
  label: string;
} {
  switch (type) {
    case 'strength':
      return {
        bg: 'bg-emerald-500/10',
        text: 'text-emerald-400',
        label: 'Strength',
      };
    case 'opportunity':
      return {
        bg: 'bg-amber-500/10',
        text: 'text-amber-400',
        label: 'Opportunity',
      };
    case 'alignment':
      return {
        bg: 'bg-purple-500/10',
        text: 'text-purple-400',
        label: 'Alignment',
      };
    default:
      return {
        bg: 'bg-slate-500/10',
        text: 'text-slate-400',
        label: 'Tip',
      };
  }
}

/**
 * Get icon for advice type
 */
function getTypeIcon(type: ZoneAdviceItem['type']): string {
  switch (type) {
    case 'strength':
      return '💪';
    case 'opportunity':
      return '🎯';
    case 'alignment':
      return '🤝';
    default:
      return '💡';
  }
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface AdviceItemCardProps {
  item: ZoneAdviceItem;
}

function AdviceItemCard({ item }: AdviceItemCardProps) {
  const chipStyles = getTypeChipStyles(item.type);
  const icon = getTypeIcon(item.type);
  
  return (
    <div className="flex gap-3 p-4 rounded-xl bg-akari-cardSoft/50 border border-akari-neon-teal/10 hover:border-akari-neon-teal/30 hover:bg-akari-cardSoft/70 transition-all duration-300">
      {/* Icon */}
      <div className="flex-shrink-0 text-xl">{icon}</div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Type chip + Title */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span
            className={`pill-neon px-3 py-1 text-xs font-semibold uppercase tracking-wide border ${chipStyles.bg} ${chipStyles.text}`}
          >
            {chipStyles.label}
          </span>
          <span className="text-sm font-bold text-akari-text">
            {item.title}
          </span>
        </div>
        
        {/* Description */}
        <p className="text-sm text-akari-muted leading-relaxed">
          {item.description}
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProfileZoneAdvice({ topics, innerCircle }: ProfileZoneAdviceProps) {
  // Compute advice
  const adviceItems = computeZoneAdvice({ topics, innerCircle });
  
  // No advice available
  if (adviceItems.length === 0) {
    return (
      <div className="neon-card neon-hover p-6">
        <p className="text-sm text-akari-muted text-center font-medium">
          Not enough activity to generate insights
        </p>
      </div>
    );
  }

  return (
    <div className="neon-card neon-hover p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">🧭</span>
        <h2 className="text-sm uppercase tracking-wider font-semibold text-gradient-teal">
          How to Improve Your Zone
        </h2>
      </div>
      
      {/* Advice Items */}
      <div className="space-y-3">
        {adviceItems.map((item, index) => (
          <AdviceItemCard key={`${item.type}-${index}`} item={item} />
        ))}
      </div>
      
      {/* Footer hint */}
      <p className="text-xs text-akari-muted text-center pt-2 font-medium">
        Based on your last 30 days
      </p>
    </div>
  );
}

