/**
 * Arena Bubble Map Component
 * 
 * Visualizes creators as bubbles sized by points and colored by ring
 * Simple, hook-free implementation for reliable rendering
 */

import React from "react";
import Link from "next/link";

type Ring = "core" | "momentum" | "discovery" | string;

interface Creator {
  twitter_username: string;
  arc_points: number;
  ring?: Ring | null;
}

interface ArenaBubbleMapProps {
  creators: Creator[];
}

/**
 * Simple helper to map points to bubble radius.
 */
function getRadius(
  points: number,
  minPoints: number,
  maxPoints: number
): number {
  if (maxPoints <= minPoints) {
    return 60; // fallback size
  }
  const minSize = 40;
  const maxSize = 110;
  const ratio = (points - minPoints) / (maxPoints - minPoints);
  return minSize + ratio * (maxSize - minSize);
}

/**
 * Simple helper to pick a color based on ring.
 */
function getRingColor(ring?: Ring | null): string {
  const r = (ring || "").toLowerCase();
  if (r === "core") return "bg-purple-500";
  if (r === "momentum") return "bg-blue-500";
  if (r === "discovery") return "bg-emerald-500";
  return "bg-slate-500";
}

/**
 * ArenaBubbleMap
 *
 * NOTE: This component intentionally uses **no React hooks**
 * so that react-hooks ESLint rules cannot be violated.
 * All layout calculations are done synchronously.
 */
export function ArenaBubbleMap({ creators }: ArenaBubbleMapProps) {
  const count = creators.length;

  // Empty state
  if (count === 0) {
    return (
      <div className="relative h-64 w-full rounded-xl bg-gradient-to-b from-slate-950 to-black border border-white/5 flex items-center justify-center">
        <div className="text-center text-sm text-white/60">
          <div className="mb-1 font-semibold text-white/80">
            No creators in this arena yet
          </div>
          <div>Add creators to see the map come alive.</div>
        </div>
      </div>
    );
  }

  const pointsArray = creators.map((c) => c.arc_points);
  const minPoints = Math.min(...pointsArray);
  const maxPoints = Math.max(...pointsArray);

  // Simple positions depending on count.
  // For 1 creator: center
  // 2–4: corners
  // >4: grid layout
  let positionedCreators: Array<
    Creator & { top: string; left: string; radius: number }
  > = [];

  if (count === 1) {
    const c = creators[0];
    positionedCreators = [
      {
        ...c,
        top: "50%",
        left: "50%",
        radius: getRadius(c.arc_points, minPoints, maxPoints),
      },
    ];
  } else if (count >= 2 && count <= 4) {
    const slots = [
      { top: "25%", left: "30%" },
      { top: "25%", left: "70%" },
      { top: "70%", left: "30%" },
      { top: "70%", left: "70%" },
    ];
    positionedCreators = creators.map((c, i) => ({
      ...c,
      ...slots[i]!,
      radius: getRadius(c.arc_points, minPoints, maxPoints),
    }));
  } else {
    // 5+ creators: simple circular arrangement
    const centerTop = 50;
    const centerLeft = 50;
    const radiusCircle = 25;
    positionedCreators = creators.map((c, i) => {
      const angle = (2 * Math.PI * i) / count;
      const top = centerTop + radiusCircle * Math.sin(angle);
      const left = centerLeft + radiusCircle * Math.cos(angle);
      return {
        ...c,
        top: `${top}%`,
        left: `${left}%`,
        radius: getRadius(c.arc_points, minPoints, maxPoints),
      };
    });
  }

  return (
    <div className="relative h-64 w-full rounded-xl bg-gradient-to-b from-slate-950 to-black border border-white/5 overflow-hidden">
      {/* soft radial glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(80,150,255,0.25),_transparent_60%)]" />
      {positionedCreators.map((creator) => {
        const ringColor = getRingColor(creator.ring);
        const size = creator.radius * 2;

        return (
          <Link
            key={creator.twitter_username}
            href={`/portal/arc/creator/${encodeURIComponent(
              creator.twitter_username
            )}`}
            className="absolute flex flex-col items-center justify-center text-center text-xs text-white/80 transition-transform hover:scale-105"
            style={{
              top: creator.top,
              left: creator.left,
              width: size,
              height: size,
              marginTop: -creator.radius,
              marginLeft: -creator.radius,
            }}
            title={`@${creator.twitter_username} · ${creator.arc_points} pts`}
          >
            <div
              className={`w-full h-full rounded-full ${ringColor} bg-opacity-80 flex flex-col items-center justify-center shadow-lg`}
            >
              <div className="font-semibold text-[11px] truncate max-w-[80%]">
                @{creator.twitter_username}
              </div>
              <div className="text-[10px] opacity-80">
                {creator.arc_points} pts
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
