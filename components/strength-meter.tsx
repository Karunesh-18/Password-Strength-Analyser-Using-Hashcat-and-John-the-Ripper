"use client";

import { motion } from "framer-motion";

// Weak -> strong, red through amber to the theme's terminal green.
const SCORE_COLOR = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-400",
  "bg-lime-400",
  "bg-primary",
];

export function StrengthMeter({
  score,
  label,
}: {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{score + 1}/5</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className={`glow-box h-full rounded-full ${SCORE_COLOR[score]}`}
          initial={{ width: 0 }}
          animate={{ width: `${((score + 1) / 5) * 100}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
    </motion.div>
  );
}
