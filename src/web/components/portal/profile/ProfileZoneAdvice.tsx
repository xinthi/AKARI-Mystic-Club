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
    <div className="flex gap-3 p-3 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 transition-colors">
      {/* Icon */}
      <div className="flex-shrink-0 text-lg">{icon}</div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Type chip + Title */}
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ${chipStyles.bg} ${chipStyles.text}`}
          >
            {chipStyles.label}
          </span>
          <span className="text-sm font-semibold text-white">
            {item.title}
          </span>
        </div>
        
        {/* Description */}
        <p className="text-sm text-slate-400 leading-relaxed">
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
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
        <p className="text-sm text-slate-500 text-center">
          Not enough activity to generate insights
        </p>
      </div>
    );
  }
  
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">🧭</span>
        <h2 className="text-sm uppercase tracking-wider text-slate-400">
          How to Improve Your Zone
        </h2>
      </div>
      
      {/* Advice Items */}
      <div className="space-y-2">
        {adviceItems.map((item, index) => (
          <AdviceItemCard key={`${item.type}-${index}`} item={item} />
        ))}
      </div>
      
      {/* Footer hint */}
      <p className="text-[10px] text-slate-600 text-center pt-2">
        Based on your last 30 days
      </p>
    </div>
  );
}

